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
| Testing | **Vitest** (shared lib) + **automated end-to-end test script** (bash/curl) |
| Charts | **Recharts** — free, React-native, lightweight |
| Styling | **Tailwind CSS** — fast to build, no component library cost |

---

## Threat Model

> This section documents what the system protects against and what it does NOT — important for an honest security analysis.

**Trusted parties:** The coordinator is a **trusted-but-curious** entity. It faithfully executes the protocol but could, in theory, observe individual org results during the reveal phase.

**What the system protects against:**
- **Raw data exposure:** No org ever shares its raw rows. Only noisy aggregates leave each org.
- **Result tampering:** The commit–reveal protocol detects if an org changes its answer between phases.
- **Statistical inference attacks:** Differential privacy (Laplace noise) provides formal guarantees against learning about individual records from aggregate results.
- **SQL injection:** All queries are built via allowlisted identifiers — no user input reaches SQL directly.
- **Composition attacks:** Privacy budget tracking (cumulative epsilon per org) prevents unlimited querying from degrading privacy guarantees over time.

**What the system does NOT protect against:**
- **Malicious coordinator:** The coordinator sees individual noisy results during reveal. A production system would use secret sharing or homomorphic encryption — that's out of scope here.
- **Side-channel attacks:** Timing, network traffic analysis, etc. are not addressed.
- **Collusion:** If multiple orgs collude with the coordinator, individual data could be inferred. Standard limitation of this architecture.

> **Why this matters:** Documenting your threat model shows you understand the difference between a protocol demo and a production security system. This honesty is more impressive than overclaiming.

---

## Work Split

> Phases alternate between two developers. Zain focuses on **infrastructure & backend orchestration**, Rahul focuses on **data layer, org services & frontend**. Phase 6 is collaborative.

| Phase | Owner | Focus Area | Summary |
|-------|-------|------------|----------|
| **0** | Zain | Infra & Types | Monorepo + Docker + DB schema + shared types/constants + coordinator skeleton |
| **1** | Rahul | Data, Validation & Rewriting | Query validator + schema rewriter + schema-map configs + seed data + shared lib tests |
| **2** | Zain | Backend API | Full Coordinator API (auth, orgs, queries, results, audit) + shared crypto/DP implementations |
| **3** | Rahul | Org Services | Org-Node Express app, local query executor, DP wrapper |
| **4** | Zain | Protocol & Aggregation | Commit–Reveal protocol, orchestration engine, global aggregation |
| **5** | Rahul | Frontend & UX | React dashboard (login, query builder, results, charts) + dashboard Dockerfile |
| **6** | Both | Polish | Docs, demo script, cleanup |

> **Workflow:** Zain does Phase 0 and pushes → Rahul pulls and does Phase 1 and pushes → Zain pulls and does Phase 2 … and so on.

---

## Shared Contracts (Defined in Phase 0, Used Everywhere)

> These types live in `packages/shared/src/types.ts` and are the contract between all services. Defining them upfront prevents integration surprises later.

```typescript
// What the analyst submits
interface QueryDefinition {
  aggregate: 'COUNT' | 'SUM' | 'AVG';
  column: string;
  table: string;
  groupBy?: string;
  epsilon?: number;
}

// What org-nodes return for each query type
// For COUNT: { type: 'scalar', value: number }
// For SUM:   { type: 'scalar', value: number }
// For AVG:   { type: 'avg', sum: number, count: number }  ← both needed for global AVG
// For GROUP BY: array of { groupKey: string, ...above }
type NoisyResult =
  | { type: 'scalar'; value: number }
  | { type: 'avg'; sum: number; count: number }
  | { type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }
  | { type: 'grouped_avg'; groups: Array<{ groupKey: string; sum: number; count: number }> };

// Standard error response (used by coordinator AND org-nodes)
interface ErrorResponse {
  error: string;
  code: 'INVALID_QUERY' | 'SCHEMA_MISMATCH' | 'DB_ERROR' | 'TIMEOUT' | 'COMMITMENT_FAILED' | 'QUORUM_NOT_MET' | 'UNAUTHORIZED';
}
```

---

## Folder Structure

