# API Component Notes (Phases 2 & 3)

This component contains the Express API backend, authentication, rate limiting, and job submission logic.

## Key Logic & Design Decisions

### 1. Request Tracing & Correlation IDs
Every request is intercepted by `correlationIdMiddleware` which extracts or generates a unique transaction UUID (`X-Correlation-ID` header).
- **Propagation**: This ID is saved on the request object and stored alongside Job submissions in the `Job.correlationId` database field.
- **Explainability**: When workers process jobs, they log execution logs tagged with this exact correlation ID. This allows an administrator to search for a single correlation ID in the log explorer and see the entire lifecycle from REST submission to execution stdout/stderr and final exit.

### 2. Idempotency Key Handling
To guarantee that consumer retries don't trigger duplicate job creation (for example, if a network timeout occurs while submitting a job), we require or accept an `Idempotency-Key` header.
- **Atomicity**:
  1. We query the `Job` table using a unique composite index `(projectId, idempotencyKey)`. If the job exists, we return the cached record immediately.
  2. If the job does not exist, we acquire a temporary distributed lock on Redis (`idempotency:lock:<projectId>:<key>`) to prevent two simultaneous requests with the same key from creating duplicate rows before the first database write is finalized.
  3. Once the database write succeeds, we return the new job and release the lock.

### 3. Role-Based Access Control (RBAC)
We enforce security per Organization:
- Roles: `OWNER` (full control, including deleting projects), `ADMIN` (add members, edit queues), and `MEMBER` (submit jobs, view queues).
- Access validation checks project-level or queue-level resource ownership back to their parent Organization memberships, ensuring multi-tenant isolation.
