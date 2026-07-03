import { Router, Request, Response, NextFunction } from 'express'
import { prisma, OrgRole } from 'db-client'
import * as bcrypt from 'bcrypt'
import * as jwt from 'jsonwebtoken'
import { z } from 'zod'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-it-in-production'

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string(),
  lastName: z.string(),
  orgName: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
})

router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.parse(req.body)

    // Check email uniqueness
    const existing = await prisma.user.findUnique({
      where: { email: body.email }
    })
    if (existing) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'A user with this email address is already registered.'
        }
      })
    }

    const passwordHash = await bcrypt.hash(body.password, 10)
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName
      }
    })

    // Auto-create Organization for them
    const orgName = body.orgName || `${body.firstName}'s Workspace`
    const org = await prisma.organization.create({
      data: {
        name: orgName
      }
    })

    // Create Owner membership
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: OrgRole.OWNER
      }
    })

    // Create Project
    const project = await prisma.project.create({
      data: {
        name: 'Default Project',
        organizationId: org.id
      }
    })

    // Create default exponential backoff retry policy
    const policy = await prisma.retryPolicy.create({
      data: {
        name: `${org.name} Exponential Backoff (${org.id})`,
        strategy: 'EXPONENTIAL',
        baseDelay: 2,
        maxRetries: 5,
        maxDelay: 60
      }
    })

    // Create default queue
    const queue = await prisma.queue.create({
      data: {
        name: 'default',
        priority: 5,
        concurrencyLimit: 10,
        projectId: project.id,
        retryPolicyId: policy.id
      }
    })

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' })

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      organization: {
        id: org.id,
        name: org.name
      },
      project: {
        id: project.id,
        name: project.name
      },
      queue: {
        id: queue.id,
        name: queue.name
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } })
    }
    next(error)
  }
})

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({
      where: { email: body.email }
    })

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'The email address or password provided is incorrect.'
        }
      })
    }

    // Get their memberships to return orgs
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: { include: { projects: true } } }
    })

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' })

    res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      memberships: memberships.map((m) => ({
        role: m.role,
        organization: {
          id: m.organization.id,
          name: m.organization.name,
          projects: m.organization.projects.map((p) => ({
            id: p.id,
            name: p.name
          }))
        }
      }))
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } })
    }
    next(error)
  }
})

export default router
