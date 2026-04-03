import { Router } from 'express';
import crypto from 'crypto';
import { computeCommitment, QueryDefinition } from '@securum/shared';
import { pool } from '../db';
import { executeQuery } from '../executor';
import { applyNoise, NoisyResult } from '../noise';
import { loadAndValidateSchemaMap } from '../schema';
import { config } from '../config';

const router = Router();

/**
 * In-memory store for pending commitments.
 * Key: queryId
 * Value: { noisyResult, nonce } — held until the coordinator calls /reveal
 *
 * NOTE: This Map lives in the process. A container restart between /commit
 * and /reveal will lose the entry, causing that org's reveal to fail.
 * The coordinator's quorum system handles this gracefully.
 */
export const pendingCommitments = new Map<
  string,
  { noisyResult: NoisyResult; nonce: string }
>();

// Load schema map once at module load (same path as index.ts)
let schemaMap: ReturnType<typeof loadAndValidateSchemaMap>;
try {
  schemaMap = loadAndValidateSchemaMap(config.schemaMapPath);
} catch (err) {
  console.error('FATAL: commit.ts — Schema map failed to load:', (err as Error).message);
  process.exit(1);
}

/**
 * POST /commit
 *
 * Body: { queryId: string, queryDefinition: QueryDefinition, epsilon?: number }
 *
 * Pipeline:
 *  1. Validate & build SQL (via validateAndBuildQuery in executor)
 *  2. Rewrite SQL to local schema
 *  3. Execute against local DB
 *  4. Apply Laplace noise
 *  5. Generate random nonce
 *  6. Compute commitmentHash = SHA256(JSON.stringify(noisyResult) + nonce + queryId)
 *  7. Store { noisyResult, nonce } in pendingCommitments
 *  8. Return { queryId, commitmentHash } — never the result itself
 */
router.post('/commit', async (req, res) => {
  const { queryId, queryDefinition, epsilon: rawEpsilon } = req.body as {
    queryId?: string;
    queryDefinition?: Partial<QueryDefinition>;
    epsilon?: number;
  };

  // --- Validate request ---
  if (!queryId || typeof queryId !== 'string') {
    res.status(400).json({ error: 'queryId is required and must be a string', code: 'COMMITMENT_FAILED' });
    return;
  }

  if (!queryDefinition) {
    res.status(400).json({ error: 'queryDefinition is required', code: 'COMMITMENT_FAILED' });
    return;
  }

  // --- Resolve epsilon ---
  let epsilon: number;
  if (rawEpsilon !== undefined) {
    epsilon = Number(rawEpsilon);
    if (!Number.isFinite(epsilon) || !(epsilon > 0)) {
      res.status(400).json({ error: 'epsilon must be a positive finite number', code: 'COMMITMENT_FAILED' });
      return;
    }
  } else {
    epsilon = config.defaultEpsilon;
  }

  // --- Reject duplicate commits for the same queryId ---
  if (pendingCommitments.has(queryId)) {
    console.warn(`Duplicate /commit for queryId ${queryId} — rejecting`);
    res.status(409).json({ error: 'Commitment already exists for this queryId', code: 'COMMITMENT_FAILED' });
    return;
  }

  try {
    // --- Build a full QueryDefinition ---
    const queryDef: QueryDefinition = {
      aggregate: queryDefinition.aggregate as QueryDefinition['aggregate'],
      column: String(queryDefinition.column ?? ''),
      filter: queryDefinition.filter,
      grouping: queryDefinition.grouping,
      submitter: String(queryDefinition.submitter ?? ''),
    };

    // --- Step 1–3: Validate → rewrite → execute ---
    const execResult = await executeQuery(queryDef, schemaMap, pool);

    if (!execResult.ok) {
      console.error(`Commit pipeline failed for query ${queryId}: ${execResult.error}`);
      res.status(400).json({ error: execResult.error, code: 'COMMITMENT_FAILED' });
      return;
    }

    // --- Step 4: Apply differential privacy noise ---
    const noisyResult = applyNoise(execResult.result, epsilon);

    // --- Step 5: Generate cryptographically random nonce ---
    const nonce = crypto.randomBytes(32).toString('hex');

    // --- Step 6: Compute commitment hash ---
    const commitmentHash = computeCommitment(
      JSON.stringify(noisyResult),
      nonce,
      queryId
    );

    // --- Step 7: Store in memory (retrieved during /reveal) ---
    pendingCommitments.set(queryId, { noisyResult, nonce });

    console.log(`[${config.orgName}] Committed queryId=${queryId} hash=${commitmentHash.slice(0, 12)}...`);

    // --- Step 8: Return only the hash — result stays hidden until reveal ---
    res.json({ queryId, commitmentHash });
  } catch (err) {
    console.error(`Unexpected error during /commit for queryId=${queryId}:`, (err as Error).message);
    res.status(500).json({ error: 'Commitment computation failed', code: 'COMMITMENT_FAILED' });
  }
});

export default router;
