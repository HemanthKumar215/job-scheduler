# Design Decisions - Distributed Job Scheduler Platform

This document outlines key engineering decisions, tradeoffs, database query plans, and architectural justifications for the distributed job scheduler.

## 1. Claiming Strategy: `SELECT ... FOR UPDATE SKIP LOCKED`
For atomic job claiming, we select pending jobs and lock their rows using PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction.
- **Why**: Standard `SELECT ... FOR UPDATE` blocks other threads/workers, leading to serialization bottle-necks. `SKIP LOCKED` allows concurrent workers to query the same table, ignore currently locked rows, lock their own target rows, and execute jobs immediately.
- **Alternative**: Redis-based distributed lock per queue. While Redis locks work, doing claiming at the database query level is simpler, transactional, and doesn't suffer from split-brain state inconsistencies between cache and primary store.

## 2. Execution Guarantees: At-Least-Once Execution
This platform guarantees **at-least-once** job execution.
- **Why exactly-once is hard**: If a worker crashes mid-execution (after completing the external action but before updating the job state to `COMPLETED`), the heartbeat supervisor will detect it as dead and requeue the job, resulting in a second execution.
- **Mitigation**:
  1. Consumers should write idempotent job handlers.
  2. We support a unique `Idempotency-Key` (scoped per project) to prevent duplicate submissions from creating duplicate `Job` records.

## 3. Database Indexes and Query Verification (EXPLAIN ANALYZE)

Below are the actual query plans obtained from our database running under Docker with a seeded configuration:

### Query 1: Job Polling (idx_job_poll)
Used by workers to fetch due queued jobs.
- **SQL**:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM "Job"
  WHERE status = 'QUEUED' AND "scheduledAt" <= NOW()
  ORDER BY priority DESC, "scheduledAt" ASC LIMIT 10;
  ```
- **Plan**:
  ```
   Limit  (cost=8.18..8.18 rows=1 width=292) (actual time=0.057..0.057 rows=1 loops=1)
     ->  Sort  (cost=8.18..8.18 rows=1 width=292) (actual time=0.056..0.057 rows=1 loops=1)
           Sort Key: priority DESC, "scheduledAt"
           Sort Method: quicksort  Memory: 25kB
           ->  Index Scan using idx_job_status_project on "Job"  (cost=0.14..8.17 rows=1 width=292) (actual time=0.022..0.022 rows=1 loops=1)
                 Index Cond: (status = 'QUEUED'::"JobStatus")
                 Filter: ("scheduledAt" <= now())
   Planning Time: 0.697 ms
   Execution Time: 0.089 ms
  ```

### Query 2: DLQ Lookups (idx_dlq_job)
Optimizes querying quarantined jobs.
- **SQL**:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM "DeadLetterQueue"
  WHERE "jobId" = 'some-job-id' ORDER BY "failedAt" DESC;
  ```
- **Plan**:
  ```
   Sort  (cost=9.51..9.52 rows=2 width=136) (actual time=0.008..0.008 rows=0 loops=1)
     Sort Key: "failedAt" DESC
     Sort Method: quicksort  Memory: 25kB
     ->  Bitmap Heap Scan on "DeadLetterQueue"  (cost=4.16..9.50 rows=2 width=136) (actual time=0.003..0.003 rows=0 loops=1)
           Recheck Cond: ("jobId" = 'some-job-id'::text)
           ->  Bitmap Index Scan on idx_dlq_job  (cost=0.00..4.16 rows=2 width=0) (actual time=0.002..0.002 rows=0 loops=1)
                 Index Cond: ("jobId" = 'some-job-id'::text)
   Planning Time: 0.233 ms
   Execution Time: 0.029 ms
  ```

### Query 3: Worker Heartbeats (idx_worker_heartbeat)
Optimizes querying worker heartbeat histories.
- **SQL**:
  ```sql
  EXPLAIN ANALYZE SELECT * FROM "WorkerHeartbeat"
  WHERE "workerId" = 'some-worker-id' ORDER BY "timestamp" DESC LIMIT 5;
  ```
