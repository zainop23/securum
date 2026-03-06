# Phase 0 — Infrastructure & Shared Types

**Goal:** `docker compose up` boots coordinator + postgres. `GET /health` returns `{ status: ok, db: connected }`. Shared package exports all types/constants. DB has 6 tables.

---

## Architecture

```
Analyst
  → POST /query to Coordinator (Express + PostgreSQL)
    → Coordinator broadcasts query to Org Nodes
      → Each Org Node translates query via its private schema map
      → Runs SQL on its own private DB
      → Adds Laplace noise (differential privacy)
      → Hashes result, sends commitment (commit-reveal protocol)
      → After all commitments received, reveals actual noisy result
    → Coordinator verifies hashes, aggregates results
  → Analyst gets final answer (noisy aggregate, no raw data exposed)
```

**Key privacy concepts:**
- **Differential privacy:** Each org adds random noise before sending results. Small epsilon = more noise = more private. Large epsilon = less noise = more accurate.
- **Privacy budget:** Each org has a total epsilon budget. Every query spends some. When exhausted, no more queries — prevents attackers from averaging out the noise across many queries.
- **Commit-reveal:** Orgs hash their results first (commit), then reveal after all commitments are in. Prevents orgs from gaming their answers based on what others submitted.
- **Schema mapping:** Analyst queries use generic column names. Each org maps them to its own private schema. Analyst never sees real table/column names.

---

## Monorepo Structure

npm workspaces — packages import each other by name (e.g. `import { QueryDefinition } from '@securum/shared'`) without publishing to npm.

| Package | Purpose |
|---------|---------|
| `@securum/shared` | Types, constants, stub functions — shared by all packages |
| `@securum/coordinator` | Express API server + PostgreSQL — orchestrates the protocol |
| `@securum/org-node` | Receives queries, runs on private data, returns noisy results (Phase 1+) |
| `@securum/dashboard` | React query builder UI (Phase 5) |

---

## Shared Types (`packages/shared/src/types.ts`) ✅

### Data flow types

**`AggregateFunction`** — `"SUM" | "COUNT" | "AVG" | "MAX" | "MIN"`

**`QueryStatus`** — `"Running" | "Completed" | "Failed" | "Pending"`

**`Operators`** — `"=" | "!=" | ">" | "<" | ">=" | "<="`

**`FilterCondition`** — structured WHERE clause (prevents SQL injection vs raw string filters):
- `column`: string — which column to filter
- `operator`: Operators — comparison type
- `value`: string | number — what to compare against

**`QueryDefinition`** — what an analyst submits:
- `aggregate`: AggregateFunction
- `column`: string — target column (generic name, not real schema)
- `filter?`: Array\<FilterCondition\> — optional WHERE clauses
- `grouping?`: string — optional GROUP BY column
- `submitter`: string — analyst identity

**`QueryRecord extends QueryDefinition`** — what the coordinator stores (adds tracking metadata):
- `id`: string — UUID assigned by coordinator
- `status`: QueryStatus
- `createdAt`: Date

### Response types

**`QueryResult`** — what an org-node sends back:
- `resultId`: string
- `queryId`: string — which query this responds to
- `orgId`: string — which org sent it
- `result`: number — the noisy value (true value + noise)
- `noise`: number — how much noise was added (logged for audit)
- `epsilon`: number — privacy cost of this query

### Registration & protocol types

**`OrgJoining`** — org registration:
- `orgId`, `orgName`, `endpoint` (full URL like `http://org-node-1:5001`), `privacyBudget`

**`Commitment`** — commit-reveal protocol:
- `queryId`, `orgId`, `hashedResult` (SHA256 hash), `hashRevealed` (boolean), `submittedAt`

**`AuditLog`** — accountability trail:
- `logId`, `action` (event description), `actionCommitter` (who), `when`, `queryId?` (optional — not all events are query-related), `extraDetails?`

---

