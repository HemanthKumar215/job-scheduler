import 'dotenv/config'
import { prisma, Job, JobStatus, WorkerStatus } from 'db-client'
import { executeJob } from './executor.js'
import { runFailoverSupervisor } from './supervisor.js'
import { randomUUID } from 'crypto'
import os from 'os'
import pino from 'pino'
import Redis from 'ioredis'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const WORKER_NAME = process.env.WORKER_NAME || `worker-${os.hostname()}-${randomUUID().slice(0, 8)}`
const CAPACITY = parseInt(process.env.WORKER_CAPACITY || '10', 10)
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '1000', 10)
const HEARTBEAT_INTERVAL_MS = 5000
const SUPERVISOR_INTERVAL_MS = 10000

let workerId = ''
let activeJobsCount = 0
const activeExecutions = new Map<string, Promise<void>>()
let isShuttingDown = false
let pollTimeout: NodeJS.Timeout | null = null
let heartbeatInterval: NodeJS.Timeout | null = null
let supervisorInterval: NodeJS.Timeout | null = null

async function registerWorker() {
  const worker = await prisma.worker.upsert({
    where: { name: WORKER_NAME },
    update: { status: 'ACTIVE', lastHeartbeatAt: new Date(), capacity: CAPACITY },
    create: { name: WORKER_NAME, status: 'ACTIVE', capacity: CAPACITY }
  })
  workerId = worker.id
  logger.info({ workerId, workerName: WORKER_NAME }, 'Worker registered and online')
}

async function sendHeartbeat() {
  if (!workerId || isShuttingDown) return

  try {
    const memoryUsage = process.memoryUsage()
    const loadMetrics = {
      cpuLoad: os.loadavg(),
      freeMemory: os.freemem(),
      totalMemory: os.totalmem(),
      rss: memoryUsage.rss,
      activeJobs: activeJobsCount
    }

    // Use upsert so the worker self-heals if the supervisor deleted/marked its record.
    // Without this, a P2025 "record not found" error silently stops heartbeats
    // after the first supervisor scavenge cycle, making the worker permanently invisible.
    const worker = await prisma.worker.upsert({
      where: { name: WORKER_NAME },
      update: { lastHeartbeatAt: new Date(), status: 'ACTIVE' },
      create: { id: workerId, name: WORKER_NAME, status: 'ACTIVE', capacity: CAPACITY }
    })
    workerId = worker.id

    await prisma.workerHeartbeat.create({
      data: { workerId, loadMetrics }
    })

    // Publish to Redis Pub/Sub for dashboard live updates
    const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    await pubClient.publish('worker-updates', JSON.stringify({
      workerId,
      name: WORKER_NAME,
      status: 'ACTIVE',
      lastHeartbeatAt: new Date(),
      capacity: CAPACITY,
      activeJobs: activeJobsCount
    })).catch(() => {})
    await pubClient.quit().catch(() => {})
  } catch (err) {
    logger.error(err, 'Failed to publish worker heartbeat')
  }
}

async function pollAndClaimJob(): Promise<Job | null> {
  if (isShuttingDown || activeJobsCount >= CAPACITY) {
    return null
  }

  try {
    const claimedJob = await prisma.$transaction(async (tx) => {
      // 1. Fetch first QUEUED job past scheduledAt ordered by priority (DESC) then scheduledAt (ASC)
      // We must cast types correctly since raw queries return arrays of objects
      const jobs = await tx.$queryRawUnsafe<any[]>(`
        SELECT * FROM "Job"
        WHERE "status" = 'QUEUED' AND "scheduledAt" <= NOW()
        ORDER BY "priority" DESC, "scheduledAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)

      if (!jobs || jobs.length === 0) {
        return null
      }

      const targetJob = jobs[0] as Job

      // 2. Check Queue concurrency limit
      const activeQueueCount = await tx.job.count({
        where: {
          queueId: targetJob.queueId,
          status: { in: [JobStatus.CLAIMED, JobStatus.RUNNING] }
        }
      })

      const queue = await tx.queue.findUnique({
        where: { id: targetJob.queueId }
      })

      if (queue && queue.status === 'PAUSED') {
        return null // Queue is paused, do not process
      }

      if (queue && activeQueueCount >= queue.concurrencyLimit) {
        return null // Concurrency limit reached for this queue, try again later
      }

      // 3. Atomic claim transition: QUEUED -> CLAIMED
      const updatedJob = await tx.job.update({
        where: { id: targetJob.id },
        data: { status: JobStatus.CLAIMED }
      })

      return updatedJob
    })

    return claimedJob
  } catch (err) {
    logger.error(err, 'Error during job polling & claiming')
    return null
  }
}

async function pollLoop() {
  if (isShuttingDown) return

  // If we have capacity, try to claim a job
  if (activeJobsCount < CAPACITY) {
    const job = await pollAndClaimJob()
    if (job) {
      activeJobsCount++
      const jobExecutionPromise = executeJob(job, workerId)
        .catch((err) => {
          logger.error({ jobId: job.id, err }, 'Fatal error during job execution wrapper')
        })
        .finally(() => {
          activeExecutions.delete(job.id)
          activeJobsCount--
          // Trigger immediate poll since we just freed a slot
          setImmediate(pollLoop)
        })

      activeExecutions.set(job.id, jobExecutionPromise)
      
      // Attempt to claim another job immediately
      setImmediate(pollLoop)
      return
    }
  }

  // Schedule next poll interval
  pollTimeout = setTimeout(pollLoop, POLL_INTERVAL_MS)
}

async function shutdown() {
  if (isShuttingDown) return
  isShuttingDown = true
  logger.info('SIGTERM/SIGINT received. Initiating graceful shutdown...')

  if (pollTimeout) clearTimeout(pollTimeout)
  if (heartbeatInterval) clearInterval(heartbeatInterval)
  if (supervisorInterval) clearInterval(supervisorInterval)

  // Wait for currently executing jobs
  if (activeExecutions.size > 0) {
    logger.info(`Waiting for ${activeExecutions.size} active jobs to finish...`)
    await Promise.all(Array.from(activeExecutions.values()))
  }

  // Deregister worker state
  if (workerId) {
    await prisma.worker.update({
      where: { id: workerId },
      data: { status: 'INACTIVE', lastHeartbeatAt: new Date() }
    }).catch((err) => logger.error(err, 'Failed to set worker status to INACTIVE on exit'))
  }

  await prisma.$disconnect()
  logger.info('Graceful shutdown completed. Exiting worker process.')
  process.exit(0)
}

async function main() {
  await registerWorker()
  
  // Start loops
  pollLoop()
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
  
  // Supervisor loop: run failover checks (one of the workers handles this, safe to scale horizontally)
  supervisorInterval = setInterval(runFailoverSupervisor, SUPERVISOR_INTERVAL_MS)

  // Periodic heartbeat on startup
  sendHeartbeat()

  // Signal handlers
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    logger.error(err, 'Worker bootstrap crash')
    process.exit(1)
  })
}
export { pollAndClaimJob, registerWorker, workerId }
