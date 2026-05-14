# Phase 2 - Coordinator Core API + Shared Crypto/DP

**Owner:** Zain  
**Target duration:** 2 days  
**Depends on:** Phase 0 + Phase 1 complete

---

## Goal

By the end of Phase 2, you should have:

1. Working shared implementations for commitment hashing and Laplace noise.
2. Coordinator API expanded with auth, org management, query submission, result retrieval, and audit endpoints.
3. Strong startup/env validation so misconfiguration fails fast.
4. Shared tests passing (including previously stubbed tests from Phase 1).

This phase does **not** run full commit-reveal orchestration yet. Query submission stores a pending query only. Full orchestration happens in Phase 4.

---

## Deliverables Checklist

- [ ] `computeCommitment` implemented in shared package.
- [ ] `addLaplaceNoise` implemented with edge-case handling.
- [ ] Coordinator middleware stack expanded (CORS, JSON, error shape).
- [ ] JWT login endpoint implemented.
- [ ] JWT middleware protecting analyst endpoints.
- [ ] API-key middleware for org-facing routes.
- [ ] `POST /orgs/register` and `GET /orgs` implemented.
- [ ] `POST /query`, `GET /results/:queryId`, `GET /results` implemented.
- [ ] Audit helper + `GET /audit/:queryId` implemented.
- [ ] Required env var checks added at startup.

---

## Data/Flow Overview

1. Analyst logs in using username/password.
2. Coordinator returns JWT.
3. Analyst submits query with JWT.
4. Coordinator validates query through shared validator and stores it as `pending`.
5. Analyst polls/fetches results endpoint and sees status.
6. Audit events are stored for key actions.

---

## Recommended File Plan

### Shared package

- `packages/shared/src/stubs.ts` (or wherever stubs currently live): replace stubs with real logic.
- `packages/shared/src/index.ts`: ensure exports include the implemented functions.
- `packages/shared/src/__tests__/...`: keep tests green and update only if signatures changed intentionally.

### Coordinator package

- `packages/coordinator/src/config.ts`: strict env loading.
- `packages/coordinator/src/index.ts`: route wiring and middleware.
- `packages/coordinator/src/db.ts`: existing pool usage, reused.
- Optional split for maintainability:
  - `packages/coordinator/src/middleware/auth.ts`
  - `packages/coordinator/src/routes/*.ts`
  - `packages/coordinator/src/utils/audit.ts`

If you want to keep the project simple, a single-file route implementation in `index.ts` is okay for this phase.

---

## Step 1 - Implement Shared Crypto + DP

## 1.1 `computeCommitment`

Use SHA-256 over exact concatenation:

`value + nonce + queryId`

Code snippet:

```ts
import { createHash } from 'crypto';

export function computeCommitment(value: string, nonce: string, queryId: string): string {
  return createHash('sha256').update(value + nonce + queryId).digest('hex');
}
```

Implementation notes:

- Keep encoding default UTF-8.
- Return lowercase hex string.
- Do not stringify inside this function except where callers explicitly pass JSON.

## 1.2 `addLaplaceNoise`

Use inverse CDF sampling with edge-case handling for zero:

```ts
export function addLaplaceNoise(trueValue: number, sensitivity: number, epsilon: number): number {
  if (!Number.isFinite(trueValue)) throw new Error('trueValue must be finite');
  if (!(sensitivity > 0)) throw new Error('sensitivity must be > 0');
  if (!(epsilon > 0)) throw new Error('epsilon must be > 0');

  let u = Math.random() - 0.5;
  while (u === 0) {
    u = Math.random() - 0.5;
  }

  const scale = sensitivity / epsilon;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return trueValue + noise;
}
```

Why this shape:

- `u` in `(-0.5, 0.5)` gives symmetric Laplace noise.
- Retry on `u === 0` avoids `log(1)` ambiguity in some derived formulas and keeps behavior consistent with the roadmap edge case.
- Explicit input validation avoids hidden NaN propagation.

---

## Step 2 - Harden Config Loading

Fail fast if required env vars are missing.

Required envs for this phase:

- `DATABASE_URL`
- `JWT_SECRET`
- `ANALYST_USER`
- `ANALYST_PASSWORD`
- Optional with defaults: `PORT`, `QUORUM_MIN`, `DEFAULT_EPSILON`, `MAX_EPSILON_PER_ORG`

Code snippet:

```ts
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} env var is required`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: requireEnv('DATABASE_URL'),
  jwtSecret: requireEnv('JWT_SECRET'),
  analystUser: requireEnv('ANALYST_USER'),
  analystPassword: requireEnv('ANALYST_PASSWORD'),
  quorumMin: Number(process.env.QUORUM_MIN ?? 2),
  defaultEpsilon: Number(process.env.DEFAULT_EPSILON ?? 1.0),
  maxEpsilonPerOrg: Number(process.env.MAX_EPSILON_PER_ORG ?? 10.0)
};
```

---

## Step 3 - Coordinator Middleware and Error Contract

Use a consistent JSON error format matching shared `ErrorResponse` intent.

Minimum middleware stack:

1. `cors()` (dev-friendly)
2. `express.json()`
3. auth middlewares
4. route handlers
5. global error middleware

Suggested error response shape:

```json
{ "error": "Invalid aggregate", "code": "INVALID_QUERY" }
```

Recommended internal helper:

```ts
type ErrorCode =
  | 'INVALID_QUERY'
  | 'SCHEMA_MISMATCH'
  | 'DB_ERROR'
  | 'TIMEOUT'
  | 'COMMITMENT_FAILED'
  | 'QUORUM_NOT_MET'
  | 'UNAUTHORIZED';

