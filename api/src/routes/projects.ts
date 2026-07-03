import { Router, Response } from 'express'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { requireOrgRole } from '../middleware/rbac.js'
import { prisma, OrgRole } from 'db-client'
import { z } from 'zod'

const router = Router()

const createOrgSchema = z.object({
  name: z.string().min(1)
})

const createProjectSchema = z.object({
  name: z.string().min(1),
  organizationId: z.string().uuid()
})

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(OrgRole)
})

// --- Organizations ---

router.get('/organizations', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true }
  })
  res.json({ organizations: memberships.map((m) => ({ ...m.organization, role: m.role })) })
})

router.post('/organizations', async (req: AuthenticatedRequest, res: Response) => {
  const body = createOrgSchema.parse(req.body)
  const userId = req.user!.id

  const org = await prisma.organization.create({
    data: { name: body.name }
  })

  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId,
      role: OrgRole.OWNER
    }
  })

  res.status(201).json({ organization: org })
})

router.get('/organizations/:orgId/members', requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER]), async (req: AuthenticatedRequest, res: Response) => {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: req.params.orgId },
    include: { user: true }
  })
  res.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      user: {
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName
      }
    }))
  })
})

router.post('/organizations/:orgId/members', requireOrgRole([OrgRole.OWNER, OrgRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const body = addMemberSchema.parse(req.body)
  const orgId = req.params.orgId

  const userToAdd = await prisma.user.findUnique({
    where: { email: body.email }
  })

  if (!userToAdd) {
    return res.status(404).json({
      error: {
        code: 'USER_NOT_FOUND',
        message: 'A user with this email address does not exist.'
      }
    })
  }

  const existingMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: userToAdd.id
      }
    }
  })

  if (existingMember) {
    return res.status(409).json({
      error: {
        code: 'MEMBER_ALREADY_EXISTS',
        message: 'This user is already a member of the organization.'
      }
    })
  }

  const member = await prisma.organizationMember.create({
    data: {
      organizationId: orgId,
      userId: userToAdd.id,
      role: body.role
    }
  })

  res.status(201).json({ member })
})

// --- Projects ---

router.get('/projects', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id
  const orgId = req.query.orgId as string

  if (!orgId) {
    return res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'orgId query parameter is required.'
      }
    })
  }

  // Validate user is member of this org
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } }
  })

  if (!membership) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You are not a member of this organization.'
      }
    })
  }

  const projects = await prisma.project.findMany({
    where: { organizationId: orgId }
  })

  res.json({ projects })
})

router.post('/projects', async (req: AuthenticatedRequest, res: Response) => {
  const body = createProjectSchema.parse(req.body)
  const userId = req.user!.id

  // Validate user is OWNER or ADMIN
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: body.organizationId, userId } }
  })

  if (!membership || (membership.role !== OrgRole.OWNER && membership.role !== OrgRole.ADMIN)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Only organization owners and admins can create projects.'
      }
    })
  }

  const project = await prisma.project.create({
    data: {
      name: body.name,
      organizationId: body.organizationId
    }
  })

  res.status(201).json({ project })
})

router.delete('/projects/:projectId', requireOrgRole([OrgRole.OWNER]), async (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.params

  await prisma.project.delete({
    where: { id: projectId }
  })

  res.json({ message: 'Project deleted successfully.' })
})

export default router
