import { Request, Response, NextFunction } from 'express'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

interface RateLimiterOptions {
  limit: number      // Max tokens
  interval: number   // Refill period in seconds
}

export function rateLimiter(options: RateLimiterOptions = { limit: 100, interval: 60 }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Limit by IP address, or authenticated user if exists
    const clientKey = (req as any).user?.id || req.ip || 'anonymous'
    const bucketKey = `rate:limiter:${clientKey}`

    const now = Math.floor(Date.now() / 1000)
    const refillRate = options.limit / options.interval

    try {
      const data = await redis.hgetall(bucketKey)
      
      let tokens = options.limit
      let lastRefilledAt = now

      if (data && data.tokens !== undefined && data.lastRefilledAt !== undefined) {
        const parsedTokens = parseFloat(data.tokens)
        const parsedLastRefilled = parseInt(data.lastRefilledAt, 10)
        
        const delta = Math.max(0, now - parsedLastRefilled)
        const refilled = delta * refillRate
        
        tokens = Math.min(options.limit, parsedTokens + refilled)
        lastRefilledAt = parsedLastRefilled + delta
      }

      if (tokens < 1) {
        res.setHeader('X-RateLimit-Limit', options.limit)
        res.setHeader('X-RateLimit-Remaining', 0)
        res.setHeader('Retry-After', options.interval)
        return res.status(429).json({
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Rate limit exceeded. Please slow down.'
          }
        })
      }

      tokens = tokens - 1

      // Save updated state
      await redis.hset(bucketKey, 'tokens', tokens.toString(), 'lastRefilledAt', lastRefilledAt.toString())
      // Expire keys after double the interval to keep Redis clean
      await redis.expire(bucketKey, options.interval * 2)

      res.setHeader('X-RateLimit-Limit', options.limit)
      res.setHeader('X-RateLimit-Remaining', Math.floor(tokens))

      next()
    } catch (error) {
      // Fallback on Redis failure to not block API
      next()
    }
  }
}
