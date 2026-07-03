import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from './auth.js'
import { prisma, OrgRole } from 'db-client'

export function requireOrgRole(allowedRoles: OrgRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User is not authenticated.'
          }
        })
      }

      // Check if orgId is in params or body or headers
      const orgId = req.params.orgId || req.body.orgId || req.query.orgId as string

      if (!orgId) {
        // If orgId is not direct, check if projectId is provided
        const projectId = req.params.projectId || req.body.projectId || req.query.projectId as string
        if (projectId) {
          const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { organizationId: true }
          })

          if (!project) {
            return res.status(404).json({
              error: {
                code: 'NOT_FOUND',
                message: 'Project not found.'
              }
            })
          }

          return checkMembership(userId, project.organizationId, allowedRoles, res, next)
        }

        // If queueId is provided, look up the queue -> project -> organization
        const queueId = req.params.queueId || req.body.queueId || req.query.queueId as string
        if (queueId) {
          const queue = await prisma.queue.findUnique({
            where: { id: queueId },
            select: { project: { select: { organizationId: true } } }
          })

          if (!queue) {
            return res.status(404).json({
              error: {
                code: 'NOT_FOUND',
                message: 'Queue not found.'
              }
            })
          }

          return checkMembership(userId, queue.project.organizationId, allowedRoles, res, next)
        }

        return res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Organization ID or Project ID is required to authorize this request.'
          }
        })
      }

      return checkMembership(userId, orgId, allowedRoles, res, next)
    } catch (error) {
      next(error)
    }
  }
}

async function checkMembership(
  userId: string,
  orgId: string,
  allowedRoles: OrgRole[],
  res: Response,
  next: NextFunction
) {
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: userId
      }
    }
  })

  if (!member || !allowedRoles.includes(member.role)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action in this organization.'
      }
    })
  }

  next()
}
