import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { prisma } from 'db-client'

const router = Router()

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: { lastHeartbeatAt: 'desc' }
    })
    res.json({ workers })
  } catch (err: any) {
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to retrieve worker registry status.',
        details: err.message
      }
    })
  }
})

export default router
