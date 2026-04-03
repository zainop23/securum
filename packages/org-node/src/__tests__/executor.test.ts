import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { QueryDefinition } from '@securum/shared';
import { executeQuery } from '../executor';
import { LoadedSchemaMap } from '../schema';

// Create a mock schema map for testing
const mockSchemaMap: LoadedSchemaMap = {
  tables: { transactions: 'sales' },
  columns: {
    amount: 'total_amount',
    category: 'product_type',
    region: 'region',
    tx_date: 'sale_date',
  },
  reverseColumnMap: {
    total_amount: 'amount',
    product_type: 'category',
    region: 'region',
    sale_date: 'tx_date',
  },
};

function createMockPool(rows: Record<string, unknown>[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe('Executor Pipeline', () => {
  it('should handle scalar COUNT query', async () => {
    const pool = createMockPool([{ count: 42 }]);
    const queryDef: QueryDefinition = {
      aggregate: 'COUNT',
      column: 'amount',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.type).toBe('scalar');
      if (result.result.type === 'scalar') {
        expect(result.result.value).toBe(42);
      }
    }
  });

  it('should handle scalar SUM query', async () => {
    const pool = createMockPool([{ sum: 12345.67 }]);
    const queryDef: QueryDefinition = {
      aggregate: 'SUM',
      column: 'amount',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.type).toBe('scalar');
      if (result.result.type === 'scalar') {
        expect(result.result.value).toBe(12345.67);
      }
    }
  });

  it('should handle AVG query returning sum and count', async () => {
    const pool = createMockPool([{ sum: 10000, count: 200 }]);
    const queryDef: QueryDefinition = {
      aggregate: 'AVG',
      column: 'amount',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.type).toBe('avg');
      if (result.result.type === 'avg') {
        expect(result.result.sum).toBe(10000);
        expect(result.result.count).toBe(200);
      }
    }
  });

  it('should handle grouped COUNT query', async () => {
    const pool = createMockPool([
      { region: 'North', count: 100 },
      { region: 'South', count: 150 },
    ]);
    const queryDef: QueryDefinition = {
      aggregate: 'COUNT',
      column: 'amount',
      grouping: 'region',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.type).toBe('grouped');
      if (result.result.type === 'grouped') {
        expect(result.result.groups).toHaveLength(2);
        expect(result.result.groups[0].groupKey).toBe('North');
        expect(result.result.groups[0].value).toBe(100);
      }
    }
  });

  it('should handle grouped AVG query', async () => {
    const pool = createMockPool([
      { region: 'East', sum: 5000, count: 50 },
      { region: 'West', sum: 8000, count: 80 },
    ]);
    const queryDef: QueryDefinition = {
      aggregate: 'AVG',
      column: 'amount',
      grouping: 'region',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.type).toBe('grouped_avg');
      if (result.result.type === 'grouped_avg') {
        expect(result.result.groups).toHaveLength(2);
        expect(result.result.groups[0].groupKey).toBe('East');
        expect(result.result.groups[0].sum).toBe(5000);
        expect(result.result.groups[0].count).toBe(50);
      }
    }
  });

  it('should return INVALID_QUERY for invalid column', async () => {
    const pool = createMockPool([]);
    const queryDef: QueryDefinition = {
      aggregate: 'SUM',
      column: 'ssn',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_QUERY');
    }
  });

  it('should return INVALID_QUERY for unsupported aggregate', async () => {
    const pool = createMockPool([]);
    const queryDef: QueryDefinition = {
      aggregate: 'MEDIAN' as any,
      column: 'amount',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_QUERY');
    }
  });

  it('should return DB_ERROR when pool.query throws', async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as Pool;

    const queryDef: QueryDefinition = {
      aggregate: 'COUNT',
      column: 'amount',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DB_ERROR');
    }
  });

  it('should return TIMEOUT when query exceeds timeout', async () => {
    const pool = {
      query: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      ),
    } as unknown as Pool;

    const queryDef: QueryDefinition = {
      aggregate: 'COUNT',
      column: 'amount',
      submitter: 'analyst',
    };

    const result = await executeQuery(queryDef, mockSchemaMap, pool, 100);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('TIMEOUT');
    }
  });
});