function sendError(res: express.Response, status: number, error: string, code: ErrorCode) {
  res.status(status).json({ error, code });
}
```

---

## Step 4 - Auth Module

## 4.1 `POST /auth/login`

Input:

```json
{ "username": "analyst", "password": "secret" }
```

Output:

```json
{ "token": "<jwt>" }
```

JWT payload can stay minimal for now:

```ts
{ sub: username, role: 'analyst' }
```

## 4.2 JWT middleware

Apply to analyst routes:

- `POST /query`
- `GET /results`
- `GET /results/:queryId`
- `GET /orgs`
- `GET /audit/:queryId`

Token source: `Authorization: Bearer <token>`

## 4.3 API-key middleware

For org-facing routes (future-proof for Phase 4), verify `X-Org-Api-Key` by hashing incoming key and comparing with `organizations.api_key_hash`.

Hash method: SHA-256 hex.

---

## Step 5 - Organization Management Endpoints

## 5.1 `POST /orgs/register`

Body:

```json
{ "name": "Org One", "endpointUrl": "http://org-node-1:5001" }
```

Behavior:

1. Generate `orgId` (UUID).
2. Generate API key (strong random bytes).
3. Store only hash in DB.
4. Return plaintext API key once.

Response example:

```json
{ "orgId": "uuid", "apiKey": "plaintext-once" }
```

## 5.2 `GET /orgs`

JWT-protected. Return safe metadata only:

- id
- name
- endpoint URL
- status
- created_at

Do not return API key hash unless absolutely needed.

---

## Step 6 - Query and Result Endpoints

## 6.1 `POST /query` (JWT)

1. Validate request body with shared `validateAndBuildQuery`.
2. Determine epsilon: body value or config default.
3. Insert query record with status `pending`.
4. Audit log: query submitted.
5. Return `{ queryId, status: "pending" }`.

Code snippet:

```ts
app.post('/query', requireJwt, async (req, res) => {
  const def = req.body;
  const parsed = validateAndBuildQuery(def);

  if (!parsed.valid) {
    return sendError(res, 400, parsed.error, 'INVALID_QUERY');
  }

  const epsilon = Number(def.epsilon ?? config.defaultEpsilon);
  const queryId = randomUUID();

  await pool.query(
    `INSERT INTO queries (id, submitted_by, query_definition, status, quorum, epsilon)
     VALUES ($1, $2, $3::jsonb, 'pending', $4, $5)`,
    [queryId, req.user.sub, JSON.stringify(def), config.quorumMin, epsilon]
  );

  await logAuditEvent(queryId, null, 'QUERY_SUBMITTED', { submittedBy: req.user.sub });
  return res.status(201).json({ queryId, status: 'pending' });
});
```

## 6.2 `GET /results/:queryId` (JWT)

Return shape:

```json
{ "queryId": "...", "status": "pending" }
```

or

```json
{ "queryId": "...", "status": "done", "result": { ... } }
```

or

```json
{ "queryId": "...", "status": "failed", "error": "..." }
```

## 6.3 `GET /results` (JWT)

Return recent query list with status and timestamps for dashboard history.

---

## Step 7 - Audit Logging Helper

Create one helper used by all routes:

```ts
async function logAuditEvent(
  queryId: string | null,
  orgId: string | null,
  eventType: string,
  payload: unknown
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (id, query_id, org_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), queryId, orgId, eventType, JSON.stringify(payload ?? {})]
  );
}
```

Then expose `GET /audit/:queryId` as JWT-protected read endpoint.

---

## Security Notes for This Phase

1. Keep `api_key_hash` only, never store plaintext API keys.
2. Use parameterized SQL (`$1`, `$2`, ...) for every DB write/read with user input.
3. Return generic auth failure messages (`Invalid credentials`) to avoid user enumeration.
4. Keep CORS open in dev, but document tightening policy for production.
5. Validate numeric ranges for epsilon (`0 < epsilon <= MAX_EPSILON_PER_ORG`).

---

## Testing Plan

## Unit tests (shared)

Run:

```bash
npm -w packages/shared test
```

Expected:

- `computeCommitment` deterministic for same inputs.
- Different nonce/queryId changes commitment.
- `addLaplaceNoise` returns finite number.
- Input validation throws on invalid epsilon/sensitivity.

## Integration checks (coordinator)

1. Start coordinator and DB.
2. `POST /auth/login` returns token.
3. `POST /orgs/register` returns `orgId` and one-time `apiKey`.
4. `POST /query` with JWT returns pending query id.
5. `GET /results/:queryId` returns pending status.
6. `GET /audit/:queryId` returns at least one event.

---

## Common Pitfalls

1. Missing `JWT_SECRET` causes runtime crash at first token operation; fail at startup instead.
2. Forgetting `await` on DB calls causes racey responses and empty audit trails.
3. Returning inconsistent error shapes breaks frontend assumptions in Phase 5.
4. Accidentally importing unbuilt shared package artifacts in Docker; ensure shared builds first.
5. Using `Promise.all` later for org fan-out can fail all on one rejection. Save `Promise.allSettled` for Phase 4 orchestration.

---

## Phase 2 Done Criteria

Phase 2 is done when all statements below are true:

- Shared tests are green and no longer rely on placeholder stubs for commitment/noise.
- Coordinator boots with strict env checks.
- JWT login works end-to-end.
- Org registration persists to DB and returns one-time API key.
- Query submission stores pending rows and validates with shared validator.
- Results and audit endpoints return consistent JSON contracts.

---

## Suggested Commit Order

1. `feat(shared): implement commitment hash and laplace noise`
2. `feat(coordinator): add strict config and auth module`
3. `feat(coordinator): add org registration/list endpoints`
4. `feat(coordinator): add query/results/audit endpoints`
5. `test(shared): finalize phase2 crypto and dp tests`

This keeps review diffs focused and easier to debug.
