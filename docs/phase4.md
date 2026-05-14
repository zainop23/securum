# Phase 4 — Commit–Reveal Protocol & Orchestration *(Zain)*

> **Owner:** Zain  
> **Effort estimate:** 3 days  
> **Depends on:** Phase 3 (Rahul's org-node service with `POST /execute`)  
> **Milestone:** End-to-end flow works — analyst submits query → coordinator broadcasts → orgs commit → reveal → coordinator verifies, aggregates, returns final result.

---

## Overview

This phase ties the entire system together. Before this phase, `POST /query` only stored the query in the DB and returned `{ status: "pending" }`. After this phase, it runs the full commit–reveal orchestration pipeline synchronously and returns the final aggregated result.

The commit–reveal protocol ensures that:
1. Each org computes and **locks in** its noisy result via a cryptographic commitment hash.
2. Only after all commits are collected does the coordinator ask orgs to **reveal** their results.
3. Revealed values are verified against commitments — any tampered result is detected and excluded.
4. Global aggregation runs only over **verified** results.

---

## Prerequisites

Before starting, confirm the following are in place from earlier phases:

- [x] `computeCommitment()` is implemented in `packages/shared/src/crypto.ts` (Phase 2).
- [x] `addLaplaceNoise()` is implemented in `packages/shared/src/dp.ts` (Phase 2).
- [x] `validateAndBuildQuery()` and `rewriteQuery()` are implemented in `packages/shared` (Phase 1).
- [x] Org-node `POST /execute` endpoint works (Phase 3).
- [x] Coordinator `POST /query` stores query and returns `pending` (Phase 2).
- [x] DB tables: `commitments`, `results`, `privacy_budget`, `audit_logs`, `queries` all exist (Phase 0).

Pull Rahul's branch, run `docker compose up --build`, and verify org-nodes are healthy before writing any Phase 4 code.

---

## Task Breakdown

### Task 1 — Org-Node: `POST /commit` Endpoint

**File:** `packages/org-node/src/routes/commit.ts`

**What it does:**
- Receives `{ queryId, queryDefinition, epsilon }` from the coordinator.
- Runs the Phase 3 pipeline: validate → rewrite → execute → noise → `NoisyResult`.
- Generates a random nonce and computes a commitment hash over the result.
- Stores `{ noisyResult, nonce }` in an **in-memory Map** keyed by `queryId`.
- Returns only the `commitmentHash` back to the coordinator (not the result itself).

**Implementation:**

```typescript
// packages/org-node/src/routes/commit.ts
import crypto from 'crypto';
import { computeCommitment } from '@securum/shared';
import { runLocalQuery } from '../executor'; // Phase 3 function

// In-memory store: { noisyResult, nonce }
export const pendingCommitments = new Map<string, { noisyResult: NoisyResult; nonce: string }>();

router.post('/commit', async (req, res) => {
  const { queryId, queryDefinition, epsilon } = req.body;

  try {
    // Reuse Phase 3 pipeline
    const noisyResult = await runLocalQuery(queryDefinition, epsilon);

    // Generate nonce
    const nonce = crypto.randomBytes(32).toString('hex');

    // Compute commitment hash
    const commitmentHash = computeCommitment(
      JSON.stringify(noisyResult),
      nonce,
      queryId
    );

    // Store for later reveal
    pendingCommitments.set(queryId, { noisyResult, nonce });

    res.json({ queryId, commitmentHash });
  } catch (err) {
    res.status(500).json({ error: 'Commitment failed', code: 'COMMITMENT_FAILED' });
  }
});
```

**Key points:**
- The coordinator never sees `noisyResult` at commit time — only the hash.
- The Map is in-memory, so org-node restarts between commit and reveal will break that org's reveal. Quorum handles this gracefully.
- Add `POST /commit` to the org-node's Express app alongside the existing `POST /execute`.

---

### Task 2 — Org-Node: `POST /reveal` Endpoint

**File:** `packages/org-node/src/routes/reveal.ts`

**What it does:**
- Receives `{ queryId }` from the coordinator.
- Looks up the stored `{ noisyResult, nonce }` for that query.
- Returns both values, then **deletes** the entry from the Map (one-time reveal).
- Returns `COMMITMENT_FAILED` if the entry doesn't exist.

**Implementation:**

```typescript
// packages/org-node/src/routes/reveal.ts
router.post('/reveal', async (req, res) => {
  const { queryId } = req.body;

  const stored = pendingCommitments.get(queryId);

  if (!stored) {
    return res.status(400).json({
      error: 'No commitment found for this query',
      code: 'COMMITMENT_FAILED',
    });
  }

  // Delete immediately — one-time reveal only
  pendingCommitments.delete(queryId);

  res.json({
    queryId,
    noisyResult: stored.noisyResult,
    nonce: stored.nonce,
  });
});
```

**Key points:**
- Delete before returning to prevent replay attacks.
- If called twice for the same `queryId`, the second call returns `COMMITMENT_FAILED`.

---

### Task 3 — Coordinator: Full Orchestration Engine

**File:** `packages/coordinator/src/orchestration/engine.ts`

This is the core of Phase 4. Modify `POST /query` to trigger the full pipeline **synchronously** and return the final result.

#### Step-by-Step Pipeline

```
1. Validate query (validateAndBuildQuery)
2. Store in DB with status = pending
3. Privacy budget check per org
4. Set status = committing → broadcast /commit to all orgs
5. Collect commit responses (Promise.allSettled)
6. Store commitment hashes in DB
7. Quorum check
8. Set status = revealing → broadcast /reveal to committed orgs
9. Verify each reveal (recompute hash, compare)
10. Post-reveal quorum check (verified orgs only)
11. Global aggregation
12. Store result, record privacy spend, set status = done
```

---

#### Step 3 — Privacy Budget Check

```typescript
// packages/coordinator/src/orchestration/engine.ts
async function checkPrivacyBudget(orgIds: string[], epsilon: number, pool: Pool): Promise<string[]> {
  const MAX_EPSILON = parseFloat(process.env.MAX_EPSILON_PER_ORG || '10.0');
  const eligibleOrgs: string[] = [];

  for (const orgId of orgIds) {
    const result = await pool.query(
      'SELECT COALESCE(SUM(epsilon_spent), 0) AS total FROM privacy_budget WHERE org_id = $1',
      [orgId]
    );
    const totalSpent = parseFloat(result.rows[0].total);
    if (totalSpent + epsilon <= MAX_EPSILON) {
      eligibleOrgs.push(orgId);
    } else {
      await logAuditEvent(null, orgId, 'BUDGET_EXHAUSTED', { totalSpent, requested: epsilon });
    }
  }

  return eligibleOrgs;
}
```

> **Note:** At college scale (one query at a time) there's no race condition. If asked, mention that production would use `SELECT ... FOR UPDATE` to lock budget rows.

---

#### Step 4–6 — Broadcast Commit (`Promise.allSettled`)

```typescript
// CRITICAL: Use Promise.allSettled, NOT Promise.all
// Promise.all aborts on first failure. allSettled collects ALL results.
const commitResults = await Promise.allSettled(
  eligibleOrgs.map(org =>
    axios.post(`${org.endpointUrl}/commit`, { queryId, queryDefinition, epsilon }, { timeout: 30000 })
  )
);

const successfulCommits: { org: OrgConfig; commitmentHash: string }[] = [];

for (let i = 0; i < commitResults.length; i++) {
  const r = commitResults[i];
  if (r.status === 'fulfilled') {
    const { commitmentHash } = r.value.data;
    // Store in DB
    await pool.query(
      'INSERT INTO commitments (query_id, org_id, commitment_hash, committed_at) VALUES ($1, $2, $3, NOW())',
      [queryId, eligibleOrgs[i].id, commitmentHash]
    );
    await logAuditEvent(queryId, eligibleOrgs[i].id, 'COMMITTED', { commitmentHash });
    successfulCommits.push({ org: eligibleOrgs[i], commitmentHash });
  } else {
    await logAuditEvent(queryId, eligibleOrgs[i].id, 'COMMIT_FAILED', { reason: r.reason?.message });
  }
}
```

---

#### Step 7 — Quorum Check

```typescript
const QUORUM_MIN = parseInt(process.env.QUORUM_MIN || '2');

if (successfulCommits.length < QUORUM_MIN) {
  await updateQueryStatus(queryId, 'failed');
  await logAuditEvent(queryId, null, 'QUORUM_NOT_MET', { got: successfulCommits.length, required: QUORUM_MIN });
  return res.json({ queryId, status: 'failed', error: 'Quorum not met during commit phase' });
}
```

---

#### Step 8–9 — Broadcast Reveal & Verify

```typescript
await updateQueryStatus(queryId, 'revealing');

const revealResults = await Promise.allSettled(
  successfulCommits.map(({ org }) =>
    axios.post(`${org.endpointUrl}/reveal`, { queryId }, { timeout: 30000 })
  )
);

const verifiedResults: { org: OrgConfig; noisyResult: NoisyResult }[] = [];

for (let i = 0; i < revealResults.length; i++) {
  const r = revealResults[i];
  const { org, commitmentHash } = successfulCommits[i];

  if (r.status === 'fulfilled') {
    const { noisyResult, nonce } = r.value.data;

    // Recompute and compare
    const recomputed = computeCommitment(JSON.stringify(noisyResult), nonce, queryId);

    if (recomputed === commitmentHash) {
      // Mark verified in DB
      await pool.query(
        `UPDATE commitments SET revealed_value = $1, revealed_nonce = $2, verified = true, revealed_at = NOW()
         WHERE query_id = $3 AND org_id = $4`,
        [JSON.stringify(noisyResult), nonce, queryId, org.id]
      );
      await logAuditEvent(queryId, org.id, 'REVEALED_VERIFIED', {});
      verifiedResults.push({ org, noisyResult });
    } else {
      await pool.query(
        `UPDATE commitments SET verified = false, revealed_at = NOW() WHERE query_id = $1 AND org_id = $2`,
        [queryId, org.id]
      );
      await logAuditEvent(queryId, org.id, 'COMMITMENT_MISMATCH', { expected: commitmentHash, got: recomputed });
    }
  } else {
    await logAuditEvent(queryId, org.id, 'REVEAL_FAILED', { reason: r.reason?.message });
  }
}
```

---

#### Step 10 — Post-Reveal Quorum Check

```typescript
if (verifiedResults.length < QUORUM_MIN) {
  await updateQueryStatus(queryId, 'failed');
  return res.json({ queryId, status: 'failed', error: 'Quorum not met after verification' });
}
```

---

#### Step 11 — Global Aggregation

```typescript
// packages/coordinator/src/orchestration/aggregation.ts

function aggregateResults(noisyResults: NoisyResult[]): NoisyResult {
  const first = noisyResults[0];

  if (first.type === 'scalar') {
    const total = noisyResults.reduce((sum, r) => sum + (r as { type: 'scalar'; value: number }).value, 0);
    return { type: 'scalar', value: total };
  }

  if (first.type === 'avg') {
    const totalSum = noisyResults.reduce((acc, r) => acc + (r as { type: 'avg'; sum: number; count: number }).sum, 0);
    const totalCount = noisyResults.reduce((acc, r) => acc + (r as { type: 'avg'; sum: number; count: number }).count, 0);
    // Clamp count to avoid division by zero or negative averages
    return { type: 'scalar', value: totalSum / Math.max(totalCount, 1) };
  }

  if (first.type === 'grouped') {
    const merged = new Map<string, number>();
    for (const r of noisyResults as Array<{ type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }>) {
      for (const { groupKey, value } of r.groups) {
        merged.set(groupKey, (merged.get(groupKey) ?? 0) + value);
      }
    }
    return {
      type: 'grouped',
      groups: Array.from(merged.entries()).map(([groupKey, value]) => ({ groupKey, value })),
    };
  }

  if (first.type === 'grouped_avg') {
    const mergedSum = new Map<string, number>();
    const mergedCount = new Map<string, number>();
    for (const r of noisyResults as Array<{ type: 'grouped_avg'; groups: Array<{ groupKey: string; sum: number; count: number }> }>) {
      for (const { groupKey, sum, count } of r.groups) {
        mergedSum.set(groupKey, (mergedSum.get(groupKey) ?? 0) + sum);
        mergedCount.set(groupKey, (mergedCount.get(groupKey) ?? 0) + count);
      }
    }
    return {
      type: 'grouped',
      groups: Array.from(mergedSum.entries()).map(([groupKey, totalSum]) => ({
        groupKey,
        value: totalSum / Math.max(mergedCount.get(groupKey)!, 1),
      })),
    };
  }

  throw new Error(`Unknown result type: ${(first as any).type}`);
}
```

> **AVG edge case:** Noisy count from DP can be 0 or even negative. Always clamp with `Math.max(count, 1)` before dividing.

---

#### Step 12 — Store Result & Record Privacy Spend

```typescript
// Store aggregated result
await pool.query(
  'INSERT INTO results (query_id, global_result, created_at) VALUES ($1, $2, NOW())',
  [queryId, JSON.stringify(globalResult)]
);

// Record privacy spend per verified org
for (const { org } of verifiedResults) {
  await pool.query(
    'INSERT INTO privacy_budget (org_id, query_id, epsilon_spent, created_at) VALUES ($1, $2, $3, NOW())',
    [org.id, queryId, epsilon]
  );
}

// Set final status
await updateQueryStatus(queryId, 'done');
await logAuditEvent(queryId, null, 'QUERY_DONE', { verifiedOrgs: verifiedResults.length, globalResult });

// Synchronous response — return final result immediately
return res.json({ queryId, status: 'done', result: globalResult });
```

---

### Task 4 — HTTP Contract with Org-Nodes

When calling org-node endpoints from the coordinator, handle all failure cases gracefully:

| Response | Action |
|----------|--------|
| `2xx` | Parse body as expected type, proceed |
| `4xx` | Treat as org-side rejection, log with `COMMIT_FAILED`/`REVEAL_FAILED` audit event, exclude this org |
| `5xx` | Treat as org failure, log, exclude |
| Timeout | Treat as failure (axios `timeout: 30000`), log, exclude |
| Network error (ECONNREFUSED) | Caught by `allSettled`, log, exclude |

**Never let a single org failure crash the orchestration loop.** Every org call is inside `Promise.allSettled` and wrapped in error logging.

---

### Task 5 — Synchronous `POST /query` Response

Before Phase 4, `POST /query` returned `{ queryId, status: "pending" }` immediately. Now it must:

1. Run the entire pipeline inline.
2. Return the final result (or failure reason) when done.
3. Still update DB state so `GET /results/:queryId` works for history.

```typescript
// Response contract
// Success:
{ queryId: string, status: "done", result: NoisyResult }
// Failure (quorum, budget, etc.):
{ queryId: string, status: "failed", error: string }
```

Add a top-level 60-second timeout around the entire pipeline:

```typescript
const PIPELINE_TIMEOUT = 60_000;

const result = await Promise.race([
  runOrchestrationPipeline(queryId, queryDefinition, epsilon),
  new Promise((_, reject) => setTimeout(() => reject(new Error('Pipeline timeout')), PIPELINE_TIMEOUT))
]);
```

If timeout triggers, set status to `failed` and return `{ queryId, status: "failed", error: "Pipeline timeout" }`.

> **Note for Rahul in Phase 5:** Set `timeout: 60000` on the dashboard's axios instance. Vite's dev proxy also needs `proxy.timeout` set or it will cut the connection at the default 30s.

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/org-node/src/routes/commit.ts` | **CREATE** | `POST /commit` endpoint + in-memory Map |
| `packages/org-node/src/routes/reveal.ts` | **CREATE** | `POST /reveal` endpoint |
| `packages/org-node/src/index.ts` | **MODIFY** | Register `/commit` and `/reveal` routes |
| `packages/coordinator/src/orchestration/engine.ts` | **CREATE** | Full orchestration pipeline function |
| `packages/coordinator/src/orchestration/aggregation.ts` | **CREATE** | `aggregateResults()` function |
| `packages/coordinator/src/routes/query.ts` | **MODIFY** | `POST /query` → call `runOrchestrationPipeline()` |
| `packages/coordinator/src/routes/results.ts` | **NO CHANGE** | `GET /results/:queryId` still works for history |

---

## Gotchas & Pitfalls

### 1. `Promise.allSettled` vs `Promise.all`

```typescript
// ❌ WRONG — one org failure rejects the whole batch
const results = await Promise.all(orgs.map(org => axios.post(org.url + '/commit', ...)));

// ✅ CORRECT — collects all successes and failures
const results = await Promise.allSettled(orgs.map(org => axios.post(org.url + '/commit', ...)));
```

This is a one-line difference but is absolutely critical. With `Promise.all`, if org-2 is down, you'll never hear back from org-1 or org-3.

### 2. In-Memory Map on Org-Nodes

The `pendingCommitments` Map lives in the org-node process. If a container restarts between commit and reveal:
- The Map is empty.
- The reveal returns `COMMITMENT_FAILED`.
- The coordinator logs the mismatch and excludes that org.
- Quorum still handles it (2/3 orgs verified = success if `QUORUM_MIN=2`).

**Do not restart org-node containers mid-query during demos.**

### 3. Privacy Budget Race Condition

Two concurrent queries could both pass the budget check before either records its spend. This won't happen at college demo scale, but if asked: *"A production system would use `SELECT ... FOR UPDATE` to lock the budget rows within a transaction."*

### 4. Synchronous Orchestration Timeout

The full commit–reveal round trip can take 2–10 seconds for 3 orgs. If an org is slow or retrying, it can push toward the 60s limit. Axios timeout per org is 30s. Set axios timeout lower than the pipeline timeout:

```
org timeout  = 30s
pipeline timeout = 60s
```

### 5. `JSON.stringify` Order Must Be Consistent

When verifying the commitment:
```typescript
// Org commits:
computeCommitment(JSON.stringify(noisyResult), nonce, queryId)

// Coordinator verifies:
computeCommitment(JSON.stringify(revealedNoisyResult), revealedNonce, queryId)
```
Both sides must `JSON.stringify` the **exact same object** in the **exact same order**. Since the org sends `noisyResult` back unchanged in the reveal, this is safe — but don't re-construct the object on the coordinator side before verifying.

---

## Environment Variables Needed

Confirm these are set in `.env` and `docker-compose.yml` before running:

| Variable | Used In | Default | Notes |
|----------|---------|---------|-------|
| `QUORUM_MIN` | Coordinator | `2` | Minimum orgs required for a valid result |
| `MAX_EPSILON_PER_ORG` | Coordinator | `10.0` | Max cumulative epsilon per org |
| `DEFAULT_EPSILON` | Coordinator | `1.0` | Epsilon if analyst doesn't specify |

---

## Verification Checklist

Run these tests after implementing Phase 4:

### Basic End-to-End

```bash
# 1. Submit a SUM GROUP BY query
curl -X POST http://localhost:4000/query \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "aggregate": "SUM", "column": "amount", "table": "transactions", "groupBy": "category", "epsilon": 1.0 }'

# Expected: { "queryId": "...", "status": "done", "result": { "type": "grouped", "groups": [...] } }
```

### Coordinator Logs During Pipeline

Watch logs: `docker compose logs -f coordinator`

Expected sequence:
```
[INFO] Query abc123: status = pending
[INFO] Query abc123: privacy budget OK for 3 orgs
[INFO] Query abc123: status = committing
[INFO] Query abc123: org-1 committed (hash: abc...)
[INFO] Query abc123: org-2 committed (hash: def...)
[INFO] Query abc123: org-3 committed (hash: ghi...)
[INFO] Query abc123: quorum met (3/3)
[INFO] Query abc123: status = revealing
[INFO] Query abc123: org-1 verified
[INFO] Query abc123: org-2 verified
[INFO] Query abc123: org-3 verified
[INFO] Query abc123: status = done
```

### Quorum Failure Test

```bash
# Kill one org-node container
docker compose stop org-node-1

# Submit a query with QUORUM_MIN=3
# Expected: { "status": "failed", "error": "Quorum not met during commit phase" }

# Restart with QUORUM_MIN=2 in .env
# Expected: { "status": "done", "result": { ... } } (from 2 remaining orgs)
```

### Commitment Mismatch Test

Temporarily hardcode a wrong return value in one org-node's `/reveal` endpoint:
```typescript
// Temporary test only!
noisyResult = { type: 'scalar', value: 999999 }; // tampered value
```

Expected coordinator behavior:
- Reveal for that org fails verification.
- Audit log shows `COMMITMENT_MISMATCH`.
- If remaining verified orgs ≥ `QUORUM_MIN`, query still succeeds.

### Privacy Budget Test

```bash
# Submit queries until budget is exhausted (epsilon=3.0 × 4 = 12 > 10.0)
for i in 1 2 3 4; do
  curl -X POST http://localhost:4000/query \
    -H "Authorization: Bearer $JWT" \
    -d '{ "aggregate": "COUNT", "column": "amount", "table": "transactions", "epsilon": 3.0 }'
done

# 4th query should be rejected for orgs that hit the limit
```

### History Still Works

```bash
curl http://localhost:4000/results -H "Authorization: Bearer $JWT"
# Expected: list of all past queries with status, queryId, timestamps

curl http://localhost:4000/results/$QUERY_ID -H "Authorization: Bearer $JWT"
# Expected: full result for that specific queryId
```

### Audit Log Check

```bash
curl http://localhost:4000/audit/$QUERY_ID -H "Authorization: Bearer $JWT"
# Expected: ordered list of audit events: COMMITTED × n, REVEALED_VERIFIED × n, QUERY_DONE
```

---

## What Comes Next

Once Phase 4 is merged:

- **Rahul** (Phase 5) picks up and builds the React dashboard. He needs `POST /query` to return the final result synchronously — which is exactly what Phase 4 delivers.
- The `GET /results/:queryId` endpoint from Phase 2 still works, but the dashboard primarily uses the synchronous response.
- Remind Rahul to set `timeout: 60000` on his axios instance (dashboard) to avoid premature connection cuts.

---

*Phase 4 is the most complex phase in the project. The protocol correctness matters more than the speed of implementation. Get the commit–reveal verification logic right first, then test edge cases (quorum failures, commitment mismatches, budget exhaustion) before calling it done.*
