# Securum — Implementation Roadmap

**Secure Self-Hosted Multi-Organization Joint Analytics Platform**

A self-hosted, Docker-based platform that lets multiple organizations compute joint aggregate statistics (COUNT/SUM/AVG/GROUP BY) on their combined data, where each org keeps its raw data locally, and only differentially-private noisy aggregates are shared through a commit–reveal protocol coordinated by a central server.

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Repo structure | **Monorepo** with npm workspaces — single repo, shared types, easy Docker builds |
| Database | **PostgreSQL only** — no SQLite; keeps the DB layer uniform |
| Auth | **Shared API key + JWT** — API keys for service-to-service, JWT for analyst UI |
| Testing | **Minimal / manual** — manual testing via demo scripts and curl |
| Charts | **Recharts** — free, React-native, lightweight |
| Styling | **Tailwind CSS** — fast to build, no component library cost |
| Real-time updates | **Polling** — no WebSockets; SSE as stretch goal |
| SUM sensitivity | Configurable per-query or defaulted to a global max (e.g., 500) |

---

## Folder Structure

```
securum/
├── packages/
│   ├── shared/            ← Common types, constants, crypto & DP utils
│   ├── coordinator/       ← Express API (port 4000)
│   ├── org-node/          ← Express API (port 5001+)
│   └── dashboard/         ← React + Vite (port 3000)
├── docker/
│   ├── docker-compose.yml
│   ├── coordinator.Dockerfile
│   ├── org-node.Dockerfile
│   ├── dashboard.Dockerfile
│   └── postgres-init/     ← Init SQL for coordinator DB only
├── package.json           ← Workspaces root
├── .env.example
├── Makefile
├── README.md
└── PLAN.md                ← This file
```

> **Important:** Each organization brings its own existing PostgreSQL database. The platform does NOT create or manage org databases — it only needs read access to them. The only database created by the platform is the coordinator's state DB.

---

## Phase 0 — Project Scaffolding & DevOps Foundation

> **Milestone:** `docker-compose up` boots all containers (empty shells) and Postgres DBs.

### Tasks

1. Initialize the monorepo root with an npm workspaces config in a root `package.json` (workspaces: `packages/*`).
2. Create the folder structure as shown above.
3. Write `docker-compose.yml` defining:
   - `coordinator` service (Node 20-alpine)
   - `postgres-coord` (coordinator state DB — the only DB the platform creates)
   - `dashboard` service (Vite dev or nginx-based)
   - A shared Docker bridge network (`securum-net`)
   - **Org nodes are NOT in the compose file** — each organization deploys its own `org-node` container on its own infrastructure, pointed at its own existing Postgres.
   - For **local development/demo**, provide a `docker-compose.dev.yml` override that spins up 3 sample org-node containers + 3 throwaway Postgres instances with sample data, so a developer can test the full flow on one machine.
4. Write minimal Dockerfiles with hot-reload (nodemon / Vite) for dev.
5. Add a root `Makefile` or npm scripts: `dev`, `build`, `test`, `clean`.
6. Add `.env.example` files for each service with all configurable vars documented (including `DATABASE_URL` that the org points at their own DB).

### Verification

Run `docker-compose up --build`. Coordinator + dashboard + coordinator DB start healthy. Coordinator responds to `GET /health` with `200 OK`. For dev testing, also run `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up` to boot the 3 sample org nodes.

---

## Phase 1 — Shared Library + Data Model + Seed Data

> **Milestone:** 3 org databases seeded with synthetic data; coordinator DB has tables for queries/audits.

### Tasks

1. **`packages/shared`** — Create and export:
   - TypeScript types/interfaces: `Query`, `Commitment`, `RevealPayload`, `AggregateResult`, `OrgConfig`, `GlobalSchema`.
   - Constants: supported aggregate functions (`COUNT`, `SUM`, `AVG`), supported `GROUP BY`, hash algorithm (`sha256`), default epsilon (1.0).
   - Utility: `computeCommitment(value, nonce, metadata) → SHA-256 hex string`.
   - Utility: `addLaplaceNoise(trueValue, sensitivity, epsilon) → noisyValue` (Laplace sampler using inverse CDF).
   - Utility: query parser/validator — accepts a JSON query definition `{ aggregate, column, table, groupBy?, where? }` and produces a safe SQL string (using allowlisting, NOT string interpolation).

