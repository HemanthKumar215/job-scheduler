import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from './auth.js'
import { prisma } from 'db-client'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export async function idempotencyMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const idempotencyKey = req.header('idempotency-key') || req.header('Idempotency-Key')
  const urlMatch = req.originalUrl.match(/\/projects\/([a-zA-Z0-9\-]+)\/jobs/)
  const projectId = req.params.projectId || req.body.projectId || req.query.projectId || (urlMatch ? urlMatch[1] : undefined)

  if (!idempotencyKey) {
    return next()
  }

  if (!projectId) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Idempotency key was provided, but projectId is missing from request body/query.'
      }
    })
  }

  const lockKey = `idempotency:lock:${projectId}:${idempotencyKey}`

  try {
    // 1. Check if job already exists in database
    const existingJob = await prisma.job.findUnique({
      where: {
        projectId_idempotencyKey: {
          projectId,
          idempotencyKey
        }
      }
    })

    if (existingJob) {
      res.setHeader('X-Cache-Lookup', 'HIT - Idempotency')
      return res.status(200).json({
        job: existingJob,
        message: 'Job already exists. Returned cached submission.'
      })
    }

    // 2. Acquire a short-lived Redis lock to prevent race conditions
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'PX', 5000) // 5s expiration
    if (!acquired) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'A duplicate request is already in progress. Please retry.'
        }
      })
    }

    // Wrap res.json to release the lock on finish
    const originalJson = res.json.bind(res)
    res.json = (body: any) => {
      redis.del(lockKey).catch(() => {})
      return originalJson(body)
    }

    next()
  } catch (error) {
    // Clean lock on error
    await redis.del(lockKey).catch(() => {})
    next(error)
  }
}
