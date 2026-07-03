import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { requireOrgRole } from '../middleware/rbac.js'
import { prisma, OrgRole, RetryStrategy } from 'db-client'
import { z } from 'zod'

const router = Router()

const createQueueSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(1),
  concurrencyLimit: z.number().int().min(1),
  retryPolicyId: z.string().uuid()
})

const updateQueueSchema = z.object({
  priority: z.number().int().min(1).optional(),
  concurrencyLimit: z.number().int().min(1).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  retryPolicyId: z.string().uuid().optional()
})

const createRetryPolicySchema = z.object({
  name: z.string().min(1),
  strategy: z.nativeEnum(RetryStrategy),
  baseDelay: z.number().int().min(1),
  maxRetries: z.number().int().min(0),
  maxDelay: z.number().int().min(1)
})

// --- Retry Policies ---

router.get('/retry-policies', async (req: AuthenticatedRequest, res: Response) => {
  const policies = await prisma.retryPolicy.findMany()
  res.json({ retryPolicies: policies })
})

router.post('/retry-policies', async (req: AuthenticatedRequest, res: Response) => {
  const body = createRetryPolicySchema.parse(req.body)
  const policy = await prisma.retryPolicy.create({
    data: body
  })
  res.status(201).json({ retryPolicy: policy })
})

// --- Queues ---

router.get('/projects/:projectId/queues', requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]), async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params
  const queues = await prisma.queue.findMany({
    where: { projectId },
    include: { retryPolicy: true }
  })
  res.json({ queues })
})

router.post('/projects/:projectId/queues', requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params
  const body = createQueueSchema.parse(req.body)

  // Verify retry policy exists
  const policy = await prisma.retryPolicy.findUnique({
    where: { id: body.retryPolicyId }
  })
  if (!policy) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Retry policy not found.'
      }
    })
  }

  // Create queue
  const queue = await prisma.queue.create({
    data: {
      name: body.name,
      priority: body.priority,
      concurrencyLimit: body.concurrencyLimit,
      retryPolicyId: body.retryPolicyId,
      projectId
    }
  })

  res.status(201).json({ queue })
})

router.patch('/queues/:queueId', requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const { queueId } = req.params
  const body = updateQueueSchema.parse(req.body)

  if (body.retryPolicyId) {
    const policy = await prisma.retryPolicy.findUnique({
      where: { id: body.retryPolicyId }
    })
    if (!policy) {
      return res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Retry policy not found.'
        }
      })
    }
  }

  const queue = await prisma.queue.update({
    where: { id: queueId },
    data: body
  })

  res.json({ queue })
})

export default router