```
securum/
├── packages/
│   ├── shared/            ← Types, constants, crypto, DP, query validator, schema rewriter
│   ├── coordinator/       ← Express API (port 4000)
│   ├── org-node/          ← Express API (port 5001+)
│   └── dashboard/         ← React + Vite (port 3000)
├── docker/
│   ├── docker-compose.yml       ← Full dev stack: coordinator + postgres + 3 org-nodes + 3 org DBs + dashboard
│   ├── coordinator.Dockerfile
│   ├── org-node.Dockerfile
│   ├── dashboard.Dockerfile
│   ├── postgres-init/           ← Init SQL for coordinator DB
│   └── dev-seed/                ← Seed SQL for dev org DBs (Phase 1)
├── package.json           ← Workspaces root
├── .env.example
├── test-e2e.sh            ← Automated integration test script
├── README.md
└── PLAN.md                ← This file
```

> **Important:** Each organization brings its own existing PostgreSQL database. The platform does NOT create or manage org databases — it only needs read access to them. The only database created by the platform is the coordinator's state DB.

---

## Phase 0 — Monorepo, Docker & Shared Types *(Zain)*

> **Milestone:** `docker compose up` boots coordinator + postgres. Coordinator connects to DB, responds to `GET /health`. Shared package exports all types and constants (no utility implementations yet — just the contracts). DB has all tables.

### Tasks

1. **Monorepo initialization:**
   - Root `package.json` with npm workspaces config (`packages/*`).
   - Create the full folder structure.
   - Add root `.gitignore` and `.env.example`.

2. **`packages/shared` — Types & constants only:**
   - TypeScript interfaces: `QueryDefinition`, `NoisyResult`, `Commitment`, `RevealPayload`, `ErrorResponse`, `OrgConfig` (as defined in Shared Contracts above).
   - Constants: `SUPPORTED_AGGREGATES`, `HASH_ALGORITHM`, `DEFAULT_EPSILON`, `DEFAULT_SUM_SENSITIVITY`.
   - **Function stubs** (exported but throw "not implemented yet"): `computeCommitment()`, `addLaplaceNoise()`, `validateAndBuildQuery()`, `rewriteQuery()`. These define the signatures; implementations come in Phases 1 and 2.
   - Package builds to `dist/` with TypeScript, exports via `main` field.
   - **Important:** Set `"main": "dist/index.js"` and `"types": "dist/index.d.ts"` in `package.json`. Other packages can't import from shared until it's built — add a root `build` script that builds shared first.

3. **Coordinator DB schema** (`docker/postgres-init/init.sql`):
   - Runs on `postgres-coord` startup via `docker-entrypoint-initdb.d/`:
     - `organizations` — id (UUID default gen_random_uuid()), name, api_key_hash, endpoint_url, status, created_at
     - `queries` — id (UUID), submitted_by, query_definition (JSONB), status (pending/committing/revealing/done/failed), quorum, epsilon, created_at
     - `commitments` — id, query_id (FK), org_id (FK), commitment_hash, revealed_value (JSONB), revealed_nonce, verified (bool), committed_at, revealed_at
     - `audit_logs` — id, query_id, org_id, event_type, payload (JSONB), timestamp
     - `results` — id, query_id (FK unique), global_result (JSONB), created_at
     - `privacy_budget` — id, org_id (FK), query_id (FK), epsilon_spent (NUMERIC), created_at — tracks cumulative privacy spend per org

4. **Coordinator skeleton** (`packages/coordinator/`):
   - Minimal Express 4 + TypeScript app.
   - `GET /health` → `{ status: "ok", db: "connected" | "disconnected" }`.
   - PG pool using `DATABASE_URL` env var.
   - Env config: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `QUORUM_MIN`, `DEFAULT_EPSILON`, `MAX_EPSILON_PER_ORG`.

5. **Docker setup:**
   - Single `docker-compose.yml` with the full dev stack:
     - `coordinator` service (Node 20-alpine) with healthcheck
     - `postgres-coord` with init SQL mounted
     - 3 org-node containers + 3 Postgres instances (seed data added in Phase 1)
     - Dashboard service
     - Shared bridge network (`securum-net`)
   - `coordinator.Dockerfile`, `org-node.Dockerfile`, `dashboard.Dockerfile`.
   - Use strict naming: `org-node-1` → `postgres-org1`, etc. Verify with `docker compose config` before first boot.
   - Set `restart: on-failure` (not `restart: always`) to avoid infinite restart loops from config errors.