- **Plan**:
  ```
   Limit  (cost=11.31..11.31 rows=3 width=104) (actual time=0.005..0.006 rows=0 loops=1)
     ->  Sort  (cost=11.31..11.31 rows=3 width=104) (actual time=0.005..0.005 rows=0 loops=1)
           Sort Key: "timestamp" DESC
           Sort Method: quicksort  Memory: 25kB
           ->  Bitmap Heap Scan on "WorkerHeartbeat"  (cost=4.17..11.28 rows=3 width=104) (actual time=0.001..0.001 rows=0 loops=1)
                 Recheck Cond: ("workerId" = 'some-worker-id'::text)
                 ->  Bitmap Index Scan on idx_worker_heartbeat  (cost=0.00..4.17 rows=3 width=0) (actual time=0.001..0.001 rows=0 loops=1)
                       Index Cond: ("workerId" = 'some-worker-id'::text)
   Planning Time: 0.178 ms
   Execution Time: 0.022 ms
  ```

## 4. Scaling Considerations
- **High-Volume Tables**: Tables like `JobLog` and `JobExecution` are soft-referenced to avoid cascading locking overheads. They can be partitioned by month on database systems at scale.
- **Queue Sharding**: If a single Postgres table becomes a bottleneck under high volume, queues can be sharded horizontally across multiple database nodes by project ID or queue ID hashes.

## 5. Deliberate Deprioritizations
To protect the reliability and correctness of the core execution lifecycle (claim → execute → retry/DLQ) and heartbeat failover processes, the following secondary features were deliberately deprioritized:
1. **Workflow dependencies (DAGs)**: Can be added on top as a parent-child completion trigger.
2. **Event-driven execution (Webhooks)**: Can be added via an external ingest service.
3. **AI-generated failure summaries**: A nice-to-have visual addon that doesn't affect scheduler operations.

## 6. CI/CD Gotchas — Do Not Reintroduce

These three bugs were discovered and diagnosed across CI runs #12–#16. Each one passes locally and only fails in the pipeline, making them easy to reintroduce silently.

### Gotcha 1: `prisma migrate dev` vs `prisma migrate deploy`

**Never use `migrate dev` in CI.**

| Command | Behaviour | Use where |
|---------|-----------|-----------|
| `migrate dev` | Interactive — prompts for confirmation, can auto-generate new migrations from schema drift | Local development only |
| `migrate deploy` | Non-interactive — applies committed migration files only, exits with error if schema and migrations disagree | CI, staging, production |

If `migrate deploy` fails in CI it means there is a **committed schema change without a corresponding migration file**. The fix is `prisma migrate dev` locally to generate the migration file, commit it, and push — not reverting to `migrate dev` in CI.

### Gotcha 2: `.env` value quoting

**Do not quote values in shell-written `.env` files.**

```bash
# ❌ Wrong — DATABASE_URL becomes literally `"postgresql://..."` with quote chars
echo "DATABASE_URL=\"postgresql://...\"" > .env

# ✅ Correct — raw value, no surrounding quotes
echo "DATABASE_URL=postgresql://..." > .env
```

Prisma does not strip surrounding quote characters from `.env` values. The URL `"postgresql://..."` (with literal `"`) is syntactically invalid — Prisma fails to connect silently. The string looks correct when you `cat` it; it only breaks when something parses it.

### Gotcha 3: `.env` file path resolution in a monorepo workspace

**Use workflow-level `env:` variables in CI — never rely on `.env` file discovery across workspace boundaries.**

There are two different `.env` discovery mechanisms in this project:

| Tool | Where it looks for `.env` |
|------|--------------------------|
| Prisma CLI (`migrate`, `generate`) | Current working directory (project root when run from root) |
| `PrismaClient` (in application code / `seed.ts`) | Directory containing `schema.prisma` (`prisma/`) |
| `dotenv/config` import | `process.cwd()` at time of import |

When `npm run seed -w prisma` runs, it changes directory to `prisma/`. A `.env` at the project root is **not visible** to `PrismaClient` inside `seed.ts` via that path. Options:

1. ✅ **Preferred (CI)**: Set env vars in the GitHub Actions `env:` block at the workflow level — every step inherits them from `process.env` directly, no file discovery needed.
2. ✅ **Preferred (local dev)**: `import 'dotenv/config'` at the top of `seed.ts` loads from `process.cwd()`.
3. ❌ **Do not**: Copy `.env` to `prisma/.env` — this causes Prisma CLI to find two `.env` sources and can introduce subtle conflicts with `migrate deploy`.
