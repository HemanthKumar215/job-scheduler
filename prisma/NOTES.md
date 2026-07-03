# Database Design Notes (Phase 1)

This component defines the database schema for the Distributed Job Scheduler Platform. The database engine is PostgreSQL, accessed via Prisma ORM.

## Key Logic & Design Tradeoffs

### Normalized Schema Structure
We designed a normalized structure to model multi-tenant configurations:
- **Organizations & Projects**: Isolates queues and jobs. Organization memberships map users to organizations with roles (`OWNER`, `ADMIN`, `MEMBER`) for role-based access control (RBAC).
- **Queues & Retry Policies**: Each queue belongs to a project and links to a specific `RetryPolicy`. The queue defines its priority level and max concurrency limit.
- **Jobs & Job Executions**: Holds job properties (payload, attempt counts, status transitions, batch references). The `JobExecution` table tracks every execution attempt for detailed diagnostic histories.
- **Workers & Heartbeats**: Workers publish heartbeats periodically. A supervisor monitors this to trigger failover routines if a worker goes offline.

### Performance & Indexing
To ensure high-volume performance, we created indices for the hottest query paths:
1. `idx_job_poll` on `Job(status, scheduled_at, priority)`: Serves the worker claiming poll which fetches due queued jobs ordered by priority.
2. `idx_worker_heartbeat` on `WorkerHeartbeat(worker_id, timestamp)`: Optimizes supervisor checks for a worker's latest heartbeat timestamp.
3. `idx_dlq_job` on `DeadLetterQueue(job_id, failed_at)`: Optimizes UI and API lookups for failed jobs quarantined in the DLQ.
4. `idx_job_status_project` on `Job(status, project_id)`: Speeds up dashboard filtering of jobs by status and project.

### Growth Strategy for Append-Only Tables (`JobLogs` & `JobExecutions`)
- **Soft References**: The `JobLog` table references `jobId` and `executionId` as simple string fields rather than strict foreign keys. This avoids heavy cascading lock checks when inserting thousands of logs per second and allows fast logging writes.
- **Archival/Partitioning Policies**: Under high volume, `JobLog` and `JobExecution` tables should be partitioned by time (e.g., monthly partitions). Active partitions hold current cycles, while older partitions can be detached and archived to cold storage (e.g. S3 or compressed tables) or deleted after a retention window (e.g., 30 days).
