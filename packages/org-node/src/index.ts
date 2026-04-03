import express from 'express';
import cors from 'cors';
import { QueryDefinition } from '@securum/shared';
import { config } from './config';
import { pool } from './db';
import { loadAndValidateSchemaMap, LoadedSchemaMap } from './schema';
import { executeQuery } from './executor';
import { applyNoise } from './noise';

type ErrorCode = 'INVALID_QUERY' | 'SCHEMA_MISMATCH' | 'DB_ERROR' | 'TIMEOUT';

function sendError(res: express.Response, status: number, error: string, code: ErrorCode): void {
  res.status(status).json({ error, code });
}

// ---------- Load schema map at startup ----------
let schemaMap: LoadedSchemaMap;
try {
  schemaMap = loadAndValidateSchemaMap(config.schemaMapPath);
} catch (err) {
  console.error('FATAL: Schema map validation failed:', (err as Error).message);
  process.exit(1);
}

// ---------- Express app ----------
const app = express();
app.use(cors());
app.use(express.json());

// ---------- GET /health ----------
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', orgName: config.orgName });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', orgName: config.orgName });
  }
});

// ---------- POST /execute ----------
app.post('/execute', async (req, res) => {
  try {
    const body = req.body as {
      queryId?: string;
      queryDefinition?: Partial<QueryDefinition>;
      epsilon?: number;
    };

    // Validate request body
    if (!body.queryId || typeof body.queryId !== 'string') {
      sendError(res, 400, 'queryId is required and must be a string', 'INVALID_QUERY');
      return;
    }

    if (!body.queryDefinition) {
      sendError(res, 400, 'queryDefinition is required', 'INVALID_QUERY');
      return;
    }

    // Validate epsilon
    let epsilon: number;
    if (body.epsilon !== undefined) {
      epsilon = Number(body.epsilon);
      if (!Number.isFinite(epsilon) || !(epsilon > 0)) {
        sendError(res, 400, 'epsilon must be a positive finite number', 'INVALID_QUERY');
        return;
      }
    } else {
      epsilon = config.defaultEpsilon;
    }

    // Build query definition
    const queryDef: QueryDefinition = {
      aggregate: body.queryDefinition.aggregate as QueryDefinition['aggregate'],
      column: String(body.queryDefinition.column ?? ''),
      filter: body.queryDefinition.filter,
      grouping: body.queryDefinition.grouping,
      submitter: String(body.queryDefinition.submitter ?? ''),
    };

    // Execute pipeline
    const execResult = await executeQuery(queryDef, schemaMap, pool);

    if (!execResult.ok) {
      const statusCode = execResult.code === 'TIMEOUT' ? 504 : 400;
      sendError(res, statusCode, execResult.error, execResult.code);
      return;
    }

    // Apply differential privacy noise
    const noisyResult = applyNoise(execResult.result, epsilon);

    console.log(`Query ${body.queryId} executed successfully (type: ${noisyResult.type})`);

    res.json({
      queryId: body.queryId,
      noisyResult,
    });
  } catch (err) {
    console.error('Unexpected error in /execute:', (err as Error).message);
    sendError(res, 500, 'Internal server error', 'DB_ERROR');
  }
});

// ---------- Global error handler ----------
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  sendError(res, 500, 'Internal server error', 'DB_ERROR');
});

// ---------- Start ----------
app.listen(config.port, () => {
  const maskedUrl = config.databaseUrl.replace(/\/\/.*@/, '//***@');
  console.log(`Org-Node [${config.orgName}] running on port ${config.port}`);
  console.log(`Database: ${maskedUrl}`);
  console.log(`Default epsilon: ${config.defaultEpsilon}, SUM sensitivity: ${config.sumSensitivity}`);
});