2. **Coordinator DB schema** (`postgres-coord`):
   - `organizations` — id, name, api_key_hash, endpoint_url, status, created_at
   - `queries` — id, submitted_by, query_definition (JSONB), status (pending/committing/revealing/done/failed), quorum, epsilon, created_at
   - `commitments` — id, query_id, org_id, commitment_hash, revealed_value, revealed_nonce, verified (bool), committed_at, revealed_at
   - `audit_logs` — id, query_id, org_id, event_type, payload (JSONB), timestamp
   - `results` — id, query_id, global_result (JSONB), created_at

3. **Org node schema mapping** (each org brings their own DB):
   - Each organization already has its own database with its own table/column names.
   - The org configures a `schema-map.json` that maps global schema names to their local table/column names.
   - Optionally, the org can create a `consortium.transactions` **view** in their DB that maps to the global schema: `(amount, category, region, tx_date)`.
   - **The platform never creates, modifies, or seeds org databases.** It only needs read access.

4. **Config-based schema mapping** — each org-node gets a `schema-map.json`:
   ```json
   {
     "transactions.amount": "sales.total_amount",
     "transactions.category": "sales.product_type",
     "transactions.region": "sales.region",
     "transactions.tx_date": "sales.sale_date"
   }
   ```
   Each org fills this out based on their own database schema.

5. **Dev/demo sample data** (only in `docker-compose.dev.yml`):
   - For local development and testing, provide SQL seed scripts that create 3 sample org databases with ~10,000 rows each:
     - Org 1: `sales(id, total_amount, product_type, region, sale_date)`
     - Org 2: `orders(id, amount, category, area, order_date)`
     - Org 3: `purchases(id, price, item_class, location, purchase_date)`
   - These are only used when running the dev compose override — they are not part of the production platform.

### Verification

Import `shared` in coordinator and call `computeCommitment('42', 'abc', 'meta')` — get deterministic hash. Coordinator DB has all tables created. For dev: sample org databases are seeded and org-nodes can connect to them.

---

## Phase 2 — Coordinator Core API

> **Milestone:** Coordinator can register orgs, accept a query, and store it. No commit-reveal yet.

### Tasks

1. **Express app setup** (`packages/coordinator/`):
   - Express 4 + TypeScript
   - Middleware: JSON body parser, CORS, request logging (morgan), error handler
   - PostgreSQL client via `pg` pool
   - Environment config: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `QUORUM_MIN`, `DEFAULT_EPSILON`

2. **Auth module**:
   - `POST /auth/login` — accepts analyst username/password, returns JWT (hardcoded users in env or DB for prototype).
   - JWT middleware protecting `/query/*` and `/results/*` routes.
   - API-key middleware for org-node-facing routes (`X-Org-Api-Key` header, validated against `organizations.api_key_hash`).

3. **Organization management**:
   - `POST /orgs/register` — register an org (name, endpoint URL), returns generated API key (shown once). Stores hashed key.
   - `GET /orgs` — list registered orgs (admin).
   - `DELETE /orgs/:id` — deregister.

4. **Query submission**:
   - `POST /query` — analyst submits `{ aggregate, column, table, groupBy?, epsilon? }`.
   - Validate using `shared` query validator.
   - Store in `queries` table with status `pending`.
   - Return `query_id`.
   - **Do not yet broadcast** — that's Phase 4.

5. **Results retrieval**:
   - `GET /results/:queryId` — returns global result if status is `done`, or current status.
   - `GET /results` — list past query results (paginated).

6. **Audit log helper** — internal function `logAuditEvent(queryId, orgId, eventType, payload)` that inserts into `audit_logs`.

### Verification

Start coordinator. `POST /auth/login` → get JWT. `POST /query` with JWT → get `query_id` back. `GET /results/:queryId` → `{ status: "pending" }`.

---

## Phase 3 — Org-Node Service + Local Query Execution + DP

> **Milestone:** An org-node receives a query, runs it locally, adds Laplace noise, and returns the noisy result (direct call, no commit-reveal yet).

### Tasks

1. **Express app setup** (`packages/org-node/`):
   - Express 4 + TypeScript
   - Env config: `PORT`, `DATABASE_URL`, `COORDINATOR_URL`, `ORG_ID`, `API_KEY`, `SCHEMA_MAP_PATH`, `DEFAULT_EPSILON`
   - PG pool connection to its own local DB.

2. **Schema rewriter module**:
   - Loads `schema-map.json` at startup.
   - Function `rewriteQuery(globalQuery) → localSQL` that replaces global table/column refs with local names.
   - Safety: allowlisted aggregate functions and column names only — reject anything not in the map.

