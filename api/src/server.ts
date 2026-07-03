import 'dotenv/config'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import http from 'http'
import { pinoHttp } from 'pino-http'
import pino from 'pino'

import authRouter from './routes/auth.js'
import projectsRouter from './routes/projects.js'
import queuesRouter from './routes/queues.js'
import jobsRouter from './routes/jobs.js'

import { authenticateJWT } from './middleware/auth.js'
import { correlationIdMiddleware } from './middleware/correlation.js'
import { rateLimiter } from './middleware/rateLimiter.js'
import { initSocketIO } from './socket.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const app = express()
const server = http.createServer(app)

// Initializations
initSocketIO(server)

app.use(cors())
app.use(express.json())
app.use(correlationIdMiddleware)

// Logging middleware
app.use(
  pinoHttp({
    logger,
    customProps: (req: any) => ({
      correlationId: req.correlationId
    }),
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        ip: req.ip
      }),
      res: (res) => ({
        statusCode: res.statusCode
      })
    }
  })
)

// Apply global rate limiting (e.g. 100 requests per minute)
app.use(rateLimiter({ limit: 120, interval: 60 }))

// Public Routes
app.use('/api/auth', authRouter)

// Protected Routes (Authenticate JWT)
app.use('/api', authenticateJWT, projectsRouter)
app.use('/api', authenticateJWT, queuesRouter)
app.use('/api', authenticateJWT, jobsRouter)

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req as any).correlationId
  logger.error({ err, correlationId }, 'API Unhandled Error')

  res.status(err.status || 500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred on the server.',
      correlationId
    }
  })
})

const PORT = process.env.PORT || 3000

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`API Server running on port ${PORT}`)
  })
}

export { app, server }
