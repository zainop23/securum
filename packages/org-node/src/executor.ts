import { Pool } from 'pg';
import { validateAndBuildQuery, rewriteQuery, QueryDefinition } from '@securum/shared';
import { LoadedSchemaMap } from './schema';
import { LocalResult } from './types';

export interface ExecuteSuccess {
  ok: true;
  result: LocalResult;
}

export interface ExecuteFailure {
  ok: false;
  error: string;
  code: 'INVALID_QUERY' | 'DB_ERROR' | 'SCHEMA_MISMATCH' | 'TIMEOUT';
}

export type ExecuteResult = ExecuteSuccess | ExecuteFailure;

export async function executeQuery(
  queryDefinition: QueryDefinition,
  schemaMap: LoadedSchemaMap,
  pool: Pool,
  timeoutMs: number = 10000
): Promise<ExecuteResult> {
  // Step 1: Validate query definition
  const parsed = validateAndBuildQuery(queryDefinition);
  if (!parsed.valid) {
    return { ok: false, error: parsed.error, code: 'INVALID_QUERY' };
  }

  // Step 2: Rewrite SQL using local schema
  const rewritten = rewriteQuery(parsed.sql, schemaMap);
  const localSql = rewritten.sql;

  console.log(`Executing local SQL: ${localSql}`);

  // Step 3: Execute rewritten query on local DB
  let rows: Record<string, unknown>[];
  try {
    const result = await Promise.race([
      pool.query(localSql),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
      ),
    ]);
    rows = result.rows;
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'Query timeout') {
      return { ok: false, error: 'Query execution timed out', code: 'TIMEOUT' };
    }
    console.error('DB execution error:', message);
    return { ok: false, error: 'Database execution failed', code: 'DB_ERROR' };
  }

  // Step 4: Normalize results into LocalResult
  try {
    const result = normalizeResult(rows, queryDefinition, rewritten.reverseMap);
    return { ok: true, result };
  } catch (err) {
    console.error('Result normalization error:', (err as Error).message);
    return { ok: false, error: 'Failed to normalize query results', code: 'DB_ERROR' };
  }
}

function normalizeResult(
  rows: Record<string, unknown>[],
  queryDef: QueryDefinition,
  reverseMap: Record<string, string>
): LocalResult {
  const isGrouped = !!queryDef.grouping;
  const isAvg = queryDef.aggregate === 'AVG';

  if (!isGrouped && !isAvg) {
    // Scalar COUNT/SUM/MAX/MIN
    const row = rows[0];
    const key = Object.keys(row)[0];
    const value = Number(row[key]);
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite scalar result: ${row[key]}`);
    }
    return { type: 'scalar', value, isCount: queryDef.aggregate === 'COUNT' };
  }

  if (!isGrouped && isAvg) {
    // Scalar AVG (returned as sum + count)
    const row = rows[0];
    const sum = Number(row['sum']);
    const count = Number(row['count']);
    if (!Number.isFinite(sum) || !Number.isFinite(count)) {
      throw new Error('Non-finite AVG components');
    }
    return { type: 'avg', sum, count };
  }

  if (isGrouped && !isAvg) {
    // Grouped scalar (COUNT/SUM/MAX/MIN)
    const groups = rows.map((row) => {
      const groupKey = resolveGroupKey(row, queryDef.grouping!, reverseMap);
      // The aggregate value is the column that is NOT the grouping column
      const valueKey = Object.keys(row).find((k) => k !== getLocalGroupingCol(queryDef.grouping!, reverseMap));
      const value = Number(row[valueKey!]);
      if (!Number.isFinite(value)) {
        throw new Error(`Non-finite grouped value for group "${groupKey}"`);
      }
      return { groupKey, value };
    });
    return { type: 'grouped', groups, isCount: queryDef.aggregate === 'COUNT' };
  }

  // Grouped AVG (sum + count per group)
  const groups = rows.map((row) => {
    const groupKey = resolveGroupKey(row, queryDef.grouping!, reverseMap);
    const sum = Number(row['sum']);
    const count = Number(row['count']);
    if (!Number.isFinite(sum) || !Number.isFinite(count)) {
      throw new Error(`Non-finite grouped AVG components for group "${groupKey}"`);
    }
    return { groupKey, sum, count };
  });
  return { type: 'grouped_avg', groups };
}

function getLocalGroupingCol(globalGroupCol: string, reverseMap: Record<string, string>): string {
  // Find the local column name for the global grouping column
  for (const [localCol, globalCol] of Object.entries(reverseMap)) {
    if (globalCol === globalGroupCol) {
      return localCol;
    }
  }
  // If no mapping found, use the original name
  return globalGroupCol;
}

function resolveGroupKey(
  row: Record<string, unknown>,
  globalGroupCol: string,
  reverseMap: Record<string, string>
): string {
  const localCol = getLocalGroupingCol(globalGroupCol, reverseMap);
  return String(row[localCol] ?? 'unknown');
}