3. **Local query executor**:
   - Takes rewritten SQL, runs it against local PG.
   - Returns raw result rows (e.g., `[{ category: "Electronics", sum: 125000 }]`).

4. **Differential privacy module**:
   - Import `addLaplaceNoise` from `shared`.
   - For each numeric result value, apply Laplace noise with configured epsilon and sensitivity.
   - Sensitivity defaults: COUNT → 1, SUM → max plausible value or configurable, AVG → derived from SUM/COUNT.
   - Return noisy results.

5. **API endpoints**:
   - `POST /execute` — receives `{ queryId, queryDefinition, epsilon }`, runs rewrite → execute → noise → returns `{ queryId, noisyResult }`.
   - `GET /health` — health check.

6. **Registration on startup**:
   - On boot, org-node calls `POST coordinator:4000/orgs/register` (or reads pre-configured API key).
   - Stores its org_id and API key in memory.
   - The org provides its own `DATABASE_URL` pointing to their existing Postgres instance.

### Verification

Directly call `POST org-node:5001/execute` with a COUNT query → get a noisy number back. Compare with direct SQL on the org's own DB — values differ by noise.

---

## Phase 4 — Commit–Reveal Protocol (Full Pipeline)

> **Milestone:** End-to-end flow works: analyst submits query → coordinator broadcasts → orgs commit → reveal → coordinator verifies, aggregates, returns result. **This is the core of the project.**

### Tasks

1. **Org-node: commit endpoint**:
   - `POST /commit` — receives `{ queryId, queryDefinition, epsilon }`.
   - Runs local query + DP noise (reuse Phase 3 logic).
   - Generates a random nonce (`crypto.randomBytes`, 32 bytes, hex).
   - Computes `commitment = SHA256(JSON.stringify(noisyResult) + nonce + queryId)` using `shared.computeCommitment`.
   - Stores `{ queryId, noisyResult, nonce }` in memory (Map).
   - Returns `{ queryId, commitmentHash }` to coordinator.

2. **Org-node: reveal endpoint**:
   - `POST /reveal` — receives `{ queryId }`.
   - Looks up stored `{ noisyResult, nonce }` for that queryId.
   - Returns `{ queryId, noisyResult, nonce }`.
   - Clears stored data for that queryId.

3. **Coordinator: query orchestration engine** (the heart):
   - When a query is submitted (`POST /query`), after storing it:
     1. Set status → `committing`.
     2. **Broadcast commit requests** in parallel to all registered org endpoints (`POST org:port/commit`) with a configurable timeout (e.g., 30s).
     3. Collect `commitmentHash` from each responding org. Store in `commitments` table.
     4. Log audit event for each commitment received.
     5. **Quorum check**: if fewer than `QUORUM_MIN` orgs committed → mark query `failed`, log reason, return error.
     6. Set status → `revealing`.
     7. **Broadcast reveal requests** in parallel (`POST org:port/reveal`).
     8. For each reveal:
        - Recompute hash from `noisyResult + nonce + queryId`.
        - Compare with stored `commitmentHash`.
        - If match → mark `verified = true`.
        - If mismatch → mark `verified = false`, flag org, log audit event.
     9. **Post-reveal validation**:
        - Exclude unverified orgs.
        - Range check: if any noisy result is wildly out of expected range (configurable bounds), flag and optionally exclude.
        - Re-check quorum after exclusions.
     10. **Global aggregation**:
         - For `COUNT` / `SUM`: sum all verified noisy results.
         - For `AVG`: compute `total_sum / total_count` from the noisy values (org-nodes send both sum and count for AVG queries).
         - For `GROUP BY`: merge by group key, aggregate per group.
     11. Store global result in `results` table.
     12. Set status → `done`.
     13. Log final audit event.

4. **Timeout & error handling**:
   - If an org doesn't respond in time during commit phase → skip, log, proceed if quorum met.
   - If an org doesn't respond during reveal → treat as failed reveal, exclude, log.
   - If overall query fails → status = `failed` with reason.

### Verification

Submit a query via `POST /query`. Watch logs: coordinator broadcasts → 3 orgs commit → coordinator triggers reveal → hashes verified → global result computed. `GET /results/:queryId` returns the combined noisy aggregate. Manually verify: the global SUM should roughly equal sum of individual org's true values (with DP noise).

---

## Phase 5 — React Dashboard

> **Milestone:** Analyst can log in, pick a query template, submit, see live status, and view results in a browser.

### Tasks

