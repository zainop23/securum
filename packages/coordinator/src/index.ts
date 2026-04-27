import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { validateAndBuildQuery, QueryDefinition } from '@securum/shared';
import { runOrchestration } from './orchestration/engine';
import { getQueryEmitter, ProgressEvent } from './orchestration/engine';
import { config } from './config';
import { pool } from './db';
import { hashPassword } from './auth/password';

// Auth & middleware
import {
  requireJwt,
  requireOrgApiKey,
  asyncHandler,
  sendError,
  AuthenticatedRequest,
} from './auth/rbac';

// Route modules
import { authRouter } from './routes/auth';
import { onboardingRouter } from './routes/onboarding';
import { orgsRouter } from './routes/orgs';
import { adminRouter } from './routes/admin';

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function ensureCoordinatorSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'analyst'
            CHECK (role IN ('platform_admin', 'org_admin', 'analyst')),
        org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS org_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        role VARCHAR(30) NOT NULL DEFAULT 'analyst'
            CHECK (role IN ('org_admin', 'analyst')),
        invited_by UUID NOT NULL REFERENCES users(id),
        token VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending'
            CHECK (status IN ('pending', 'accepted', 'expired')),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('active', 'inactive', 'pending'));
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_step VARCHAR(50) DEFAULT 'account_created'
        CHECK (onboarding_step IN (
            'account_created',
            'node_endpoint_configured',
            'schema_map_uploaded',
            'connectivity_verified',
            'onboarding_complete'
        ));
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS schema_map JSONB;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS privacy_budget_limit NUMERIC(10,4) DEFAULT 10.0;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_epsilon_per_query NUMERIC(10,4) DEFAULT 5.0;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE queries ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);
    CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
  `);
}

async function ensureBootstrapUsers(): Promise<void> {
  const adminPasswordHash = await hashPassword(config.adminPassword);
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active)
     VALUES ($1, $2, 'Platform Admin', 'platform_admin', true)
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         is_active = true`,
    [config.adminEmail.toLowerCase(), adminPasswordHash]
  );

  if (config.analystUser && config.analystPassword) {
    const analystPasswordHash = await hashPassword(config.analystPassword);
    await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, 'Legacy Analyst', 'analyst', true)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           is_active = true`,
      [config.analystUser.toLowerCase(), analystPasswordHash]
    );
  }
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ---------------------------------------------------------------------------
// Mount Route Modules
// ---------------------------------------------------------------------------

app.use('/auth', authRouter);
app.use('/onboarding', onboardingRouter);
app.use('/orgs', orgsRouter);
app.use('/admin', adminRouter);

// ---------------------------------------------------------------------------
// Legacy: GET /orgs (list all orgs — kept for backward compat)
// Now requires auth but shows all orgs for platform_admin, own org for others
// ---------------------------------------------------------------------------

app.get(
  '/orgs-list',
  requireJwt,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    let orgsResult;
    if (user.role === 'platform_admin') {
      orgsResult = await pool.query(
        `SELECT id, name, endpoint_url, status, created_at
         FROM organizations
         ORDER BY created_at DESC`
      );
    } else {
      orgsResult = await pool.query(
        `SELECT id, name, endpoint_url, status, created_at
         FROM organizations
         WHERE id = $1`,
        [user.orgId]
      );
    }

    res.json({ orgs: orgsResult.rows });
  })
);

// ---------------------------------------------------------------------------
// Legacy: POST /orgs/register (kept for backward compat with existing scripts)
// Now only platform_admin can use this
// ---------------------------------------------------------------------------

app.post(
  '/orgs/register',
  requireJwt,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    if (user.role !== 'platform_admin') {
      sendError(res, 403, 'Only platform admins can register orgs directly', 'FORBIDDEN');
      return;
    }

    const { name, endpointUrl } = req.body as { name?: string; endpointUrl?: string };
    if (!name || !endpointUrl) {
      sendError(res, 400, 'name and endpointUrl are required', 'INVALID_QUERY');
      return;
    }

    const orgId = randomUUID();
    const { randomBytes } = await import('crypto');
    const apiKey = randomBytes(32).toString('hex');
    const { hashApiKey } = await import('./auth/rbac');
    const apiKeyHash = hashApiKey(apiKey);

    await pool.query(
      `INSERT INTO organizations (id, name, api_key_hash, endpoint_url, status, onboarding_step)
       VALUES ($1, $2, $3, $4, 'active', 'onboarding_complete')`,
      [orgId, name, apiKeyHash, endpointUrl]
    );

    await logAuditEvent(null, orgId, 'ORG_REGISTERED', {
      name,
      endpointUrl,
      registeredBy: user.sub,
    });

    res.status(201).json({ orgId, apiKey });
  })
);

// ---------------------------------------------------------------------------
// POST /query — submit query (org-scoped)
// ---------------------------------------------------------------------------

app.post(
  '/query',
  requireJwt,
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<QueryDefinition> & { epsilon?: number };
    const user = (req as AuthenticatedRequest).user!;

    if (user.role !== 'platform_admin' && user.role !== 'org_admin' && user.role !== 'analyst') {
      sendError(res, 403, 'Insufficient permissions', 'FORBIDDEN');
      return;
    }

    const def: QueryDefinition = {
      aggregate: body.aggregate as QueryDefinition['aggregate'],
      column: String(body.column ?? ''),
      filter: body.filter,
      grouping: body.grouping,
      submitter: user.email || user.sub,
    };

    const parsed = validateAndBuildQuery(def);
    if (!parsed.valid) {
      sendError(res, 400, parsed.error, 'INVALID_QUERY');
      return;
    }

    const epsilon = Number(body.epsilon ?? config.defaultEpsilon);
    if (!Number.isFinite(epsilon) || !(epsilon > 0) || epsilon > config.maxEpsilonPerOrg) {
      sendError(
        res,
        400,
        `epsilon must be > 0 and <= ${config.maxEpsilonPerOrg}`,
        'INVALID_QUERY'
      );
      return;
    }

    const queryId = randomUUID();
    await pool.query(
      `INSERT INTO queries (id, submitted_by, query_definition, status, quorum, epsilon, org_id)
       VALUES ($1, $2, $3::jsonb, 'pending', $4, $5, $6)`,
      [queryId, user.email || user.sub, JSON.stringify(def), config.quorumMin, epsilon, user.orgId]
    );

    await logAuditEvent(queryId, user.orgId, 'QUERY_SUBMITTED', { submittedBy: user.email || user.sub });

    res.status(202).json({ queryId, status: 'processing' });

    runOrchestration(pool, queryId, def, epsilon, user.orgId ?? null).catch((err) => {
      console.error(`[orchestration] Background failure for ${queryId}:`, err);
    });
  })
);

// ---------------------------------------------------------------------------
// SSE: stream real-time orchestration progress
// ---------------------------------------------------------------------------

app.get(
  '/query/:queryId/events',
  requireJwt,
  (req: express.Request<{ queryId: string }>, res) => {
    const { queryId } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`data: ${JSON.stringify({ step: 'connected', status: 'done', message: 'Connected to query progress stream', timestamp: Date.now() })}\n\n`);

    const emitter = getQueryEmitter(queryId);
    if (!emitter) {
      res.write(`data: ${JSON.stringify({ step: 'complete', status: 'done', message: 'Query already completed', timestamp: Date.now() })}\n\n`);
      res.end();
      return;
    }

    const onProgress = (event: ProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      if (event.step === 'complete' || event.step === 'error') {
        setTimeout(() => res.end(), 200);
      }
    };

    emitter.on('progress', onProgress);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15_000);

    req.on('close', () => {
      emitter.removeListener('progress', onProgress);
      clearInterval(heartbeat);
    });
  }
);

// ---------------------------------------------------------------------------
// Cancel ongoing query
// ---------------------------------------------------------------------------

app.post(
  '/query/:queryId/cancel',
  requireJwt,
  asyncHandler(async (req, res) => {
    const queryId = req.params.queryId as string;
    const user = (req as AuthenticatedRequest).user!;

    // Check query exists and belongs to the user's org (or user is admin)
    let queryCheck;
    if (user.role === 'platform_admin') {
      queryCheck = await pool.query(
        `SELECT status FROM queries WHERE id = $1`,
        [queryId]
      );
    } else {
      queryCheck = await pool.query(
        `SELECT status FROM queries WHERE id = $1 AND (submitted_by = $2 OR org_id = $3)`,
        [queryId, user.email || user.sub, user.orgId]
      );
    }

    if (queryCheck.rowCount === 0) {
      sendError(res, 404, 'Query not found', 'INVALID_QUERY');
      return;
    }

    const status = queryCheck.rows[0].status;
    if (status === 'done' || status === 'failed') {
      res.json({ ok: false, message: 'Query already finished or failed' });
      return;
    }

    await pool.query(`UPDATE queries SET status = 'failed' WHERE id = $1`, [queryId]);

    const emitter = getQueryEmitter(queryId);
    if (emitter) {
      emitter.emit('progress', {
        step: 'error',
        status: 'error',
        message: 'Query cancelled by user',
        detail: 'The orchestration pipeline was manually aborted.',
        timestamp: Date.now()
      });
    }

    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// GET /results/:queryId — with org scoping
// ---------------------------------------------------------------------------

app.get(
  '/results/:queryId',
  requireJwt,
  asyncHandler(async (req, res) => {
    const { queryId } = req.params;
    const user = (req as AuthenticatedRequest).user!;

    let result;
    if (user.role === 'platform_admin') {
      result = await pool.query(
        `SELECT q.id AS query_id, q.status, r.global_result
         FROM queries q
         LEFT JOIN results r ON r.query_id = q.id
         WHERE q.id = $1
         LIMIT 1`,
        [queryId]
      );
    } else {
      result = await pool.query(
        `SELECT q.id AS query_id, q.status, r.global_result
         FROM queries q
         LEFT JOIN results r ON r.query_id = q.id
         WHERE q.id = $1 AND (q.org_id = $2 OR q.submitted_by = $3)
         LIMIT 1`,
        [queryId, user.orgId, user.email || user.sub]
      );
    }

    if (result.rowCount !== 1) {
      sendError(res, 404, 'query not found', 'INVALID_QUERY');
      return;
    }

    const row = result.rows[0] as {
      query_id: string;
      status: string;
      global_result: unknown;
    };

    if (row.status === 'done') {
      res.json({ queryId: row.query_id, status: 'done', result: row.global_result });
      return;
    }

    if (row.status === 'failed') {
      const failureResult = await pool.query(
        `SELECT payload
         FROM audit_logs
         WHERE query_id = $1 AND event_type = 'QUERY_FAILED'
         ORDER BY created_at DESC
         LIMIT 1`,
        [queryId]
      );

      const error =
        failureResult.rowCount === 1
          ? ((failureResult.rows[0].payload as { error?: string })?.error ?? 'Query failed')
          : 'Query failed';

      res.json({ queryId: row.query_id, status: 'failed', error });
      return;
    }

    res.json({ queryId: row.query_id, status: 'pending' });
  })
);

// ---------------------------------------------------------------------------
// GET /results — list queries (org-scoped)
// ---------------------------------------------------------------------------

app.get(
  '/results',
  requireJwt,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    let result;
    if (user.role === 'platform_admin') {
      result = await pool.query(
        `SELECT id AS query_id, status, submitted_by, created_at
         FROM queries
         ORDER BY created_at DESC
         LIMIT 100`
      );
    } else {
      result = await pool.query(
        `SELECT id AS query_id, status, submitted_by, created_at
         FROM queries
         WHERE org_id = $1 OR submitted_by = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [user.orgId, user.email || user.sub]
      );
    }

    res.json({ results: result.rows });
  })
);

