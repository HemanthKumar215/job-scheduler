import { prisma, Job, JobStatus, LogLevel, RetryStrategy, ExecutionStatus } from 'db-client'
import { validateStateTransition } from './stateMachine.js'
import { parseExpression } from 'cron-parser'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

export function calculateBackoff(
  strategy: RetryStrategy,
  attemptCount: number,
  baseDelay: number, // in seconds
  maxDelay: number   // in seconds
): number {
  let delay = baseDelay

  if (strategy === 'LINEAR') {
    delay = baseDelay * attemptCount
  } else if (strategy === 'EXPONENTIAL') {
    delay = baseDelay * Math.pow(2, attemptCount - 1)
  }

  return Math.min(delay, maxDelay)
}

export async function logJobMessage(jobId: string, level: LogLevel, message: string, correlationId: string) {
  logger.info({ jobId, level, message, correlationId }, `[Job Log] ${message}`)
  await prisma.jobLog.create({
    data: { jobId, level, message, correlationId }
  }).catch((err) => {
    logger.error(err, 'Failed to save job log message')
  })
}

export async function executeJob(job: Job, workerId: string) {
  const correlationId = job.correlationId
  let executionId = ''

  try {
    // 1. Transition: CLAIMED -> RUNNING
    validateStateTransition(job.status, JobStatus.RUNNING)
    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING, attemptCount: { increment: 1 } }
    })
    
    // Log transition
    await logJobMessage(job.id, 'INFO', `Job execution started by worker ${workerId} (Attempt #${job.attemptCount + 1})`, correlationId)

    // Create execution record
    const execution = await prisma.jobExecution.create({
      data: {
        jobId: job.id,
        workerId,
        startedAt: new Date(),
        status: 'COMPLETED' // Default, will change if failed
      }
    })
    executionId = execution.id

    // 2. Perform the Task Work (Mocking task execution based on payload)
    await logJobMessage(job.id, 'INFO', `Running task payload: ${JSON.stringify(job.payload)}`, correlationId)
    
    // Simulate async execution workload
    const executionTimeMs = 1000 // Mock 1 second workload
    await new Promise((resolve) => setTimeout(resolve, executionTimeMs))

    // Check for simulated errors in payload
    if ((job.payload as any)?.shouldFail === true || (job.payload as any)?.task === 'simulate-error') {
      throw new Error((job.payload as any)?.errorMessage || 'Simulated execution failure')
    }

    // 3. Success Lifecycle
    await logJobMessage(job.id, 'INFO', `Task completed successfully in ${executionTimeMs}ms`, correlationId)

    // Update execution status
    await prisma.jobExecution.update({
      where: { id: executionId },
      data: { finishedAt: new Date(), status: 'COMPLETED', output: { success: true } }
    })

    if (job.cronExpression) {
      // It's a recurring cron job: reschedule the SAME job record to next cron interval
      const interval = parseExpression(job.cronExpression)
      const nextRunAt = interval.next().toDate()

      validateStateTransition(JobStatus.RUNNING, JobStatus.QUEUED)
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.QUEUED,
          scheduledAt: nextRunAt,
          attemptCount: 0 // Reset attempt counter for next cycle
        }
      })
      await logJobMessage(job.id, 'INFO', `Recurring job rescheduled. Next run set to: ${nextRunAt.toISOString()}`, correlationId)
    } else {
      // One-off job: complete it
      validateStateTransition(JobStatus.RUNNING, JobStatus.COMPLETED)
      await prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.COMPLETED }
      })
      await logJobMessage(job.id, 'INFO', 'Job execution finalized with status COMPLETED', correlationId)
    }

  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown task error'
    logger.error({ jobId: job.id, error: errorMsg, correlationId }, 'Job execution failed')

    // Update execution record as failed
    if (executionId) {
      await prisma.jobExecution.update({
        where: { id: executionId },
        data: { finishedAt: new Date(), status: 'FAILED', error: errorMsg }
      }).catch((err) => logger.error(err, 'Failed to update execution to FAILED'))
    }

    await logJobMessage(job.id, 'ERROR', `Task execution failed with error: ${errorMsg}`, correlationId)

    // Fetch queue and retry policy config to determine retry route
    const queue = await prisma.queue.findUnique({
      where: { id: job.queueId },
      include: { retryPolicy: true }
    })

    const attemptCount = job.attemptCount + 1 // We already incremented attemptCount in DB
    const maxRetries = queue?.retryPolicy.maxRetries ?? 3

    if (attemptCount < maxRetries) {
      // Reschedule for retry
      const baseDelay = queue?.retryPolicy.baseDelay ?? 5
      const maxDelay = queue?.retryPolicy.maxDelay ?? 60
      const strategy = queue?.retryPolicy.strategy ?? 'FIXED'

      const backoffSeconds = calculateBackoff(strategy, attemptCount, baseDelay, maxDelay)
      const nextScheduledAt = new Date(Date.now() + backoffSeconds * 1000)

      validateStateTransition(JobStatus.RUNNING, JobStatus.QUEUED)
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.QUEUED,
          scheduledAt: nextScheduledAt
        }
      })

      await logJobMessage(
        job.id,
        'WARN',
        `Job scheduled for retry in ${backoffSeconds} seconds (Attempt ${attemptCount}/${maxRetries}) at ${nextScheduledAt.toISOString()}`,
        correlationId
      )
    } else {
      // Retries exhausted: move to Dead Letter Queue (DLQ)
      validateStateTransition(JobStatus.RUNNING, JobStatus.DLQ)
      
      await prisma.$transaction([
        prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.DLQ }
        }),
        prisma.deadLetterQueue.create({
          data: {
            jobId: job.id,
            reason: errorMsg,
            failedAt: new Date(),
            originalPayload: job.payload || {}
          }
        })
      ])

      await logJobMessage(
        job.id,
        'ERROR',
        `Job retries exhausted (${attemptCount}/${maxRetries}). Quarantined into Dead Letter Queue (DLQ).`,
        correlationId
      )
    }
  }
}
