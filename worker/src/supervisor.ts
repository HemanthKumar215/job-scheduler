import { prisma, JobStatus, OrgRole } from 'db-client'
import { calculateBackoff, logJobMessage } from './executor.js'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

export async function runFailoverSupervisor() {
  const cutoffTime = new Date(Date.now() - 30 * 1000) // 30 seconds ago

  try {
    // 1. Identify active workers that missed heartbeats and mark them as DEAD
    const deadWorkers = await prisma.worker.findMany({
      where: {
        status: 'ACTIVE',
        lastHeartbeatAt: { lt: cutoffTime }
      }
    })

    for (const worker of deadWorkers) {
      logger.warn({ workerName: worker.name, workerId: worker.id }, 'Worker detected as dead due to heartbeat timeout')
      await prisma.worker.update({
        where: { id: worker.id },
        data: { status: 'DEAD' }
      })
    }

    // 2. Find in-flight executions for DEAD workers
    const activeExecutions = await prisma.jobExecution.findMany({
      where: {
        finishedAt: null,
        OR: [
          { job: { status: JobStatus.CLAIMED } },
          { job: { status: JobStatus.RUNNING } }
        ]
      },
      include: {
        job: {
          include: {
            queue: {
              include: { retryPolicy: true }
            }
          }
        }
      }
    })

    for (const execution of activeExecutions) {
      // Check if the executing worker is DEAD
      const worker = await prisma.worker.findUnique({
        where: { id: execution.workerId }
      })

      if (worker && worker.status === 'DEAD') {
        const job = execution.job
        const correlationId = job.correlationId

        logger.warn({ jobId: job.id, workerId: worker.id, correlationId }, 'Cleaning up orphaned job from dead worker')

        // Close the failed execution record
        await prisma.jobExecution.update({
          where: { id: execution.id },
          data: {
            finishedAt: new Date(),
            status: 'FAILED',
            error: `Worker heartbeat timeout (worker ${worker.name} died)`
          }
        })

        await logJobMessage(
          job.id,
          'ERROR',
          `Orphaned execution cleaned up. Worker ${worker.name} missed heartbeats. Re-evaluating job retry.`,
          correlationId
        )

        // Determine retry vs DLQ
        const attemptCount = job.attemptCount // Since we already incremented on start, this represents current attempt count
        const maxRetries = job.queue.retryPolicy.maxRetries

        if (attemptCount < maxRetries) {
          // Re-enqueue
          const baseDelay = job.queue.retryPolicy.baseDelay
          const maxDelay = job.queue.retryPolicy.maxDelay
          const strategy = job.queue.retryPolicy.strategy
          const backoff = calculateBackoff(strategy, attemptCount, baseDelay, maxDelay)
          const nextScheduledAt = new Date(Date.now() + backoff * 1000)

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
            `Job re-queued for retry in ${backoff} seconds after worker failover (Attempt ${attemptCount}/${maxRetries})`,
            correlationId
          )
        } else {
          // Exhausted, move to DLQ
          await prisma.$transaction([
            prisma.job.update({
              where: { id: job.id },
              data: { status: JobStatus.DLQ }
            }),
            prisma.deadLetterQueue.create({
              data: {
                jobId: job.id,
                reason: `Worker ${worker.name} crashed and retries exhausted`,
                failedAt: new Date(),
                originalPayload: job.payload || {}
              }
            })
          ])

          await logJobMessage(
            job.id,
            'ERROR',
            `Worker crashed and retries exhausted. Quarantined to Dead Letter Queue (DLQ).`,
            correlationId
          )
        }
      }
    }
  } catch (error) {
    logger.error(error, 'Error running failover supervisor loop')
  }
}