// ---------------------------------------------------------------------------
// GET /audit/:queryId — with org scoping
// ---------------------------------------------------------------------------

app.get(
  '/audit/:queryId',
  requireJwt,
  asyncHandler(async (req, res) => {
    const { queryId } = req.params;
    const user = (req as AuthenticatedRequest).user!;

    // Verify query ownership (unless platform_admin)
    if (user.role !== 'platform_admin') {
      const qResult = await pool.query(
        `SELECT id FROM queries WHERE id = $1 AND (org_id = $2 OR submitted_by = $3)`,
        [queryId, user.orgId, user.email || user.sub]
      );
      if (!qResult.rowCount || qResult.rowCount === 0) {
        sendError(res, 404, 'Query not found', 'NOT_FOUND');
        return;
      }
    }

    const auditResult = await pool.query(
      `SELECT id, query_id, org_id, event_type, payload, created_at
       FROM audit_logs
       WHERE query_id = $1
       ORDER BY created_at ASC`,
      [queryId]
    );

    res.json({ queryId, events: auditResult.rows });
  })
);

// ---------------------------------------------------------------------------
// Org-node self-identification (API key auth)
// ---------------------------------------------------------------------------

app.get(
  '/org/me',
  requireOrgApiKey,
  asyncHandler(async (req, res) => {
    const org = (req as AuthenticatedRequest).org;
    if (!org) {
      sendError(res, 401, 'Invalid API key', 'UNAUTHORIZED');
      return;
    }

    res.json({ org });
  })
);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  sendError(res, 500, 'Internal server error', 'DB_ERROR');
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
  await ensureCoordinatorSchema();
  await ensureBootstrapUsers();

  app.listen(config.port, () => {
    const maskedUrl = config.databaseUrl.replace(/\/\/.*@/, '//***@');
    console.log(`Coordinator running on port ${config.port}`);
    console.log(`Database: ${maskedUrl}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start coordinator:', err);
  process.exit(1);
});
