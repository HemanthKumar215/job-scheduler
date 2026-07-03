import 'dotenv/config'
import { PrismaClient, OrgRole, JobStatus } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean old data if any
  await prisma.jobLog.deleteMany({})
  await prisma.deadLetterQueue.deleteMany({})
  await prisma.jobExecution.deleteMany({})
  await prisma.job.deleteMany({})
  await prisma.queue.deleteMany({})
  await prisma.retryPolicy.deleteMany({})
  await prisma.project.deleteMany({})
  await prisma.organizationMember.deleteMany({})
  await prisma.user.deleteMany({})
  await prisma.organization.deleteMany({})
  await prisma.workerHeartbeat.deleteMany({})
  await prisma.worker.deleteMany({})

  // Create User
  const passwordHash = await bcrypt.hash('password123', 10)
  const user = await prisma.user.create({
    data: {
      email: 'owner@example.com',
      passwordHash,
      firstName: 'Owner',
      lastName: 'User'
    }
  })
  console.log(`Created user: ${user.email}`)

  // Create Organization
  const org = await prisma.organization.create({
    data: {
      name: 'Default Org'
    }
  })
  console.log(`Created organization: ${org.name}`)

  // Create Membership
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
  console.log(`Created project: ${project.name}`)

  // Create Retry Policies
  const fixedPolicy = await prisma.retryPolicy.create({
    data: {
      name: 'Fixed backoff',
      strategy: 'FIXED',
      baseDelay: 5,
      maxRetries: 3,
      maxDelay: 5
    }
  })

  const linearPolicy = await prisma.retryPolicy.create({
    data: {
      name: 'Linear backoff',
      strategy: 'LINEAR',
      baseDelay: 5,
      maxRetries: 5,
      maxDelay: 30
    }
  })

  const exponentialPolicy = await prisma.retryPolicy.create({
    data: {
      name: 'Exponential backoff',
      strategy: 'EXPONENTIAL',
      baseDelay: 2,
      maxRetries: 5,
      maxDelay: 60
    }
  })
  console.log('Created retry policies')

  // Create Queues
  const highQueue = await prisma.queue.create({
    data: {
      name: 'high-priority',
      priority: 10,
      concurrencyLimit: 5,
      projectId: project.id,
      retryPolicyId: exponentialPolicy.id
    }
  })

  const defaultQueue = await prisma.queue.create({
    data: {
      name: 'default',
      priority: 5,
      concurrencyLimit: 10,
      projectId: project.id,
      retryPolicyId: linearPolicy.id
    }
  })

  const bulkQueue = await prisma.queue.create({
    data: {
      name: 'bulk-processing',
      priority: 1,
      concurrencyLimit: 2,
      projectId: project.id,
      retryPolicyId: fixedPolicy.id
    }
  })
  console.log('Created queues')

  // Create an initial test job
  const job = await prisma.job.create({
    data: {
      payload: { task: 'test-seed', data: { hello: 'world' } },
      status: JobStatus.QUEUED,
      priority: 5,
      projectId: project.id,
      queueId: defaultQueue.id,
      correlationId: 'seed-correlation-id',
      scheduledAt: new Date()
    }
  })
  console.log(`Created test job with ID: ${job.id}`)

  console.log('Seeding completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
