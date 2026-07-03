import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Simple contract test verifying openapi.json exists and is valid JSON
describe('OpenAPI Spec Contract Verification', () => {
  const specPath = path.resolve(__dirname, '../../openapi.json')

  it('should ensure openapi.json exists and is formatted correctly', () => {
    expect(fs.existsSync(specPath)).toBe(true)
    
    const content = fs.readFileSync(specPath, 'utf8')
    const spec = JSON.parse(content)
    
    expect(spec).toHaveProperty('openapi')
    expect(spec).toHaveProperty('info')
    expect(spec.info).toHaveProperty('title')
    expect(spec).toHaveProperty('paths')
  })

  it('should verify all main resource paths exist in the spec', () => {
    const content = fs.readFileSync(specPath, 'utf8')
    const spec = JSON.parse(content)
    const paths = Object.keys(spec.paths)

    // Verify key routes are documented
    expect(paths).toContain('/api/auth/signup')
    expect(paths).toContain('/api/auth/login')
    expect(paths).toContain('/api/projects')
    expect(paths).toContain('/api/projects/{projectId}/queues')
    expect(paths).toContain('/api/queues/{queueId}')
    expect(paths).toContain('/api/projects/{projectId}/jobs')
    expect(paths).toContain('/api/jobs/{jobId}')
    expect(paths).toContain('/api/jobs/{jobId}/logs')
    expect(paths).toContain('/api/jobs/{jobId}/retry')
    expect(paths).toContain('/api/jobs/{jobId}/requeue-dlq')
  })
})
