# Phase 3 - Org-Node Service + Local Query Execution

**Owner:** Rahul  
**Target duration:** 2 days  
**Depends on:** Phase 0 + Phase 1 + Phase 2 complete

---

## Goal

By the end of Phase 3, you should have:

1. A working Org-Node Express service that connects to its local PostgreSQL database.
2. Schema-map loading and startup validation so bad mappings fail fast.
3. A local execution pipeline that validates, rewrites, and runs analyst queries.
4. Differential privacy wrapping applied to execution results using shared helpers.
5. A stable `POST /execute` endpoint returning typed noisy results for coordinator use.

This phase does **not** implement commit-reveal endpoints (`/commit`, `/reveal`) or coordinator fan-out/orchestration. Those belong to Phase 4.

---

## Deliverables Checklist

- [ ] Org-Node Express app boots with strict env checks.
- [ ] `GET /health` reports service and DB status.
- [ ] Schema map is loaded from `SCHEMA_MAP_PATH` and validated at startup.
- [ ] Query pipeline wired: `validateAndBuildQuery -> rewriteQuery -> local SQL execution`.
- [ ] Local column names mapped back to global names where needed.
- [ ] DP wrapper applies `addLaplaceNoise` with aggregate-specific sensitivities.
- [ ] `POST /execute` implemented with stable request/response contract.
- [ ] Error responses use consistent `{ error, code }` shape.
- [ ] Integration smoke checks pass against seeded org DBs.

---

## Data/Flow Overview

1. Coordinator sends query payload to an Org-Node via `POST /execute`.
2. Org-Node validates the query definition through shared validator.
3. Org-Node rewrites global schema SQL into local schema SQL using org mapping.
4. Org-Node executes rewritten SQL on its local PostgreSQL database.
5. Org-Node converts execution output into a standardized result shape.
6. Org-Node applies differential privacy noise and returns noisy result.

High-level flow:

`coordinator query -> validate -> rewrite -> execute local SQL -> add noise -> respond`

---

## Recommended File Plan

### Org-Node package

- `packages/org-node/src/config.ts`: strict env parsing and validation.
- `packages/org-node/src/db.ts`: PostgreSQL pool setup.
- `packages/org-node/src/index.ts`: express app + route wiring.
- `packages/org-node/src/schema.ts`: schema-map file loading + validation.
- `packages/org-node/src/executor.ts`: local execution pipeline.
- `packages/org-node/src/noise.ts`: DP application helpers.
- `packages/org-node/src/types.ts` (optional): local result types for endpoint payloads.

### Existing config inputs

- `packages/org-node/config/schema-map-org1.json`
- `packages/org-node/config/schema-map-org2.json`
- `packages/org-node/config/schema-map-org3.json`

If you want to keep this phase simple, implementation can stay in fewer files as long as boundaries remain clear.

---

## Step 1 - Org-Node App Skeleton and Config

## 1.1 Required env contract

Use strict startup checks for required values:

- `PORT`
- `DATABASE_URL`
- `COORDINATOR_URL`
- `ORG_NAME`
- `SCHEMA_MAP_PATH`

Optional with defaults:

- `DEFAULT_EPSILON` (default `1.0`)
- `SUM_SENSITIVITY` (default `500`)

Example config pattern:

```ts
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

function parsePositiveNumber(name: string, raw: string, fallback: number): number {
  const n = Number(raw || fallback);
  if (!Number.isFinite(n) || !(n > 0)) {
    throw new Error(`${name} must be a positive number`);
  }
  return n;
}
```

## 1.2 Middleware and app defaults

Minimum middleware stack:

1. `cors()` (dev-friendly)
2. `express.json()`
3. route handlers
4. global error middleware returning JSON error contract

## 1.3 Health endpoint

Implement:

- `GET /health`

Response shape:

```json
{ "status": "ok", "db": "connected", "orgName": "hospital-alpha" }
```

Fallback on DB failure:

```json
{ "status": "error", "db": "disconnected", "orgName": "hospital-alpha" }
```

---

## Step 2 - Schema Map Loader + Startup Validation

## 2.1 Load mapping file from disk

Read JSON from `SCHEMA_MAP_PATH` during startup, not lazily on first request.

Expected shape:

```json
{
  "tables": { "transactions": "sales" },
  "columns": {
    "amount": "total_amount",
    "category": "product_type",
    "region": "region",
    "tx_date": "sale_date"
  }
}
```

## 2.2 Validate map completeness

Validate against shared global schema constants:

1. Every required global table key is present in `tables`.
2. Every required global column key is present in `columns`.
3. Mapped values are non-empty strings.
4. No duplicate local-column collisions unless intentionally allowed and documented.

Fail startup with a clear message if validation fails. This prevents runtime surprises.

## 2.3 Build reverse mapping

Create reverse map once at startup:

- `localColumn -> globalColumn`

This is useful when transforming grouped SQL outputs back into global field naming.

---

## Step 3 - Local Query Execution Pipeline

## 3.1 Validate query definition

Use shared validator:

```ts
const parsed = validateAndBuildQuery(queryDefinition);
if (!parsed.valid) {
  return { error: parsed.error, code: 'INVALID_QUERY' };
}
```

## 3.2 Rewrite SQL for local schema

Use shared rewriter with loaded schema map:

```ts
const rewritten = rewriteQuery(parsed.sql, schemaMap);
const localSql = rewritten.sql;
```

## 3.3 Execute local SQL safely

Execute rewritten query through PG pool.

Requirements:

