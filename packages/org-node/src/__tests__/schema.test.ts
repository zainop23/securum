import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { loadAndValidateSchemaMap } from '../schema';

describe('Schema Map Loader', () => {
  function writeTempJson(data: unknown): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-test-'));
    const filePath = path.join(tmpDir, 'schema-map.json');
    fs.writeFileSync(filePath, JSON.stringify(data));
    return filePath;
  }

  it('should load and validate a correct schema map', () => {
    const filePath = writeTempJson({
      tables: { transactions: 'sales' },
      columns: {
        amount: 'total_amount',
        category: 'product_type',
        region: 'region',
        tx_date: 'sale_date',
      },
    });

    const result = loadAndValidateSchemaMap(filePath);
    expect(result.tables).toEqual({ transactions: 'sales' });
    expect(result.columns.amount).toBe('total_amount');
    expect(result.reverseColumnMap['total_amount']).toBe('amount');
    expect(result.reverseColumnMap['region']).toBe('region');
  });

  it('should throw on missing file', () => {
    expect(() => loadAndValidateSchemaMap('/nonexistent/path.json')).toThrow(
      'Failed to read schema map'
    );
  });

  it('should throw on invalid JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-test-'));
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{ not valid json }');

    expect(() => loadAndValidateSchemaMap(filePath)).toThrow('not valid JSON');
  });

  it('should throw when tables key is missing', () => {
    const filePath = writeTempJson({
      columns: { amount: 'total', category: 'cat', region: 'reg', tx_date: 'dt' },
    });

    expect(() => loadAndValidateSchemaMap(filePath)).toThrow('"tables" object');
  });

  it('should throw when a required global table is missing', () => {
    const filePath = writeTempJson({
      tables: {},
      columns: { amount: 'total', category: 'cat', region: 'reg', tx_date: 'dt' },
    });

    expect(() => loadAndValidateSchemaMap(filePath)).toThrow('missing required global table');
  });

  it('should throw when a required column is missing', () => {
    const filePath = writeTempJson({
      tables: { transactions: 'sales' },
      columns: { amount: 'total', category: 'cat', region: 'reg' },
      // missing tx_date
    });

    expect(() => loadAndValidateSchemaMap(filePath)).toThrow('missing required global column');
  });

  it('should throw when a column mapping is empty string', () => {
    const filePath = writeTempJson({
      tables: { transactions: 'sales' },
      columns: { amount: '', category: 'cat', region: 'reg', tx_date: 'dt' },
    });

    expect(() => loadAndValidateSchemaMap(filePath)).toThrow('non-empty string');
  });

  it('should build correct reverse map', () => {
    const filePath = writeTempJson({
      tables: { transactions: 'orders' },
      columns: {
        amount: 'amount',
        category: 'category',
        region: 'area',
        tx_date: 'order_date',
      },
    });

    const result = loadAndValidateSchemaMap(filePath);
    expect(result.reverseColumnMap).toEqual({
      amount: 'amount',
      category: 'category',
      area: 'region',
      order_date: 'tx_date',
    });
  });
});
