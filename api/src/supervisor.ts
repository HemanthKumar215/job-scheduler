/**
 * API-side Failover Supervisor
 *
 * WHY this lives in the API, not the worker:
 * The worker's supervisor died when we killed the worker container — meaning
 * nobody ever marked stale workers DEAD. Moving it here keeps it alive
 * as long as the API is up, which is the correct invariant for an ops tool:
 * the control plane (API) should outlive any individual worker.
 *
 * Logic:
 * - Every 10s, find Worker records with status=ACTIVE and lastHeartbeatAt > 30s ago
 * - Mark them DEAD
 * - Requeue any CLAIMED/RUNNING jobs that were assigned to the newly-dead workers
 *   (so jobs don't stall forever just because their worker crashed)
 */
import { prisma } from 'db-client'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const HEARTBEAT_TIMEOUT_MS = 30_000
const SUPERVISOR_INTERVAL_MS = 10_000

async function runSupervisorCycle() {
  const cutoffTime = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS)

  try {
    // 1. Mark stale active workers as DEAD
    const deadWorkers = await prisma.worker.findMany({
      where: {
        status: 'ACTIVE',
        lastHeartbeatAt: { lt: cutoffTime }
      }
    })

    if (deadWorkers.length > 0) {
      for (const w of deadWorkers) {
        logger.warn({ workerId: w.id, workerName: w.name }, 'API supervisor: marking worker DEAD (heartbeat timeout)')
        await prisma.worker.update({
          where: { id: w.id },
          data: { status: 'DEAD' }
        })
      }
    }

    // 2. Re-queue orphaned CLAIMED/RUNNING jobs from dead workers
    const deadWorkerIds = deadWorkers.map(w => w.id)
    if (deadWorkerIds.length > 0) {
      const orphaned = await prisma.jobExecution.findMany({
        where: {
          workerId: { in: deadWorkerIds },
          finishedAt: null
        },
        select: { id: true, jobId: true }
      })

      for (const exec of orphaned) {
        await prisma.jobExecution.update({
          where: { id: exec.id },
          data: { finishedAt: new Date(), status: 'FAILED', error: 'Worker heartbeat timeout (API supervisor)' }
        })
        await prisma.job.update({
          where: { id: exec.jobId },
          data: { status: 'QUEUED' }
        })
      }

      if (orphaned.length > 0) {
        logger.warn({ count: orphaned.length }, 'API supervisor: re-queued orphaned jobs from dead workers')
      }
    }
  } catch (err) {
    logger.error(err, 'API supervisor: error in failover cycle')
  }
}

export function startApiSupervisor() {
  // Don't run in test environment
  if (process.env.NODE_ENV === 'test') return
  logger.info(`API failover supervisor started (interval=${SUPERVISOR_INTERVAL_MS}ms, timeout=${HEARTBEAT_TIMEOUT_MS}ms)`)
  setInterval(runSupervisorCycle, SUPERVISOR_INTERVAL_MS)
}
