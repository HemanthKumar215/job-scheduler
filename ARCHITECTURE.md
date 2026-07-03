# Architecture Documentation

This document describes the system architecture, entity relationships (ER), and job execution sequence lifecycles.

## 1. System Architecture Diagram
The system follows a distributed monorepo microservice layout:
- **React Frontend**: Hydrates analytics charts and connects via WebSockets for live status updates.
- **Express API Instance(s)**: Handles user access, job submissions, rate limiting, and project configurations.
- **Postgres Database**: Acts as the transactional, persistent source of truth.
- **Redis Cache/PubSub**: Manages rate-limiting buckets, idempotency request locks, and streams real-time updates to connected Socket.IO sockets.
- **Worker Daemon pool**: Scaleable workers pulling jobs concurrently and processing payloads.

```mermaid
graph TD
    Client[React Frontend] <-->|HTTP / WS| API[Express API Server]
    API <-->|SQL Queries| DB[(Postgres DB)]
    API <-->|Cache / Locks / PubSub| Redis[(Redis)]
    
    WorkerPool[Worker Pool Daemon] <-->|Heartbeats / SKIP LOCKED Claim| DB
    WorkerPool <-->|PubSub Updates| Redis
    WorkerPool -->|Write Logs| DB
```

## 2. Entity-Relationship (ER) Diagram
Normalized database schema defined inside Prisma:

```mermaid
erDiagram
    User {
        String id PK
        String email
        String passwordHash
        String firstName
        String lastName
        DateTime createdAt
    }
    Organization {
        String id PK
        String name
        DateTime createdAt
    }
    OrganizationMember {
        String id PK
        String organizationId FK
        String userId FK
        String role
    }
    Project {
        String id PK
        String name
        String organizationId FK
    }
    RetryPolicy {
        String id PK
        String name
        String strategy
        Int baseDelay
        Int maxRetries
        Int maxDelay
    }
    Queue {
        String id PK
        String name
        Int priority
        Int concurrencyLimit
        String status
        String retryPolicyId FK
        String projectId FK
    }
    Job {
        String id PK
        Json payload
        String status
        Int priority
        String projectId FK
        String queueId FK
        DateTime scheduledAt
        String cronExpression
        Int attemptCount
        String idempotencyKey
        String batchId
        String correlationId
    }
    JobExecution {
        String id PK
        String jobId FK
        String workerId FK
        DateTime startedAt
        DateTime finishedAt
        String status
        String error
        Json output
    }
    Worker {
        String id PK
        String name
        String status
        DateTime lastHeartbeatAt
        Int capacity
    }
    WorkerHeartbeat {
        String id PK
        String workerId FK
        DateTime timestamp
        Json loadMetrics
    }
    JobLog {
        String id PK
        String jobId
        String level
        String message
        DateTime timestamp
        String correlationId
    }
    DeadLetterQueue {
        String id PK
        String jobId FK
        String reason
        DateTime failedAt
        Json originalPayload
    }

    User ||--o{ OrganizationMember : "has"
    Organization ||--o{ OrganizationMember : "has"
    Organization ||--o{ Project : "owns"
    Project ||--o{ Queue : "defines"
    Project ||--o{ Job : "holds"
    RetryPolicy ||--o{ Queue : "defines"
    Queue ||--o{ Job : "routes"
    Job ||--o{ JobExecution : "tracks"
    Job ||--o{ DeadLetterQueue : "quarantines"
    Worker ||--o{ WorkerHeartbeat : "reports"
```

## 3. Job Lifecycle Sequence Diagram
The end-to-end execution lifecycle transitions:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Dashboard
    participant API as Express API
    participant DB as Postgres Database
    participant Redis as Redis Cache
    participant Worker as Worker Process

    Client->>API: POST /api/projects/:projectId/jobs (payload, queueId, Idempotency-Key)
    API->>Redis: Check Idempotency key lock
    alt Key exists (Conflict / HIT)
        API-->>Client: Return existing Job response
    else Key free (MISS)
        API->>Redis: Acquire lock (5s)
        API->>DB: INSERT INTO "Job" (status: QUEUED, correlationId: UUID)
        API->>Redis: Release lock
        API-->>Client: Return 201 Created (Job ID, correlationId)
    end

    loop Poll Interval (e.g. 1s)
        Worker->>DB: BEGIN Transaction; SELECT FOR UPDATE SKIP LOCKED WHERE status = QUEUED & scheduledAt <= NOW()
        alt Job available & Concurrency Limits NOT hit
            DB-->>Worker: Return Job row
            Worker->>DB: UPDATE Job status = CLAIMED; COMMIT
        else Concurrency Limit or Queue Paused
            Worker->>DB: ROLLBACK Transaction
        end
    end

    Worker->>DB: UPDATE Job status = RUNNING & INSERT JobExecution (startedAt)
    Worker->>DB: INSERT JobLog (correlationId, level: INFO, "Executing payload...")
    
    alt Task Success
        Worker->>DB: UPDATE Job status = COMPLETED & UPDATE JobExecution (status: COMPLETED)
        Worker->>Redis: Publish job-updates channel
    else Task Fails (Attempts < MaxRetries)
        Worker->>DB: Calculate retry delay & UPDATE Job status = QUEUED, scheduledAt = Future
        Worker->>DB: UPDATE JobExecution (status: FAILED, error: trace)
    else Task Fails (Attempts >= MaxRetries)
        Worker->>DB: UPDATE Job status = DLQ & INSERT DeadLetterQueue record
        Worker->>DB: UPDATE JobExecution (status: FAILED, error: trace)
        Worker->>Redis: Publish job-updates channel
    end
```