1. **Vite + React + TypeScript** scaffold (`packages/dashboard/`):
   - Routing: React Router (login, dashboard, query, results, audit)
   - State: React Context or Zustand (lightweight)
   - HTTP: Axios to coordinator API
   - Styling: Tailwind CSS

2. **Login page**:
   - Username + password form → `POST /auth/login` → store JWT in memory.
   - Redirect to dashboard on success.

3. **Dashboard / Home page**:
   - Shows: number of registered orgs, recent queries, system status.
   - Summary cards.

4. **Query Builder page**:
   - **Template-based query form**:
     - Dropdown: aggregate function (COUNT / SUM / AVG)
     - Dropdown: column (from global schema: amount, category, region, tx_date)
     - Dropdown: table (transactions)
     - Optional: GROUP BY column
     - Optional: epsilon slider (0.1 → 10.0, default 1.0) with privacy/accuracy tradeoff indicator
   - Submit button → `POST /query` → show query ID and initial status.

5. **Query Status / Results page**:
   - Poll `GET /results/:queryId` every 2s.
   - Show progress: pending → committing (X/Y orgs) → revealing → done.
   - On `done`: display results in a clean table.
   - For GROUP BY results: render a bar chart (Recharts).

6. **Results History page**:
   - Table of past queries: ID, type, status, timestamp, link to result.

7. **Audit Log page** (stretch):
   - `GET /audit` → show timeline of events per query.

### Verification

Open browser at `localhost:3000`. Log in. Select "SUM of amount GROUP BY category". Submit. Watch status update live. See a bar chart of combined noisy sales by category across 3 orgs.

---

## Phase 6 — Polish, Documentation & Demo-Readiness

> **Milestone:** Project is demo-ready, documented, and can be spun up by anyone with `docker-compose up`.

### Tasks

1. **End-to-end startup script**:
   - Single `docker-compose up --build` boots everything including DB seeding.
   - Add `healthcheck` to each service in compose so dependent services wait properly.
   - Seed data runs via Postgres `docker-entrypoint-initdb.d/` scripts.

2. **README.md** — comprehensive:
   - Project description, architecture diagram (Mermaid), setup instructions, API reference, screenshots.

3. **Environment hardening**:
   - Validate all env vars on startup (fail fast with clear message).
   - Rate-limit query endpoint (`express-rate-limit`).
   - Input sanitization (already via allowlisting, double-check).

4. **Demo script**:
   - A shell script or HTTP file (`demo.http`) that walks through: register 3 orgs → submit a COUNT query → submit a SUM GROUP BY query → show results.

5. **Error scenarios to handle & test manually** (using dev compose with sample orgs):
   - One org goes down mid-query → quorum still met → result still returned.
   - Tampered reveal (manually change a value) → commitment mismatch detected.
   - Below-quorum scenario → query fails gracefully

6. **Cleanup**:
   - Remove hardcoded secrets, use `.env` everywhere.
   - Add `.dockerignore` and `.gitignore`.
   - License file (MIT).

7. **Org onboarding guide**:
   - Document how a new organization joins: install org-node Docker image, configure `DATABASE_URL` to their own Postgres, fill in `schema-map.json`, set coordinator URL and API key, run the container.

### Verification

Clone repo on a clean machine. Run `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up` for full demo. Open `localhost:3000`. Complete the full analyst workflow. Check audit log. Kill one org container and re-run a query — should still succeed with 2/3 quorum (if quorum=2). For production: coordinator + dashboard start with just `docker-compose up`; orgs deploy their own org-node containers separately.

---

## Timeline Estimate (Solo, Full-Time)

| Phase | Description | Estimated Effort |
|-------|-------------|-----------------|
| **0** | Scaffolding & DevOps | 1 day |
| **1** | Shared lib + DB + Seed data | 1–2 days |
| **2** | Coordinator API | 1–2 days |
| **3** | Org-Node + DP | 1–2 days |
| **4** | Commit–Reveal protocol | 2–3 days |
| **5** | React Dashboard | 2–3 days |
| **6** | Polish & Docs | 1 day |
| | **Total** | **~10–14 days** |

---

## Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20 (LTS) |
| Backend framework | Express 4 |
| Language | TypeScript |
| Database | PostgreSQL 16 |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Containerization | Docker + docker-compose |
| Auth | JWT (analyst) + API keys (service-to-service) |
| Crypto | Node.js `crypto` (SHA-256, randomBytes) |
| Privacy | Laplace mechanism (differential privacy) |

---

*All tools and libraries are free and open-source. Zero vendor lock-in.*
