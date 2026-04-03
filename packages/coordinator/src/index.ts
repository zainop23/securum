import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { validateAndBuildQuery, QueryDefinition } from '@securum/shared';
import { runOrchestration } from './orchestration/engine';
import { config } from './config';
import { pool } from './db';

const app = express();
app.use(cors());
app.use(express.json());

type ErrorCode =
  | 'INVALID_QUERY'
  | 'SCHEMA_MISMATCH'
  | 'DB_ERROR'
  | 'TIMEOUT'
  | 'COMMITMENT_FAILED'
  | 'QUORUM_NOT_MET'
  | 'UNAUTHORIZED';

type JwtClaims = {
  sub: string;
  role: 'analyst';
};

type AuthenticatedRequest = express.Request & {
  user?: JwtClaims;
  org?: {
    id: string;
    name: string;
  };
};

function sendError(res: express.Response, status: number, error: string, code: ErrorCode): void {
  res.status(status).json({ error, code });
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

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

const asyncHandler =
  (handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

function requireJwt(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtClaims;
    if (!decoded?.sub || decoded.role !== 'analyst') {
      sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
      return;
    }

    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch {
    sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
  }
}

const requireOrgApiKey = asyncHandler(async (req, res, next) => {
  const apiKey = req.header('x-org-api-key');
  if (!apiKey) {
    sendError(res, 401, 'Invalid API key', 'UNAUTHORIZED');
    return;
  }

  const keyHash = hashApiKey(apiKey);
  const orgResult = await pool.query(
    `SELECT id, name
     FROM organizations
     WHERE api_key_hash = $1 AND status = 'active'
     LIMIT 1`,
    [keyHash]
  );

  if (orgResult.rowCount !== 1) {
    sendError(res, 401, 'Invalid API key', 'UNAUTHORIZED');
    return;
  }

  const org = orgResult.rows[0] as { id: string; name: string };
  (req as AuthenticatedRequest).org = org;
  next();
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username !== config.analystUser || password !== config.analystPassword) {
    sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
    return;
  }

  const token = jwt.sign({ sub: username, role: 'analyst' }, config.jwtSecret, {
    expiresIn: '8h',
  });

  res.json({ token });
});

app.post(
  '/orgs/register',
  requireJwt,
  asyncHandler(async (req, res) => {
    const { name, endpointUrl } = req.body as { name?: string; endpointUrl?: string };
    if (!name || !endpointUrl) {
      sendError(res, 400, 'name and endpointUrl are required', 'INVALID_QUERY');
      return;
    }

    const orgId = randomUUID();
    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = hashApiKey(apiKey);

    await pool.query(
      `INSERT INTO organizations (id, name, api_key_hash, endpoint_url, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [orgId, name, apiKeyHash, endpointUrl]
    );

    await logAuditEvent(null, orgId, 'ORG_REGISTERED', {
      name,
      endpointUrl,
      registeredBy: (req as AuthenticatedRequest).user?.sub,
    });

    res.status(201).json({ orgId, apiKey });
  })
);

app.get(
  '/orgs',
  requireJwt,
  asyncHandler(async (_req, res) => {
    const orgsResult = await pool.query(
      `SELECT id, name, endpoint_url, status, created_at
       FROM organizations
       ORDER BY created_at DESC`
    );

    res.json({ orgs: orgsResult.rows });
  })
);

app.post(
  '/query',
  requireJwt,
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<QueryDefinition> & { epsilon?: number };
    const submitter = (req as AuthenticatedRequest).user?.sub;
    if (!submitter) {
      sendError(res, 401, 'Invalid credentials', 'UNAUTHORIZED');
      return;
    }

    const def: QueryDefinition = {
      aggregate: body.aggregate as QueryDefinition['aggregate'],
      column: String(body.column ?? ''),
      filter: body.filter,
      grouping: body.grouping,
      submitter,
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
      `INSERT INTO queries (id, submitted_by, query_definition, status, quorum, epsilon)
       VALUES ($1, $2, $3::jsonb, 'pending', $4, $5)`,
      [queryId, submitter, JSON.stringify(def), config.quorumMin, epsilon]
    );

    await logAuditEvent(queryId, null, 'QUERY_SUBMITTED', { submittedBy: submitter });

    // Run full commit–reveal orchestration synchronously
    const orchestrationResult = await runOrchestration(pool, queryId, def, epsilon);

    if (orchestrationResult.ok) {
      res.json({
        queryId: orchestrationResult.queryId,
        status: 'done',
        result: orchestrationResult.result,
      });
    } else {
      res.json({
        queryId: orchestrationResult.queryId,
        status: 'failed',
        error: orchestrationResult.error,
      });
    }
  })
);

app.get(
  '/results/:queryId',
  requireJwt,
  asyncHandler(async (req, res) => {
    const { queryId } = req.params;
    const result = await pool.query(
      `SELECT q.id AS query_id, q.status, r.global_result
       FROM queries q
       LEFT JOIN results r ON r.query_id = q.id
       WHERE q.id = $1
       LIMIT 1`,
      [queryId]
    );

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

app.get(
  '/results',
  requireJwt,
  asyncHandler(async (_req, res) => {
    const result = await pool.query(
      `SELECT id AS query_id, status, submitted_by, created_at
       FROM queries
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.json({ results: result.rows });
  })
);

app.get(
  '/audit/:queryId',
  requireJwt,
  asyncHandler(async (req, res) => {
    const { queryId } = req.params;
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

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  sendError(res, 500, 'Internal server error', 'DB_ERROR');
});

app.listen(config.port, () => {
  const maskedUrl = config.databaseUrl.replace(/\/\/.*@/, '//***@');
  console.log(`Coordinator running on port ${config.port}`);
  console.log(`Database: ${maskedUrl}`);
});
