/**
 * Commit–Reveal Orchestration Engine
 *
 * Runs the full pipeline:
 *   pending → budget check → committing → revealing → verify → aggregate → done
 *
 * Called synchronously from POST /query — returns the final result (or failure)
 * in a single HTTP response.
 *
 * Emits progress events via an EventEmitter so the frontend can show
 * real-time step-by-step logs via SSE.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { computeCommitment, QueryDefinition } from '@securum/shared';
import { aggregateResults, NoisyResult } from './aggregation';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Progress Events
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  step: string;
  status: 'running' | 'done' | 'error';
  message: string;
  detail?: string;
  timestamp: number;
}

/**
 * In-memory map of queryId → EventEmitter.
 * Each emitter fires 'progress' events during orchestration.
 * Cleaned up after the pipeline completes.
 */
const queryEmitters = new Map<string, EventEmitter>();

export function getQueryEmitter(queryId: string): EventEmitter | undefined {
  return queryEmitters.get(queryId);
}

function emitProgress(
  queryId: string,
  step: string,
  status: ProgressEvent['status'],
  message: string,
  detail?: string
): void {
  const emitter = queryEmitters.get(queryId);
  if (emitter) {
    const event: ProgressEvent = { step, status, message, detail, timestamp: Date.now() };
    emitter.emit('progress', event);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgInfo {
  id: string;
  name: string;
  endpoint_url: string;
}

interface CommitSuccess {
  org: OrgInfo;
  commitmentHash: string;
}

export interface OrchestrationSuccess {
  ok: true;
  queryId: string;
  status: 'done';
  result: NoisyResult;
}

export interface OrchestrationFailure {
  ok: false;
  queryId: string;
  status: 'failed';
  error: string;
}

export type OrchestrationResult = OrchestrationSuccess | OrchestrationFailure;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logAuditEvent(
  pool: Pool,
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

async function updateQueryStatus(pool: Pool, queryId: string, status: string): Promise<void> {
  await pool.query('UPDATE queries SET status = $1 WHERE id = $2', [status, queryId]);
}

/**
 * Lightweight HTTP POST using Node's built-in `fetch` (available in Node 18+).
 * Falls back gracefully with error details on any failure.
 */
async function httpPost(
  url: string,
  body: unknown,
  timeoutMs: number = 30_000
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Pipeline Steps
// ---------------------------------------------------------------------------

/**
 * Step 1 — Privacy Budget Check
 *
 * For each active org, check if adding `epsilon` would exceed MAX_EPSILON_PER_ORG.
 * Returns only the orgs that still have budget.
 */
async function getEligibleOrgs(
  pool: Pool,
  epsilon: number,
  queryId: string
): Promise<OrgInfo[]> {
  // Get all active orgs
  const orgsResult = await pool.query(
    `SELECT id, name, endpoint_url FROM organizations WHERE status = 'active'`
  );
  const allOrgs = orgsResult.rows as OrgInfo[];

  const eligible: OrgInfo[] = [];
  for (const org of allOrgs) {
    const budgetResult = await pool.query(
      'SELECT COALESCE(SUM(epsilon_spent), 0) AS total FROM privacy_budget WHERE org_id = $1',
      [org.id]
    );
    const totalSpent = parseFloat(budgetResult.rows[0].total);

    if (totalSpent + epsilon <= config.maxEpsilonPerOrg) {
      eligible.push(org);
    } else {
      console.log(`[orchestration] Org "${org.name}" excluded — budget exhausted (spent=${totalSpent}, requested=${epsilon}, max=${config.maxEpsilonPerOrg})`);
      await logAuditEvent(pool, queryId, org.id, 'BUDGET_EXHAUSTED', {
        totalSpent,
        requested: epsilon,
        max: config.maxEpsilonPerOrg,
      });
    }
  }

  return eligible;
}

/**
 * Step 2 — Broadcast /commit to all eligible orgs
 *
 * Uses Promise.allSettled (NOT Promise.all) so one org failing doesn't
 * reject the entire batch.
 */
async function broadcastCommit(
  pool: Pool,
  queryId: string,
  queryDefinition: QueryDefinition,
  epsilon: number,
  orgs: OrgInfo[]
): Promise<CommitSuccess[]> {
  const commitPromises = orgs.map(org =>
    httpPost(`${org.endpoint_url}/commit`, { queryId, queryDefinition, epsilon })
  );

  const settled = await Promise.allSettled(commitPromises);
  const successes: CommitSuccess[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const org = orgs[i];

    if (result.status === 'fulfilled' && result.value.ok) {
      const data = result.value.data as { queryId: string; commitmentHash: string };
      const commitmentHash = data.commitmentHash;

      // Store in DB
      await pool.query(
        `INSERT INTO commitments (id, query_id, org_id, commitment_hash, committed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [randomUUID(), queryId, org.id, commitmentHash]
      );

      await logAuditEvent(pool, queryId, org.id, 'COMMITTED', {
        commitmentHash: commitmentHash.slice(0, 16) + '...',
      });

      successes.push({ org, commitmentHash });
      console.log(`[orchestration] ${org.name} committed (hash=${commitmentHash.slice(0, 12)}...)`);
    } else {
      const errorMsg =
        result.status === 'fulfilled'
          ? (result.value as { ok: false; error: string }).error
          : result.reason?.message ?? 'Unknown error';

      console.warn(`[orchestration] ${org.name} commit FAILED: ${errorMsg}`);
      await logAuditEvent(pool, queryId, org.id, 'COMMIT_FAILED', { reason: errorMsg });
    }
  }

  return successes;
}

/**
 * Step 3 — Broadcast /reveal to all committed orgs and verify each
 *
 * Recomputes the commitment hash from the revealed data and compares.
 * Only returns verified results.
 */
async function broadcastRevealAndVerify(
  pool: Pool,
  queryId: string,
  commits: CommitSuccess[]
): Promise<{ org: OrgInfo; noisyResult: NoisyResult }[]> {
  const revealPromises = commits.map(({ org }) =>
    httpPost(`${org.endpoint_url}/reveal`, { queryId })
  );

  const settled = await Promise.allSettled(revealPromises);
  const verified: { org: OrgInfo; noisyResult: NoisyResult }[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const { org, commitmentHash } = commits[i];

    if (result.status === 'fulfilled' && result.value.ok) {
      const data = result.value.data as {
        queryId: string;
        noisyResult: NoisyResult;
        resultStr: string;
        nonce: string;
      };

      // Recompute commitment and compare
      const recomputed = computeCommitment(
        data.resultStr,
        data.nonce,
        queryId
      );

      if (recomputed === commitmentHash) {
        // Verified — update DB
        await pool.query(
          `UPDATE commitments
           SET revealed_value = $1::jsonb, revealed_nonce = $2, verified = true, revealed_at = NOW()
           WHERE query_id = $3 AND org_id = $4`,
          [JSON.stringify(data.noisyResult), data.nonce, queryId, org.id]
        );

        await logAuditEvent(pool, queryId, org.id, 'REVEALED_VERIFIED', {});
        verified.push({ org, noisyResult: data.noisyResult });
        console.log(`[orchestration] ${org.name} reveal VERIFIED`);
      } else {
        // Commitment mismatch — tampered or corrupted
        await pool.query(
          `UPDATE commitments
           SET verified = false, revealed_at = NOW()
           WHERE query_id = $1 AND org_id = $2`,
          [queryId, org.id]
        );

        console.warn(`[orchestration] ${org.name} COMMITMENT MISMATCH`);
        await logAuditEvent(pool, queryId, org.id, 'COMMITMENT_MISMATCH', {
          expected: commitmentHash.slice(0, 16) + '...',
          got: recomputed.slice(0, 16) + '...',
        });
      }
    } else {
      const errorMsg =
        result.status === 'fulfilled'
          ? (result.value as { ok: false; error: string }).error
          : result.reason?.message ?? 'Unknown error';

      console.warn(`[orchestration] ${org.name} reveal FAILED: ${errorMsg}`);
      await logAuditEvent(pool, queryId, org.id, 'REVEAL_FAILED', { reason: errorMsg });
    }
  }

  return verified;
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

const PIPELINE_TIMEOUT_MS = 60_000;

/**
 * Run the full commit–reveal orchestration for a single query.
 *
 * This is called synchronously from the POST /query handler.
 * The query row must already exist in the DB with status='pending'.
 */
export async function runOrchestration(
  dbPool: Pool,
  queryId: string,
  queryDefinition: QueryDefinition,
  epsilon: number,
  submitterOrgId: string | null
): Promise<OrchestrationResult> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<OrchestrationFailure>((resolve) => {
    timeoutHandle = setTimeout(async () => {
      const timeoutUpdate = await dbPool.query(
        `UPDATE queries
         SET status = 'failed'
         WHERE id = $1
           AND status IN ('pending', 'committing', 'revealing')
         RETURNING id`,
        [queryId]
      ).catch(() => null);

      if (timeoutUpdate && timeoutUpdate.rowCount === 1) {
        await logAuditEvent(dbPool, queryId, null, 'QUERY_FAILED', {
          error: 'Pipeline timeout',
        }).catch(() => {});
      }

      resolve({
        ok: false,
        queryId,
        status: 'failed',
        error: 'Pipeline timeout — exceeded 60 seconds',
      });
    }, PIPELINE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      _runPipeline(dbPool, queryId, queryDefinition, epsilon, submitterOrgId),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function _runPipeline(
  dbPool: Pool,
  queryId: string,
  queryDefinition: QueryDefinition,
  epsilon: number,
  submitterOrgId: string | null
): Promise<OrchestrationResult> {
  const fail = async (error: string): Promise<OrchestrationFailure> => {
    await updateQueryStatus(dbPool, queryId, 'failed');
    await logAuditEvent(dbPool, queryId, null, 'QUERY_FAILED', { error });
    console.log(`[orchestration] Query ${queryId} FAILED: ${error}`);
    return { ok: false, queryId, status: 'failed', error };
  };

  // Create an EventEmitter for this query so SSE clients can subscribe
  const emitter = new EventEmitter();
  queryEmitters.set(queryId, emitter);

  const cleanupEmitter = () => {
    // Give SSE clients a moment to receive the final event before cleanup
    setTimeout(() => {
      emitter.removeAllListeners();
      queryEmitters.delete(queryId);
    }, 5_000);
  };

  try {
    // ---- Step 1: Privacy budget check ----
    emitProgress(queryId, 'budget_check', 'running', 'Checking privacy budgets…');
    console.log(`[orchestration] Query ${queryId}: checking privacy budgets...`);
    const eligibleOrgs = await getEligibleOrgs(dbPool, epsilon, queryId);

    if (eligibleOrgs.length < config.quorumMin) {
      emitProgress(queryId, 'budget_check', 'error', 'Not enough orgs within budget', `${eligibleOrgs.length} eligible, ${config.quorumMin} required`);
      cleanupEmitter();
      return fail(
        `Not enough orgs within budget: ${eligibleOrgs.length} eligible, ${config.quorumMin} required`
      );
    }

    emitProgress(queryId, 'budget_check', 'done', `${eligibleOrgs.length} organizations eligible`, eligibleOrgs.map(o => o.name).join(', '));
    console.log(
      `[orchestration] Query ${queryId}: ${eligibleOrgs.length} orgs eligible (quorum=${config.quorumMin})`
    );

    // ---- Step 2: Commit phase ----
    emitProgress(queryId, 'commit_broadcast', 'running', `Broadcasting commit to ${eligibleOrgs.length} org nodes…`, eligibleOrgs.map(o => o.name).join(', '));
    await updateQueryStatus(dbPool, queryId, 'committing');
    await logAuditEvent(dbPool, queryId, null, 'STATUS_COMMITTING', {
      orgs: eligibleOrgs.map((o) => o.name),
    });

    const commits = await broadcastCommit(dbPool, queryId, queryDefinition, epsilon, eligibleOrgs);

    // Quorum check after commit
    if (commits.length < config.quorumMin) {
      emitProgress(queryId, 'commit_broadcast', 'error', 'Quorum not met during commit', `${commits.length} committed, ${config.quorumMin} required`);
      cleanupEmitter();
      return fail(
        `Quorum not met during commit phase: ${commits.length} committed, ${config.quorumMin} required`
      );
    }

    emitProgress(queryId, 'commit_broadcast', 'done', `${commits.length}/${eligibleOrgs.length} org nodes committed`, commits.map(c => c.org.name).join(', '));
    console.log(`[orchestration] Query ${queryId}: ${commits.length}/${eligibleOrgs.length} committed — quorum met`);

    // ---- Step 3: Reveal + verify phase ----
    emitProgress(queryId, 'reveal_verify', 'running', 'Requesting reveals & verifying commitments…');
    await updateQueryStatus(dbPool, queryId, 'revealing');
    await logAuditEvent(dbPool, queryId, null, 'STATUS_REVEALING', {
      committedOrgs: commits.map((c) => c.org.name),
    });

    const verified = await broadcastRevealAndVerify(dbPool, queryId, commits);

    // Post-reveal quorum check
    if (verified.length < config.quorumMin) {
      emitProgress(queryId, 'reveal_verify', 'error', 'Quorum not met after verification', `${verified.length} verified, ${config.quorumMin} required`);
      cleanupEmitter();
      return fail(
        `Quorum not met after verification: ${verified.length} verified, ${config.quorumMin} required`
      );
    }

    emitProgress(queryId, 'reveal_verify', 'done', `${verified.length}/${commits.length} reveals verified`, verified.map(v => v.org.name).join(', '));
    console.log(
      `[orchestration] Query ${queryId}: ${verified.length}/${commits.length} verified — aggregating`
    );

    // ---- Step 4: Global aggregation ----
    emitProgress(queryId, 'aggregation', 'running', 'Aggregating results with differential privacy…');
    const noisyResults = verified.map((v) => v.noisyResult);
    const globalResult = aggregateResults(noisyResults);
    emitProgress(queryId, 'aggregation', 'done', 'Global aggregation complete');

    // ---- Step 5: Store result and record privacy spend ----
    emitProgress(queryId, 'finalize', 'running', 'Storing results & recording privacy spend…');
    await dbPool.query(
      'INSERT INTO results (id, query_id, global_result, created_at) VALUES ($1, $2, $3::jsonb, NOW())',
      [randomUUID(), queryId, JSON.stringify(globalResult)]
    );

    // Record epsilon spent for each verified org
    for (const { org } of verified) {
      await dbPool.query(
        `INSERT INTO privacy_budget (id, org_id, query_id, epsilon_spent, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [randomUUID(), org.id, queryId, epsilon]
      );
    }

    if (submitterOrgId) {
      await dbPool.query(
        `INSERT INTO privacy_budget (id, org_id, query_id, epsilon_spent, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (org_id, query_id) DO NOTHING`,
        [randomUUID(), submitterOrgId, queryId, epsilon]
      );
    }

    emitProgress(queryId, 'finalize', 'done', 'Finalization complete');

    // ---- Done ----
    await updateQueryStatus(dbPool, queryId, 'done');
    await logAuditEvent(dbPool, queryId, null, 'QUERY_DONE', {
      verifiedOrgs: verified.length,
      totalOrgs: eligibleOrgs.length,
    });

    emitProgress(queryId, 'complete', 'done', `Query complete — ${verified.length} org nodes participated`);
    console.log(`[orchestration] Query ${queryId}: DONE ✓ (${verified.length} orgs)`);

    cleanupEmitter();
    return { ok: true, queryId, status: 'done', result: globalResult };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    emitProgress(queryId, 'error', 'error', 'Orchestration error', message);
    console.error(`[orchestration] Query ${queryId}: unexpected error — ${message}`);
    cleanupEmitter();
    return fail(`Internal orchestration error: ${message}`);
  }
}
