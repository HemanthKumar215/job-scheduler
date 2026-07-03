import { Request, Response, NextFunction } from 'express'
import { crypto } from 'db-client' // Wait, standard crypto is built-in to Node, so we can use import { randomUUID } from 'crypto'
import { randomUUID } from 'crypto'

export interface RequestWithCorrelation extends Request {
  correlationId?: string
}

export function correlationIdMiddleware(req: RequestWithCorrelation, res: Response, next: NextFunction) {
  // Check if header already contains correlation ID, otherwise generate new one
  const correlationId = (req.header('x-correlation-id') || req.header('X-Correlation-ID') || randomUUID()) as string
  
  req.correlationId = correlationId
  res.setHeader('X-Correlation-ID', correlationId)
  
  next()
}
