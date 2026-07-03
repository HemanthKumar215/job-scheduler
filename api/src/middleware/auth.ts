import { Request, Response, NextFunction } from 'express'
import * as jwt from 'jsonwebtoken'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-it-in-production'

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (authHeader) {
    const token = authHeader.split(' ')[1]

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Invalid or expired authentication token.'
          }
        })
      }

      const payload = decoded as { id: string; email: string }
      req.user = {
        id: payload.id,
        email: payload.email
      }
      next()
    })
  } else {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token is missing.'
      }
    })
  }
}