6. **Build tooling:**
   - Root npm scripts: `dev`, `build`, `clean`.

### Gotchas

- **`docker-entrypoint-initdb.d` only runs on first volume creation.** If you change `init.sql` after the first `docker compose up`, changes won't apply. Fix: `docker compose down -v` to destroy volumes when schema changes. Add a comment in the compose file warning about this.
- **Cross-package imports break until shared is built.** You'll see `Cannot find module '@securum/shared'` until `packages/shared/dist/` exists. The root `build` script must build shared before anything else.
- **Docker networking typos cause silent failures.** One wrong `DATABASE_URL` = container boots but can't reach its DB. Always test with `docker compose config` first.

### Verification

`docker compose up --build` → coordinator starts, `GET localhost:4000/health` returns `{ status: "ok", db: "connected" }`. Connect to postgres-coord and confirm all 6 tables exist (including `privacy_budget`). `packages/shared` builds and exports types without errors.

---

## Phase 1 — Query Validator, Schema Rewriter, Seed Data & Tests *(Rahul)*

> **Milestone:** Shared library has a working query validator and schema rewriter (both pure functions). 3 dev org databases have seed data. Unit tests pass for all shared lib functions.

> **Note:** Phase 0 set up the shared library with type definitions and function stubs. This phase implements the query validator and schema rewriter, adds the seed data and configs, and writes unit tests that validate both the new code and the Phase 0 stubs (which will fail until Zain implements them in Phase 2 — that's expected and useful as a contract check).

### Tasks

1. **`GLOBAL_SCHEMA` constant** (add to `packages/shared`):
   ```typescript
   export const GLOBAL_SCHEMA: Record<string, string[]> = {
     transactions: ['amount', 'category', 'region', 'tx_date']
   };
   ```

2. **Query parser/validator** — implement `validateAndBuildQuery()`:
   - Input: `QueryDefinition` (from shared types).
   - Validates aggregate is in `SUPPORTED_AGGREGATES`, table is in `GLOBAL_SCHEMA`, column is in that table's allowed columns, groupBy (if present) is also an allowed column.
   - Returns `{ valid: true, sql: '...' }` or `{ valid: false, error: '...' }`.
   - SQL generation via **template selection** (not string interpolation):
     - COUNT: `SELECT COUNT(${column}) FROM ${table}`
     - SUM: `SELECT SUM(${column}) FROM ${table}`
     - AVG: `SELECT SUM(${column}) AS sum, COUNT(${column}) AS count FROM ${table}` ← returns both for global AVG computation
     - With GROUP BY: prepends `${groupBy},` to SELECT, appends `GROUP BY ${groupBy}`
   - All identifiers are checked against allowlists before insertion — no user input reaches SQL directly.

3. **Schema rewriter** — implement `rewriteQuery()`:
   - Input: `(sql: string, schemaMap: Record<string, string>)`.
   - Replaces global table and column names with local equivalents using the schema map.
   - **Important:** The SQL from `validateAndBuildQuery` uses bare column/table names (not `table.column`), so the rewriter must replace both independently. Do NOT use naive `string.replace()` — if a column name is a substring of another (e.g., `amount` inside `total_amount`), it will break. Preferred approach: use word-boundary-aware replacement, or regenerate the SQL from the parsed `QueryDefinition` using local names directly.
   - Also returns a `reverseMap` so column names in results can be mapped back to global names.
   - Pure function, no DB access — easy to unit test.

4. **Schema-map config files** — 3 files in `packages/org-node/config/`:
   - `schema-map-org1.json`: `transactions.*` → `sales.*` (total_amount, product_type, region, sale_date)
   - `schema-map-org2.json`: `transactions.*` → `orders.*` (amount, category, area, order_date)
   - `schema-map-org3.json`: `transactions.*` → `purchases.*` (price, item_class, location, purchase_date)

5. **Dev seed data** — 3 SQL scripts in `docker/dev-seed/`:
   - `seed-org1.sql`: Creates `sales` table, inserts ~10,000 rows. Amounts 10–500, 5 categories (Electronics/Clothing/Food/Furniture/Sports), 4 regions (North/South/East/West), dates in 2024–2025.
   - `seed-org2.sql`: Same distribution, `orders` table, different column names.
   - `seed-org3.sql`: Same distribution, `purchases` table, different column names.
   - Use `generate_series` + `random()` for efficient PostgreSQL-native generation.

6. **Unit tests** (add `vitest` to shared package):
   - Test `validateAndBuildQuery`: valid inputs produce correct SQL, invalid inputs are rejected.
   - Test `rewriteQuery`: SQL with global names is correctly rewritten using each schema map.
   - Test `GLOBAL_SCHEMA` is used for allowlisting (try injection-like inputs → rejected).
   - Stub tests for `computeCommitment` and `addLaplaceNoise` that document expected behavior (these will pass once Zain implements them in Phase 2).

### Gotchas

- **Seed data won't match across orgs.** `random()` produces different values per org. When you SUM across 3 orgs, expect ~7.5M total (3 × 10K × avg 250). Consider adding a `verify-seed.sql` helper that prints expected aggregates per org so you have ground truth to compare against.
- **Rewriter substring collisions.** Test with schema maps where a column name appears as a substring of another local name. This is the #1 source of subtle bugs in this phase.

### Verification

`npm -w packages/shared test` — all validator and rewriter tests pass. `docker compose up` — 3 dev org databases are seeded. `SELECT COUNT(*) FROM sales` on org1's DB returns ~10,000.

---

## Phase 2 — Coordinator Core API + Shared Crypto/DP *(Zain)*

> **Milestone:** Coordinator has full REST API: auth, org management, query submission, results retrieval, audit logging. Shared library's crypto and DP functions are implemented and tested.

### Tasks

1. **Implement shared lib functions** (in `packages/shared`):
   - `computeCommitment(value: string, nonce: string, queryId: string) → string`: `SHA256(value + nonce + queryId)` as hex string using Node.js `crypto`.
   - `addLaplaceNoise(trueValue: number, sensitivity: number, epsilon: number) → number`: Laplace mechanism via inverse CDF: `trueValue + sensitivity/epsilon * (Math.log(1 - 2*|U-0.5|) * sign(U-0.5))` where U ~ Uniform(0,1).
   - **Edge case:** `Math.random()` can return exactly 0 or 0.5, causing `log(0) = -Infinity` → `NaN` result. Fix: `let U = Math.random() - 0.5; while (U === 0) U = Math.random() - 0.5;`
   - Run Rahul's Phase 1 stub tests — they should now pass.

2. **Express app expansion** (`packages/coordinator/`):
   - Middleware: JSON body parser, CORS, global error handler returning `ErrorResponse` format.

3. **Auth module**:
   - `POST /auth/login` — accepts `{ username, password }`, returns `{ token }` (JWT). Hardcoded users in env: `ANALYST_USER`, `ANALYST_PASSWORD`.
   - JWT middleware on `/query` and `/results/*` routes — verifies token, attaches `user` to request.
   - API-key middleware for org-facing routes — checks `X-Org-Api-Key` header against `organizations.api_key_hash` (SHA-256).

4. **Organization management**:
   - `POST /orgs/register` — body: `{ name, endpointUrl }`. Generates UUID API key, stores SHA-256 hash. Returns `{ orgId, apiKey }` (shown once).
   - `GET /orgs` — list all registered orgs (id, name, endpoint, status, created_at). JWT-protected.

5. **Query submission**:
   - `POST /query` — body: `QueryDefinition`. JWT-protected.
   - Validates via `validateAndBuildQuery` from shared.
   - Stores in `queries` table with status `pending`, default epsilon from env if not provided.
   - Returns `{ queryId, status: "pending" }`.
   - **Does not broadcast** — orchestration is Phase 4.

6. **Results retrieval**:
   - `GET /results/:queryId` — returns `{ queryId, status, result?, error? }`. If `done`, includes `global_result`. JWT-protected.
   - `GET /results` — list of past queries with status. JWT-protected.

7. **Audit log helper**:
   - `logAuditEvent(queryId, orgId, eventType, payload)` — inserts into `audit_logs`. Used internally by all routes.
   - `GET /audit/:queryId` — returns audit trail for a query. JWT-protected.

### Gotchas

- **Missing env vars produce confusing errors.** If `JWT_SECRET` is not set, `jsonwebtoken` throws "secretOrPrivateKey must have a value." Add a startup check: `if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required')`. Do this for all required env vars (`DATABASE_URL`, `ANALYST_USER`, `ANALYST_PASSWORD`).
- **CORS will block dashboard requests later.** Dashboard runs on `:3000`, coordinator on `:4000`. Configure CORS now: `app.use(cors({ origin: 'http://localhost:3000' }))` or `app.use(cors())` for dev. If you skip this, Phase 5 will be blocked by browser errors.

### Verification

`npm -w packages/shared test` — all tests pass including crypto/DP. Start coordinator: `POST /auth/login` → JWT. Register an org → get API key. `POST /query` with JWT → get `queryId`. `GET /results/:queryId` → `{ status: "pending" }`.

---

## Phase 3 — Org-Node Service + Local Query Execution *(Rahul)*

> **Milestone:** An org-node receives a query, rewrites it using the schema map, runs it against its local DB, adds Laplace noise, and returns the noisy result in the `NoisyResult` format.

> **Note:** The schema rewriter you wrote in Phase 1 is already in `@securum/shared`. The DP function `addLaplaceNoise` was implemented by Zain in Phase 2. This phase wires them into a working Express service.

### Tasks

1. **Express app setup** (`packages/org-node/`):
   - Express 4 + TypeScript, same middleware pattern as coordinator (JSON parser, CORS, error handler returning `ErrorResponse`).
   - Env config: `PORT`, `DATABASE_URL`, `COORDINATOR_URL`, `ORG_ID`, `ORG_NAME`, `API_KEY`, `SCHEMA_MAP_PATH`, `DEFAULT_EPSILON`, `SUM_SENSITIVITY`.
   - PG pool connection to its own local DB.
   - `GET /health` → `{ status: "ok", db: "connected" | "disconnected", orgId: "..." }`.

2. **Schema map loader**:
   - Read `schema-map.json` from `SCHEMA_MAP_PATH` at startup.
   - Validate it has entries for all `GLOBAL_SCHEMA` columns — fail fast with clear error if mapping is incomplete.
   - Build both forward map (global → local) and reverse map (local → global) at startup.

3. **Local query executor**:
   - Takes `QueryDefinition`, calls `validateAndBuildQuery` → gets global SQL.
   - Calls `rewriteQuery(sql, schemaMap)` → gets local SQL.
   - Runs local SQL against the org's PG database.
   - Maps result column names back to global names using the reverse map.
   - Returns typed result matching `NoisyResult` shape (before noise).

4. **Differential privacy wrapper**:
   - Import `addLaplaceNoise` from `@securum/shared`.
   - Apply noise to each numeric value in the result:
     - COUNT → sensitivity = 1
     - SUM → sensitivity = `SUM_SENSITIVITY` env var (default 500)
     - AVG → apply noise to sum and count separately (sensitivity: sum = `SUM_SENSITIVITY`, count = 1)
   - Return `NoisyResult` with noise applied.

5. **API endpoint**:
   - `POST /execute` — body: `{ queryId, queryDefinition, epsilon }`.
   - Pipeline: validate → rewrite → execute → noise → return `{ queryId, noisyResult: NoisyResult }`.
   - Error cases return `ErrorResponse` with appropriate code.

### Gotchas

- **Org-node endpoints have no auth.** Anyone who can reach the org-node's port can call `POST /execute`. In the Docker network this is acceptable, but be aware — if asked, say "the Docker network provides isolation, and a production system would add mTLS or a shared secret header."
- **Schema map file not found = infinite restart loop.** If `SCHEMA_MAP_PATH` is wrong, the org-node crashes and Docker restarts it forever. The `restart: on-failure` setting from Phase 0 prevents this, but also log the exact path attempted so the error is obvious.

### Verification

`POST org-node:5001/execute` with `{ queryId: "test", queryDefinition: { aggregate: "COUNT", column: "amount", table: "transactions" }, epsilon: 1.0 }` → returns `{ queryId: "test", noisyResult: { type: "scalar", value: <noisy number> } }`. Direct `SELECT COUNT(total_amount) FROM sales` on org1's DB → different value. `POST /execute` with invalid column → `{ error: "...", code: "INVALID_QUERY" }`.

---

## Phase 4 — Commit–Reveal Protocol *(Zain)*

> **Milestone:** End-to-end flow works: analyst submits query → coordinator broadcasts → orgs commit → reveal → coordinator verifies, aggregates, returns result. This ties the whole system together.

### Tasks

1. **Org-node: commit endpoint** (`POST /commit`):
   - Body: `{ queryId, queryDefinition, epsilon }`.
   - Reuses Phase 3 pipeline: rewrite → execute → noise → get `NoisyResult`.
   - Generates nonce: `crypto.randomBytes(32).toString('hex')`.
   - Computes `commitmentHash = computeCommitment(JSON.stringify(noisyResult), nonce, queryId)`.
   - Stores `{ noisyResult, nonce }` in an in-memory `Map<queryId, ...>`.
   - Returns `{ queryId, commitmentHash }`.
   - Error: returns `ErrorResponse` with code `COMMITMENT_FAILED`.

2. **Org-node: reveal endpoint** (`POST /reveal`):
   - Body: `{ queryId }`.
   - Looks up stored data for that queryId.
   - Returns `{ queryId, noisyResult, nonce }`.
   - Deletes entry from the Map.
   - If not found (expired, already revealed, or never committed): returns `ErrorResponse` with code `COMMITMENT_FAILED`.

3. **Coordinator: orchestration engine** — modify `POST /query` to trigger the full pipeline:
   1. Store query with status `pending` (existing Phase 2 logic).
   2. **Privacy budget check** — for each active org, compute `SUM(epsilon_spent)` from `privacy_budget`. If adding this query’s epsilon would exceed `MAX_EPSILON_PER_ORG` (env var, default 10.0), reject with `{ status: "failed", error: "Privacy budget exhausted" }`.
   3. Set status → `committing`. Log audit event.
   4. **Broadcast commit** — `POST org:port/commit` to all active orgs in parallel. Timeout: 30 seconds per org.
   - **Use `Promise.allSettled`, NOT `Promise.all`.** With `Promise.all`, one org throwing an error rejects the entire batch. `Promise.allSettled` lets you collect both successes and failures, then filter. This is a one-line difference but critical.
   5. Collect responses. For each success: store `commitmentHash` in `commitments` table, log audit.
   6. **Quorum check** — if committed orgs < `QUORUM_MIN`: set status → `failed`, log reason, return `{ queryId, status: "failed", error: "Quorum not met" }`.
   7. Set status → `revealing`. Log audit event.
   8. **Broadcast reveal** — `POST org:port/reveal` to all orgs that committed. Timeout: 30 seconds.
   9. **Verify each reveal:**
      - Recompute: `computeCommitment(JSON.stringify(noisyResult), nonce, queryId)`.
      - Compare with stored `commitmentHash`.
      - Match → `verified = true`. Mismatch → `verified = false`, log audit with details.
   10. **Post-reveal checks:**
       - Exclude unverified orgs.
       - If remaining verified orgs < `QUORUM_MIN` → status `failed`.
   11. **Global aggregation** (over verified results only):
       - `scalar` (COUNT/SUM): sum all `value` fields.
       - `avg`: sum all `sum` fields, sum all `count` fields, divide.
       - `grouped` (GROUP BY COUNT/SUM): merge by `groupKey`, sum `value` per group.
       - `grouped_avg`: merge by `groupKey`, sum `sum` and `count`, divide per group.
       - **AVG edge case:** Noisy `count` can be 0 or negative. Clamp with `Math.max(count, 1)` before dividing to avoid division by zero or negative averages.
   12. Store result in `results` table. Record epsilon spent in `privacy_budget` for each participating org. Set status → `done`. Log final audit.

4. **HTTP contract with org-nodes:**
   - On `2xx`: parse response body as expected type.
   - On `4xx`: treat as org-side rejection, log and exclude.
   - On `5xx` or timeout: treat as org failure, log and exclude.
   - Never crash the orchestration loop — always catch, log, continue.

5. **Make `POST /query` synchronous:**
   - The orchestration takes 2–5 seconds for 3 orgs. Instead of returning immediately and forcing the client to poll, run the full pipeline inline and return the final result.
   - Response: `{ queryId, status: "done", result: ... }` on success, or `{ queryId, status: "failed", error: "..." }` on failure.
   - The `GET /results/:queryId` endpoint still works for historical lookups.
   - If the pipeline exceeds 60 seconds, abort and return `failed`.

### Gotchas

- **Synchronous orchestration can timeout.** The full commit–reveal round trip can take up to 60s if orgs are slow. Vite's dev proxy defaults to 30s timeout, and browsers may drop the connection. Fix: set axios timeout to 60s in the dashboard, and add `proxy.timeout` in Vite config if using a proxy.
- **In-memory Map loses data on container restart.** If an org-node restarts between commit and reveal, the committed data is gone and that org's reveal will fail. This is fine — the quorum system handles it — but don't restart containers mid-query during demos.
- **Privacy budget race condition.** Two concurrent queries could both pass the budget check before either records its spend. At college scale (one query at a time) this won't happen, but if asked: "a production system would use `SELECT ... FOR UPDATE` to lock the budget rows."

### Verification

`POST /query` with `{ aggregate: "SUM", column: "amount", table: "transactions", groupBy: "category" }` → response includes `{ status: "done", result: { type: "grouped", groups: [...] } }`. Watch coordinator logs: commit broadcast → 3 responses → reveal broadcast → 3 verified → aggregated. Kill one org container → re-run → still succeeds with 2/3 (if QUORUM_MIN=2). Tamper with a reveal (hardcode wrong value) → commitment mismatch logged, org excluded.

---

## Phase 5 — React Dashboard *(Rahul)*

> **Milestone:** Analyst can log in, submit a query, see results, and view history — all in the browser.

> **Note:** The backend is fully functional at this point. `POST /query` returns results synchronously. The dashboard just needs to call the API and display results — no complex polling state machine needed.

### Tasks

1. **Project scaffold** (`packages/dashboard/`):
   - `npm create vite@latest` with React + TypeScript template.
   - Install: `react-router-dom`, `axios`, `recharts`, `tailwindcss`, `@tailwindcss/forms`.
   - Set up Tailwind config.
   - Axios instance: base URL from `VITE_API_URL` (default `http://localhost:4000`), JWT attached via interceptor.
   - Add `dashboard.Dockerfile` (Vite dev server).

2. **Auth context + routing**:
   - `AuthContext` — stores JWT in state (localStorage is fine for a demo).
   - Routes: `/login`, `/` (home), `/query` (builder), `/results/:id` (single result), `/history` (all results).
   - Protected route wrapper: redirects to `/login` if no JWT.

3. **Login page** (`/login`):
   - Simple form: username + password.
   - Submit → `POST /auth/login` → store JWT → redirect to `/`.
   - Show error on failure.

4. **Home page** (`/`):
   - Fetch `GET /orgs` → card showing org count.
   - Fetch `GET /results?limit=5` → card showing recent query count + list of last 5 queries.
   - Link to `/query` and `/history`.

5. **Query Builder page** (`/query`):
   - Dropdowns: aggregate (COUNT/SUM/AVG), column, table (`transactions` only for now), optional GROUP BY.
   - Epsilon slider: 0.1 → 10.0, default 1.0. Show label: "Lower = more private, less accurate".
   - Submit button → `POST /query` (blocks until result) → show loading spinner → on response, navigate to `/results/:queryId`.
   - **Disable the submit button while loading** to prevent duplicate queries (each one spends privacy budget).

6. **Result page** (`/results/:id`):
   - Fetch `GET /results/:id`.
   - If `done`: show result in a clean table.
     - For grouped results: also render a **bar chart** (Recharts `BarChart`).
   - If `failed`: show error message with reason.
   - Link back to `/query` to run another.

7. **History page** (`/history`):
   - Fetch `GET /results`.
   - Table: Query ID (truncated), aggregate type, status badge, timestamp, link to detail.

### Gotchas

- **CORS errors in the browser.** If the coordinator's CORS config from Phase 2 isn't set correctly, every API call from the dashboard will fail with an opaque network error. Test with a simple `fetch` from the browser console before building components.
- **Axios timeout.** The default axios timeout may be too short for the synchronous query endpoint. Set `timeout: 60000` on the axios instance.

### Verification

Open `localhost:3000`. Log in. Submit "SUM of amount GROUP BY category" with epsilon=1.0. See loading spinner for ~3 seconds. See results table + bar chart. Go to history, see the query listed. Submit a second query, confirm both appear.

---

## Phase 6 — Polish, Documentation & Demo-Readiness *(Both)*

> **Milestone:** Project is demo-ready and can be spun up by anyone with `docker compose up`. This phase is collaborative — split tasks as needed.

### Tasks

1. **Docker compose finalization**:
   - `docker compose up --build` boots the full demo stack.
   - Add healthchecks to all services with proper `depends_on` conditions.
   - Seed data runs automatically on first boot.

2. **README.md**:
   - Project description + architecture diagram (Mermaid).
   - Quick start: `git clone` → `docker compose up` → open browser.
   - API reference (all endpoints, request/response shapes).
   - Threat model summary (reference the PLAN.md section).

3. **Automated end-to-end test** (`test-e2e.sh`):
   - Bash script that runs after `docker compose up`:
     1. Waits for all services to be healthy (poll `/health` endpoints).
     2. Logs in → gets JWT.
     3. Registers 3 orgs → stores API keys.
     4. Submits a COUNT query → asserts status is `done` and result is a number.
     5. Submits a SUM GROUP BY query → asserts grouped results are returned.
     6. Verifies audit log has entries for the query.
     7. Prints PASS/FAIL summary.
   - Uses only `curl` and `jq` — no extra dependencies.
   - **Add a `jq` check** at the top of the script: `command -v jq >/dev/null || { echo "Install jq: brew install jq"; exit 1; }`. `jq` isn't installed by default on macOS or many Linux distros.
   - **Why this matters:** An automated integration test that anyone can run with one command is far more impressive than "we tested with curl manually."

4. **Cleanup**:
   - Secrets in `.env` file (no hardcoded values in code).
   - Root `.gitignore` finalized.
   - MIT license file.

### Gotchas

- **First `docker compose up` on a clean machine takes 5–10 minutes.** Downloading images + building 4 containers + seeding 3 DBs is slow. Pre-pull images the night before a demo: `docker compose pull && docker compose build`.
- **Init SQL only runs once.** If you change the coordinator DB schema during polish, you must `docker compose down -v` first. Add this as a comment in README.

### Verification

Clone repo on a clean machine. `docker compose up --build`. Run `./test-e2e.sh` — all checks pass. Open `localhost:3000` — full UI flow works.

---

## Timeline Estimate (Two Devs, Alternating)

| Phase | Owner | Description | Effort |
|-------|-------|-------------|--------|
| **0** | Zain | Monorepo + Docker + DB schema + shared types + coordinator skeleton | 2 days |
| **1** | Rahul | Query validator + schema rewriter + seed data + configs + tests | 2 days |
| **2** | Zain | Coordinator full API + shared crypto/DP implementations | 2 days |
| **3** | Rahul | Org-Node service + local execution + DP wrapper | 2 days |
| **4** | Zain | Commit–Reveal + orchestration + global aggregation | 3 days |
| **5** | Rahul | React Dashboard + dashboard Dockerfile | 3 days |
| **6** | Both | Polish, docs, demo script | 1 day |
| | | **Total (wall clock, sequential)** | **~15 days** |

> Wall-clock time per person: Zain ~7 days, Rahul ~7 days, +1 day shared. Each person is idle while the other works — use that time for reading ahead, reviewing the previous phase, or working on docs early.

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
| Testing | Vitest (unit) + automated e2e test script (bash/curl) |
| Containerization | Docker + docker compose |
| Auth | JWT (analyst) + API keys (service-to-service) |
| Crypto | Node.js `crypto` (SHA-256, randomBytes) |
| Privacy | Laplace mechanism (differential privacy) |

---

*All tools and libraries are free and open-source. Zero vendor lock-in.*
