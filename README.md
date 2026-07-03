# Aether Scheduler - Distributed Job Scheduler Platform

Aether Scheduler is a production-grade, multi-tenant distributed job scheduling engine built in Node.js (TypeScript), PostgreSQL (Prisma), Redis, and React. It utilizes atomic database transactional loops (`SELECT ... FOR UPDATE SKIP LOCKED`) to claim tasks concurrently with zero lock conflicts.

---

## ⚡ Quick-Start (Under 5 Minutes)

Follow these steps to launch the entire platform locally:

### 1. Pre-requisites
Ensure you have the following installed on your system:
- **Node.js** (v18+ recommended, v25 verified)
- **Docker Desktop** (with Compose plugin)

### 2. Configure Environment
A default `.env` configuration file has been provided in the root directory. To check or adjust parameters, view [`.env`](file:///C:/Users/PHEMAN~1/.gemini/antigravity-ide/scratch/distributed-job-scheduler/.env):
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/job_scheduler?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="super-secret-key-change-it-in-production"
PORT=3000
```

### 3. Spin Up Databases via Docker
Run the following command at the root directory to spin up PostgreSQL and Redis:
```bash
docker compose up -d postgres redis
```

### 4. Initialize Database Schemas & Seed Data
Install all project workspace dependencies, run database migrations, and seed initial project profiles:
```bash
# Install workspace packages
npm install --legacy-peer-deps

# Build Shared Client
npm run build -w prisma

# Apply Migrations
npx prisma migrate dev --name init --schema=prisma/schema.prisma

# Seed data (Creates owner@example.com / password123, projects, and queues)
npx tsx prisma/seed.ts
```

### 5. Launch API, Worker, and Frontend Services
You can run services locally concurrently in dev mode:
```bash
# In terminal 1 (API Rest / Socket server)
npm run dev:api

# In terminal 2 (Worker polling daemon)
npm run dev:worker

# In terminal 3 (Vite React Panel dashboard)
npm run dev:frontend
```
Open **`http://localhost:5173`** in your browser. Sign in using the seeded profile:
- **Email**: `owner@example.com`
- **Password**: `password123`

---

## 🧪 Testing Suite & Concurrency Proofs
Aether Scheduler includes a robust unit and integration testing suite, including concurrency and failover proofs:

```bash
# Run all unit, integration, and OpenAPI contract tests
npm run test

# Run high-concurrency (10 concurrent workers) and heartbeat supervisor proof tests
npm run test:proofs
```

---

## 📁 Repository Structure
```
├── api/                  # Express HTTP REST & Socket.IO server
├── worker/               # Standalone scaleable worker polling daemons
├── frontend/             # Vite + React + Tailwind + Recharts dashboard panel
├── prisma/               # Normalized Prisma database schema, seed scripts, & migration logs
├── ARCHITECTURE.md       # Contains System, ER, and Lifecycle Mermaid diagrams
├── DESIGN_DECISIONS.md   # Tradeoffs, index query plans (EXPLAIN ANALYZE), & limitations
└── docker-compose.yml    # Coordinates PostgreSQL and Redis services
```
