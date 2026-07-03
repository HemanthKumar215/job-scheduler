import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { RequestWithCorrelation } from '../middleware/correlation.js'
import { requireOrgRole } from '../middleware/rbac.js'
import { idempotencyMiddleware } from '../middleware/idempotency.js'
import { prisma, OrgRole, JobStatus } from 'db-client'
import { z } from 'zod'
import parseExpression from 'cron-parser'

const router = Router()

const createJobSchema = z.object({
  queueId: z.string().uuid(),
  payload: z.any(),
  priority: z.number().int().min(1).optional(),
  scheduledAt: z.string().optional(),
  cronExpression: z.string().optional(),
  batchId: z.string().optional()
})

const getJobsQuerySchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  queueId: z.string().uuid().optional(),
  batchId: z.string().optional(),
  correlationId: z.string().optional(),
  dateRangeStart: z.string().optional(),
  dateRangeEnd: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('20')
})

// --- Job Submission (with Idempotency and Correlation ID) ---
router.post(
  '/projects/:projectId/jobs',
  requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]),
  idempotencyMiddleware,
  async (req: AuthenticatedRequest & RequestWithCorrelation, res: Response) => {
    try {
      const { projectId } = req.params
      const body = createJobSchema.parse(req.body)
      const correlationId = req.correlationId || 'unknown'

      // Validate queue belongs to the project
      const queue = await prisma.queue.findFirst({
        where: { id: body.queueId, projectId }
      })
      if (!queue) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Target Queue not found in this project.'
          }
        })
      }

      // Validate cron expression if provided
      if (body.cronExpression) {
        try {
          parseExpression(body.cronExpression)
        } catch (err) {
          return res.status(400).json({
            error: {
              code: 'INVALID_CRON',
              message: 'The cron expression provided is invalid.'
            }
          })
        }
      }

      // Calculate initial scheduledAt
      let scheduledAt = new Date()
      if (body.scheduledAt) {
        scheduledAt = new Date(body.scheduledAt)
        if (isNaN(scheduledAt.getTime())) {
          return res.status(400).json({
            error: {
              code: 'INVALID_DATE',
              message: 'The scheduledAt date format is invalid.'
            }
          })
        }
      } else if (body.cronExpression) {
        // Scheduled cron job first run
        const interval = parseExpression(body.cronExpression)
        scheduledAt = interval.next().toDate()
      }

      const idempotencyKey = (req.header('idempotency-key') || req.header('Idempotency-Key')) as string | undefined

      const job = await prisma.job.create({
        data: {
          payload: body.payload || {},
          status: JobStatus.QUEUED,
          priority: body.priority !== undefined ? body.priority : queue.priority,
          projectId,
          queueId: queue.id,
          scheduledAt,
          cronExpression: body.cronExpression || null,
          batchId: body.batchId || null,
          idempotencyKey: idempotencyKey || null,
          correlationId
        }
      })

      // Log initial submission
      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: 'INFO',
          message: `Job submitted to queue '${queue.name}' with status 'QUEUED' and correlation ID '${correlationId}'`,
          correlationId
        }
      })

      res.status(201).json({ job })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } })
      }
      throw error
    }
  }
)

// --- Paginated and Filterable Job List ---
router.get(
  '/projects/:projectId/jobs',
  requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params
    const query = getJobsQuerySchema.parse(req.query)

    const where: any = { projectId }

    if (query.status) where.status = query.status
    if (query.queueId) where.queueId = query.queueId
    if (query.batchId) where.batchId = query.batchId
    if (query.correlationId) where.correlationId = query.correlationId

    if (query.dateRangeStart || query.dateRangeEnd) {
      where.createdAt = {}
      if (query.dateRangeStart) where.createdAt.gte = new Date(query.dateRangeStart)
      if (query.dateRangeEnd) where.createdAt.lte = new Date(query.dateRangeEnd)
    }

    const skip = (query.page - 1) * query.limit

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: { queue: { select: { name: true } } }
      }),
      prisma.job.count({ where })
    ])

    res.json({
      jobs,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit)
      }
    })
  }
)