## Shared Constants (`packages/shared/src/constants.ts`)

Write these:

- `SUPPORTED_AGGREGATES`: `['COUNT', 'SUM', 'AVG'] as const`
- `AggregateType`: derived type via `typeof SUPPORTED_AGGREGATES[number]`
- `HASH_ALGORITHM`: `'sha256'`
- `DEFAULT_EPSILON`: `1.0`
- `DEFAULT_SUM_SENSITIVITY`: `500`
- `DEFAULT_PRIVACY_BUDGET`: `10.0`
- `DEFAULT_QUORUM`: `2` — minimum orgs that must respond
- `COORDINATOR_PORT`: `4000`

---

## Shared Stubs (`packages/shared/src/stubs.ts`)

Function signatures that throw `"not implemented"`. Tells TypeScript the shape now, real logic comes later:

- `computeCommitment(value, nonce, queryId) → string` — Phase 2
- `addLaplaceNoise(trueValue, sensitivity, epsilon) → number` — Phase 2
- `validateAndBuildQuery(query: QueryDefinition) → ValidatorResult` — Phase 1
- `rewriteQuery(sql, schemaMap) → RewriterResult` — Phase 1

Needs two more types in `types.ts` for the return values:
- `ValidatorResult`: `{ valid: true, sql: string } | { valid: false, error: string }`
- `RewriterResult`: `{ sql: string, reverseMap: Record<string, string> }`

---

## Shared Barrel (`packages/shared/src/index.ts`)

Re-export everything: `export * from './types'`, `export * from './constants'`, `export * from './stubs'`

---

## Coordinator DB Schema (`docker/postgres-init/init.sql`)

6 tables that mirror the types above. Uses UUID PKs (`gen_random_uuid()`), JSONB for flexible data, CHECK constraints on status fields, UNIQUE constraints to prevent duplicates.

| Table | Maps to type | Purpose |
|-------|-------------|---------|
| organizations | OrgJoining | Registry of org-nodes |
| queries | QueryRecord | Every submitted query + status |
| commitments | Commitment | Hash commitments + revealed values |
| audit_logs | AuditLog | Event trail |
| results | QueryResult | Final aggregated result per query |
| privacy_budget | — | Tracks epsilon spent per org per query |

Indexes on: `privacy_budget(org_id)`, `commitments(query_id)`, `audit_logs(query_id)`

> This SQL runs on first `docker compose up` only. To re-run after changes: `docker compose down -v`

---

## Coordinator Server (`packages/coordinator/src/`)

### `config.ts`
- `AppConfig` interface: port, databaseUrl, jwtSecret, quorumMin, defaultEpsilon, maxEpsilonPerOrg, analystUser, analystPassword
- `requireEnv(name)` helper — reads env var, exits with error if missing
- Export `config` object — reads env vars, defaults for port (4000), quorumMin (2), epsilon (1.0), maxEpsilon (10.0). DATABASE_URL, JWT_SECRET, ANALYST_USER, ANALYST_PASSWORD are required.

### `db.ts`
- pg `Pool` with connection string from config, max 10 connections, 30s idle timeout, 5s connect timeout
- Error listener for unexpected pool errors

### `index.ts`
- Express app with cors + JSON middleware
- `GET /health` — pings DB with `SELECT 1`, returns `{ status: ok, db: connected }` or 503 `{ status: error, db: disconnected }`
- Global error handler (4-param middleware) → 500
- Listens on `config.port`, logs startup with masked DB credentials

---

## Docker Setup

### Services

| Service | Image/Build | Port | Depends on |
|---------|------------|------|------------|
| coordinator | coordinator.Dockerfile | 4000 | postgres-coord (healthy) |
| postgres-coord | postgres:16-alpine | 5432 | — |
| org-node-1/2/3 | org-node.Dockerfile | 5001-5003 | postgres-org1/2/3 (healthy) |
| postgres-org1/2/3 | postgres:16-alpine | — | — |
| dashboard | dashboard.Dockerfile | 3000 | coordinator |

