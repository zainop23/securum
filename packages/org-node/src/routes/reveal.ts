import { Router } from 'express';
import { config } from '../config';
import { pendingCommitments } from './commit';

const router = Router();

/**
 * POST /reveal
 *
 * Body: { queryId: string }
 *
 * Looks up the stored { noisyResult, nonce } for the given queryId,
 * returns both values, then DELETES the entry from the in-memory Map.
 *
 * This is a one-time reveal — calling it twice for the same queryId
 * returns COMMITMENT_FAILED on the second call, preventing replays.
 */
router.post('/reveal', async (req, res) => {
  const { queryId } = req.body as { queryId?: string };

  // --- Validate ---
  if (!queryId || typeof queryId !== 'string') {
    res.status(400).json({
      error: 'queryId is required and must be a string',
      code: 'COMMITMENT_FAILED',
    });
    return;
  }

  // --- Lookup ---
  const stored = pendingCommitments.get(queryId);

  if (!stored) {
    console.warn(
      `[${config.orgName}] /reveal called for unknown queryId=${queryId} — ` +
        'expired, already revealed, or never committed'
    );
    res.status(400).json({
      error: 'No commitment found for this queryId',
      code: 'COMMITMENT_FAILED',
    });
    return;
  }

  // --- Delete BEFORE responding — one-time reveal only ---
  pendingCommitments.delete(queryId);

  console.log(`[${config.orgName}] Revealed queryId=${queryId}`);

  res.json({
    queryId,
    noisyResult: stored.noisyResult,
    resultStr: stored.resultStr,
    nonce: stored.nonce,
  });
});

export default router;