// --- Batch Status Aggregation ---
router.get(
  '/projects/:projectId/batches/:batchId',
  requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, batchId } = req.params

    const jobs = await prisma.job.findMany({
      where: { projectId, batchId },
      select: { status: true }
    })

    if (jobs.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No jobs found in this batch.'
        }
      })
    }

    const statusCounts = jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1
      return acc;
    }, {} as Record<JobStatus, number>)

    const completedCount = statusCounts[JobStatus.COMPLETED] || 0
    const failedCount = statusCounts[JobStatus.FAILED] || 0
    const dlqCount = statusCounts[JobStatus.DLQ] || 0
    const runningCount = statusCounts[JobStatus.RUNNING] || 0
    const claimedCount = statusCounts[JobStatus.CLAIMED] || 0
    const queuedCount = statusCounts[JobStatus.QUEUED] || 0

    res.json({
      batchId,
      totalJobs: jobs.length,
      progressPercent: Math.round(((completedCount) / jobs.length) * 100),
      summary: {
        queued: queuedCount,
        claimed: claimedCount,
        running: runningCount,
        completed: completedCount,
        failed: failedCount,
        dlq: dlqCount
      }
    })
  }
)

// --- Job Detail ---
router.get(
  '/jobs/:jobId',
  async (req: AuthenticatedRequest, res: Response) => {
    const { jobId } = req.params

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        queue: { select: { name: true } },
        executions: { orderBy: { startedAt: 'desc' } },
        dlqEntries: true
      }
    })

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found.'
        }
      })
    }

    res.json({ job })
  }
)

// --- Job Logs ---
router.get(
  '/jobs/:jobId/logs',
  async (req: AuthenticatedRequest, res: Response) => {
    const { jobId } = req.params

    const logs = await prisma.jobLog.findMany({
      where: { jobId },
      orderBy: { timestamp: 'asc' }
    })

    res.json({ logs })
  }
)

// --- Requeue/Retry Failed Job ---
router.post(
  '/jobs/:jobId/retry',
  async (req: AuthenticatedRequest, res: Response) => {
    const { jobId } = req.params

    const job = await prisma.job.findUnique({
      where: { id: jobId }
    })

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found.'
        }
      })
    }

    if (job.status !== JobStatus.FAILED && job.status !== JobStatus.DLQ) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `Only FAILED or DLQ jobs can be retried. Current status is ${job.status}.`
        }
      })
    }

    // Reset attempts and move back to QUEUED
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.QUEUED,
        attemptCount: 0,
        scheduledAt: new Date()
      }
    })

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: `Job manually re-queued from status ${job.status} to QUEUED. Resetting attempts count.`,
        correlationId: job.correlationId
      }
    })

    res.json({ job: updatedJob, message: 'Job successfully scheduled for retry.' })
  }
)

// --- Re-enqueue DLQ Job ---
router.post(
  '/jobs/:jobId/requeue-dlq',
  async (req: AuthenticatedRequest, res: Response) => {
    const { jobId } = req.params

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { dlqEntries: true }
    })

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found.'
        }
      })
    }

    if (job.status !== JobStatus.DLQ) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: `Only DLQ jobs can be re-enqueued. Current status is ${job.status}.`
        }
      })
    }

    // Update job and clean up DLQ entries
    const [updatedJob] = await prisma.$transaction([
      prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.QUEUED,
          attemptCount: 0,
          scheduledAt: new Date()
        }
      }),
      prisma.deadLetterQueue.deleteMany({
        where: { jobId }
      })
    ])

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: 'INFO',
        message: 'Job manually re-queued from Dead Letter Queue (DLQ) to QUEUED.',
        correlationId: job.correlationId
      }
    })

    res.json({ job: updatedJob, message: 'Job successfully moved from DLQ to QUEUED.' })
  }
)

export default router