All on `securum-net` bridge network. 4 named volumes for postgres data.

### Dockerfiles

📋 Copy-paste from below — no learning value in Docker boilerplate:

**coordinator.Dockerfile:**
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/coordinator/package.json packages/coordinator/package.json
COPY packages/org-node/package.json packages/org-node/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN npm install
COPY packages/shared packages/shared
COPY packages/coordinator packages/coordinator
RUN npm run build -w @securum/shared
CMD ["npx", "-w", "@securum/coordinator", "ts-node", "src/index.ts"]
```

**org-node.Dockerfile:**
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/coordinator/package.json packages/coordinator/package.json
COPY packages/org-node/package.json packages/org-node/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN npm install
COPY packages/shared packages/shared
COPY packages/org-node packages/org-node
RUN npm run build -w @securum/shared
CMD ["echo", "org-node placeholder — not implemented yet"]
```

**dashboard.Dockerfile:**
```dockerfile
FROM node:20-alpine
CMD ["echo", "dashboard placeholder — not implemented yet"]
```

---

## Config Boilerplate

📋 Copy-paste files (no learning value):

**Root `package.json`:**
```json
{
  "name": "securum",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build -w @securum/shared",
    "build:all": "npm run build -w @securum/shared && npm run build -w @securum/coordinator",
    "clean": "rm -rf packages/*/dist packages/*/node_modules",
    "dev": "docker compose -f docker/docker-compose.yml up --build"
  }
}
```

**`packages/shared/package.json`:**
```json
{
  "name": "@securum/shared",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc" },
  "devDependencies": { "typescript": "^5.7.3" }
}
```

**`packages/coordinator/package.json`:**
```json
{
  "name": "@securum/coordinator",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "scripts": { "build": "tsc", "dev": "ts-node src/index.ts" },
  "dependencies": {
    "@securum/shared": "*",
    "express": "^4.21.2",
    "pg": "^8.13.3",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/pg": "^8.11.11",
    "@types/cors": "^2.8.17",
    "typescript": "^5.7.3",
    "ts-node": "^10.9.2"
  }
}
```

**`packages/org-node/package.json`:**
```json
{
  "name": "@securum/org-node",
  "version": "0.0.1",
  "private": true,
  "main": "dist/index.js",
  "scripts": { "build": "echo 'Phase 3'", "dev": "echo 'Phase 3'" },
  "dependencies": { "@securum/shared": "*" }
}
```

**`packages/dashboard/package.json`:**
```json
{
  "name": "@securum/dashboard",
  "version": "0.0.1",
  "private": true,
  "scripts": { "build": "echo 'Phase 5'", "dev": "echo 'Phase 5'" }
}
```

**tsconfig.json** (same for shared and coordinator):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Seed files** (`docker/dev-seed/seed-org1.sql`, `seed-org2.sql`, `seed-org3.sql`):
```sql
SELECT 1;
```

---

## Verification

```bash
# 1. Shared builds
npm install && npm run build
ls packages/shared/dist/   # .js + .d.ts files

# 2. Compose validates
docker compose -f docker/docker-compose.yml config

# 3. Stack boots
docker compose -f docker/docker-compose.yml up --build

# 4. Health check (new terminal)
curl http://localhost:4000/health
# → {"status":"ok","db":"connected"}

# 5. Tables exist
docker exec -it $(docker ps -qf name=postgres-coord) psql -U securum -d securum_coord -c '\dt'
# → 6 tables

# 6. Clean shutdown
docker compose -f docker/docker-compose.yml down
```

---

## Progress

- [x] types.ts — all 9 types/interfaces
- [ ] constants.ts
- [ ] stubs.ts
- [ ] index.ts (barrel)
- [ ] init.sql (6 tables)
- [ ] config.ts
- [ ] db.ts
- [ ] coordinator index.ts
- [ ] docker-compose.yml