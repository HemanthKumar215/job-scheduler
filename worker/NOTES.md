# Worker Component Notes (Phase 4)

This component contains the worker daemon daemon responsible for polling and executing jobs.

## Key Logic & Design Decisions

### 1. Claiming Strategy
We perform claiming inside a transaction wrapper:
- **Query**:
  ```sql
  SELECT * FROM "Job"
  WHERE "status" = 'QUEUED' AND "scheduledAt" <= NOW()
  ORDER BY "priority" DESC, "scheduledAt" ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
  ```
- **Atomicity**:
  1. The database selects the first due job and locks its row (`FOR UPDATE`).
  2. Any other workers running the same query will see this row as locked and skip it (`SKIP LOCKED`), avoiding serialization blocks.
  3. Inside the transaction, the worker queries `count` of jobs in the same queue matching `CLAIMED` or `RUNNING` status and compares it with the queue's `concurrencyLimit`.
  4. If the queue is paused or the concurrency limit is reached, the transaction aborts (returns null), freeing the lock.
  5. If valid, it transitions the job status to `CLAIMED` and commits.
  This represents a highly reliable, concurrent scheduler pattern.

### 2. State Machine Transitions
Job status follows strict rules:
- `QUEUED` -> `CLAIMED` (worker polls)
- `CLAIMED` -> `RUNNING` (worker starts execution)
- `RUNNING` -> `COMPLETED` (success)
- `RUNNING` -> `FAILED` (failure)
- `FAILED` -> `QUEUED` (retry backoff scheduled)
- `FAILED` -> `DLQ` (retries exhausted)
- `DLQ` -> `QUEUED` (manual replay)

### 3. Retry Backoff Mathematics
We support three retry policies:
- **Fixed**: `baseDelay`
- **Linear**: `baseDelay * attemptCount`
- **Exponential**: `baseDelay * Math.pow(2, attemptCount - 1)`
All calculated delays are capped by the policy's `maxDelay` before update.

### 4. Heartbeat & Failover Supervisor Choices
- **Heartbeats**: Every 5 seconds, each worker updates its `lastHeartbeatAt` and logs CPU/Memory load to `WorkerHeartbeat`.
- **Failover**: Every 10 seconds, the failover supervisor queries workers whose `lastHeartbeatAt` is older than 30 seconds (6 missed intervals).
- **Cleanup**: Marked as `DEAD`. Any in-flight executions associated with this worker are failed, and their jobs are moved back to `QUEUED` (or quarantined in the `DLQ` if they have exceeded `maxRetries`). This ensures process crashes don't lock jobs in in-flight states forever.
