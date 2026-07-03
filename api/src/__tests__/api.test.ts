import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { app, server } from '../server.js'
import { prisma } from 'db-client'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

describe('API Auth, Projects & Jobs Endpoints', () => {
  let userToken: string
  let projectId: string
  let queueId: string

  beforeAll(async () => {
    // Clear Redis rate limit keys to avoid blocking test requests
    const keys = await redis.keys('rate:limiter:*')
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  })

  afterAll(async () => {
    // Close servers and database connections
    await prisma.$disconnect()
    await redis.quit()
    server.close()
  })

  it('should successfully sign up a new user and create defaults', async () => {
    const uniqueEmail = `test-${Date.now()}@example.com`
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email: uniqueEmail,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        orgName: 'Test Organization'
      })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe(uniqueEmail)
    expect(res.body).toHaveProperty('project')
    expect(res.body).toHaveProperty('queue')

    userToken = res.body.token
    projectId = res.body.project.id
    queueId = res.body.queue.id
  })

  it('should fail sign up with duplicate email', async () => {
    const email = 'owner@example.com' // Seeded user email
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        email,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('should successfully login an existing user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@example.com',
        password: 'password123'
      })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
  })

  it('should list projects for authorized user', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'owner@example.com',
        password: 'password123'
      })

    const orgId = loginRes.body.memberships[0].organization.id
    const token = loginRes.body.token

    const res = await request(app)
      .get(`/api/projects?orgId=${orgId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('projects')
    expect(res.body.projects.length).toBeGreaterThan(0)
  })

  it('should submit a job with correlation ID and support idempotency', async () => {
    const idempotencyKey = `idemp-${Date.now()}`

    // 1. First submission (Create Job)
    const res1 = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        queueId,
        payload: { task: 'test-api-submission', val: 42 }
      })

    if (res1.status !== 201) {
      console.log('Failing response body:', JSON.stringify(res1.body, null, 2))
    }
    expect(res1.status).toBe(201)
    expect(res1.body).toHaveProperty('job')
    expect(res1.body.job.idempotencyKey).toBe(idempotencyKey)
    expect(res1.body.job.correlationId).toBeDefined()
    expect(res1.headers['x-correlation-id']).toBe(res1.body.job.correlationId)

    const jobId = res1.body.job.id

    // 2. Second submission with SAME idempotency-key (Cache HIT)
    const res2 = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        queueId,
        payload: { task: 'test-api-submission', val: 42 }
      })

    expect(res2.status).toBe(200)
    expect(res2.body.job.id).toBe(jobId)
    expect(res2.headers['x-cache-lookup']).toContain('HIT')
  })

  it('should retrieve list of workers via GET /api/workers', async () => {
    const worker = await prisma.worker.create({
      data: {
        name: 'test-api-worker-' + Date.now(),
        status: 'ACTIVE',
        capacity: 10,
        lastHeartbeatAt: new Date()
      }
    })

    const res = await request(app)
      .get('/api/workers')
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('workers')
    expect(Array.isArray(res.body.workers)).toBe(true)
    expect(res.body.workers.some((w: any) => w.id === worker.id)).toBe(true)
  })

  it('should verify job status queries representing Queue Depth categories', async () => {
    const j1 = await prisma.job.create({
      data: {
        projectId,
        queueId,
        status: 'QUEUED',
        payload: {},
        correlationId: 'depth-test-1'
      }
    })
    const j2 = await prisma.job.create({
      data: {
        projectId,
        queueId,
        status: 'RUNNING',
        payload: {},
        correlationId: 'depth-test-2'
      }
    })
    const j3 = await prisma.job.create({
      data: {
        projectId,
        queueId,
        status: 'CLAIMED',
        payload: {},
        correlationId: 'depth-test-3'
      }
    })

    const res = await request(app)
      .get(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${userToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('jobs')
    const jobIds = res.body.jobs.map((j: any) => j.id)
    expect(jobIds).toContain(j1.id)
    expect(jobIds).toContain(j2.id)
    expect(jobIds).toContain(j3.id)
    
    const targetJobs = res.body.jobs.filter((j: any) => [j1.id, j2.id, j3.id].includes(j.id))
    const statuses = targetJobs.map((j: any) => j.status)
    expect(statuses).toContain('QUEUED')
    expect(statuses).toContain('RUNNING')
    expect(statuses).toContain('CLAIMED')
  })

  it('should support optional job user assignment and filtering by userId', async () => {
    // 1. Fetch user to assign
    const user = await prisma.user.findFirst()
    expect(user).toBeDefined()
    const targetUserId = user!.id

    // 2. Submit job assigned to user
    const resSubmit = await request(app)
      .post(`/api/projects/${projectId}/jobs`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        queueId,
        payload: { task: 'assigned-user-test-job' },
        userId: targetUserId
      })

    expect(resSubmit.status).toBe(201)
    expect(resSubmit.body.job.userId).toBe(targetUserId)

    const assignedJobId = resSubmit.body.job.id

    // 3. Retrieve list and verify it is returned with user details
    const resList = await request(app)
      .get(`/api/projects/${projectId}/jobs?userId=${targetUserId}`)
      .set('Authorization', `Bearer ${userToken}`)

    expect(resList.status).toBe(200)
    const listJobIds = resList.body.jobs.map((j: any) => j.id)
    expect(listJobIds).toContain(assignedJobId)

    const foundJob = resList.body.jobs.find((j: any) => j.id === assignedJobId)
    expect(foundJob.user).toBeDefined()
    expect(foundJob.user.id).toBe(targetUserId)
    expect(foundJob.user.email).toBe(user!.email)
  })
})