1. Use parameterized SQL whenever values are dynamic.
2. Keep identifier trust anchored to shared allowlisting logic.
3. Catch DB exceptions and return typed DB errors.

## 3.4 Normalize execution output

Turn raw DB rows into a stable internal result type before DP noise.

Support these modes:

1. Scalar COUNT/SUM
2. AVG mode (`sum` and `count` needed together)
3. Grouped scalar
4. Grouped avg (`sum` + `count` per group)

Suggested internal shape:

```ts
type LocalResult =
  | { type: 'scalar'; value: number }
  | { type: 'avg'; sum: number; count: number }
  | { type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }
  | { type: 'grouped_avg'; groups: Array<{ groupKey: string; sum: number; count: number }> };
```

---

## Step 4 - Differential Privacy Wrapper

## 4.1 Integrate shared helper

Use `addLaplaceNoise` from shared package.

For each query family:

1. COUNT: sensitivity = `1`
2. SUM: sensitivity = `SUM_SENSITIVITY`
3. AVG: noise on both sum and count
4. Grouped: apply per group value
5. Grouped AVG: apply to each group's sum and count

## 4.2 Epsilon behavior

For Phase 3 endpoint:

- Use request epsilon when provided and valid.
- Else fallback to `DEFAULT_EPSILON`.
- Reject if epsilon is non-finite or `<= 0`.

## 4.3 Numeric safety

Before returning:

1. Ensure all noisy outputs are finite numbers.
2. Clamp or reject impossible values when needed for safety (for example count less than 0).
3. Keep shape stable even if noise is large.

---

## Step 5 - `POST /execute` API Contract

## 5.1 Request body

```json
{
  "queryId": "uuid-or-client-id",
  "queryDefinition": {
    "aggregate": "SUM",
    "column": "amount",
    "submitter": "analyst"
  },
  "epsilon": 1.0
}
```

## 5.2 Response body (success)

```json
{
  "queryId": "...",
  "noisyResult": {
    "type": "scalar",
    "value": 1234.56
  }
}
```

Other valid noisy shapes:

```json
{ "type": "avg", "sum": 1000.2, "count": 49.7 }
```

```json
{
  "type": "grouped",
  "groups": [
    { "groupKey": "North", "value": 112.3 },
    { "groupKey": "South", "value": 98.7 }
  ]
}
```

## 5.3 Error shape

Use stable error contract:

```json
{ "error": "Unsupported aggregate", "code": "INVALID_QUERY" }
```

Recommended error codes in this phase:

- `INVALID_QUERY`
- `DB_ERROR`
- `SCHEMA_MISMATCH`
- `TIMEOUT`

---

## Step 6 - Security and Reliability Notes

1. Keep Org-Node service private to docker internal network in dev.
2. Do not expose raw local SQL errors directly to coordinator; sanitize messages.
3. Never return raw rows or local table names in external error payloads.
4. Keep schema-map path and parse errors explicit in logs for quick diagnosis.
5. Use request timeouts for DB calls to avoid hanging coordinator orchestration in Phase 4.

---

## Testing Plan

## Unit-level checks

1. Schema-map loader rejects invalid/missing mappings.
2. Executor returns correct normalized type for COUNT, SUM, AVG, GROUP BY.
3. DP wrapper outputs finite values and preserves expected shape.
4. Invalid epsilon handling returns deterministic error response.

## Integration checks (manual)

Start stack:

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

Health check:

```bash
curl -s http://localhost:5001/health
```

Execute COUNT:

```bash
curl -s -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "queryId":"q1",
    "queryDefinition":{"aggregate":"COUNT","column":"amount","submitter":"analyst"},
    "epsilon":1.0
  }'
```

Execute grouped SUM:

```bash
curl -s -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "queryId":"q2",
    "queryDefinition":{"aggregate":"SUM","column":"amount","grouping":"region","submitter":"analyst"},
    "epsilon":1.0
  }'
```

Invalid column (expect `INVALID_QUERY`):

```bash
curl -s -X POST http://localhost:5001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "queryId":"q3",
    "queryDefinition":{"aggregate":"SUM","column":"ssn","submitter":"analyst"},
    "epsilon":1.0
  }'
```

---

## Common Pitfalls

1. Wrong `SCHEMA_MAP_PATH` causes boot crash loops; validate path at startup and log resolved absolute path.
2. Returning local schema names in errors leaks internals and creates coupling with private DB design.
3. Forgetting to preserve AVG as `sum + count` breaks Phase 4 global average aggregation.
4. Treating grouped output as scalar leads to malformed API payloads and downstream parser errors.
5. Applying noise before type normalization can cause inconsistent output shapes.

---

## Phase 3 Done Criteria

Phase 3 is done when all statements below are true:

- Org-Node boots with strict env and schema-map validation.
- `GET /health` reliably reports DB state.
- `POST /execute` handles valid COUNT/SUM/AVG/grouped queries end-to-end.
- Noisy result payloads are shape-stable and finite.
- Invalid queries return consistent JSON error contracts.
- Logs are sufficient to debug schema-map and query execution failures.

---

## Suggested Commit Order

1. `feat(org-node): scaffold express app and strict config`
2. `feat(org-node): add schema-map loader and validation`
3. `feat(org-node): implement local query executor pipeline`
4. `feat(org-node): add differential privacy wrapper`
5. `feat(org-node): add execute endpoint and error contracts`
6. `test(org-node): add phase3 integration and validation checks`

This order keeps diffs reviewable and isolates failures quickly during development.
