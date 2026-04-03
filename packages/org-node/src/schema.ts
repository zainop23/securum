import * as fs from 'fs';
import * as path from 'path';
import { SchemaMap, GLOBAL_SCHEMA } from '@securum/shared';

export interface LoadedSchemaMap extends SchemaMap {
  reverseColumnMap: Record<string, string>;
}

export function loadAndValidateSchemaMap(schemaMapPath: string): LoadedSchemaMap {
  const resolvedPath = path.resolve(schemaMapPath);
  console.log(`Loading schema map from: ${resolvedPath}`);

  let raw: string;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read schema map at ${resolvedPath}: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Schema map is not valid JSON: ${(err as Error).message}`);
  }

  const map = parsed as SchemaMap;

  if (!map.tables || typeof map.tables !== 'object') {
    throw new Error('Schema map must have a "tables" object');
  }
  if (!map.columns || typeof map.columns !== 'object') {
    throw new Error('Schema map must have a "columns" object');
  }

  // Validate all global tables are present
  for (const globalTable of Object.keys(GLOBAL_SCHEMA)) {
    if (!(globalTable in map.tables)) {
      throw new Error(`Schema map missing required global table: "${globalTable}"`);
    }
    if (typeof map.tables[globalTable] !== 'string' || !map.tables[globalTable]) {
      throw new Error(`Schema map table mapping for "${globalTable}" must be a non-empty string`);
    }
  }

  // Validate all global columns are present
  for (const globalTable of Object.keys(GLOBAL_SCHEMA)) {
    const requiredColumns = GLOBAL_SCHEMA[globalTable];
    for (const globalCol of requiredColumns) {
      if (!(globalCol in map.columns)) {
        throw new Error(`Schema map missing required global column: "${globalCol}"`);
      }
      if (typeof map.columns[globalCol] !== 'string' || !map.columns[globalCol]) {
        throw new Error(`Schema map column mapping for "${globalCol}" must be a non-empty string`);
      }
    }
  }

  // Check for duplicate local column values
  const localValues = Object.values(map.columns);
  const seen = new Set<string>();
  for (const v of localValues) {
    if (seen.has(v)) {
      console.warn(`Warning: duplicate local column mapping "${v}" in schema map`);
    }
    seen.add(v);
  }

  // Build reverse map: local column -> global column
  const reverseColumnMap: Record<string, string> = {};
  for (const [globalCol, localCol] of Object.entries(map.columns)) {
    reverseColumnMap[localCol] = globalCol;
  }

  console.log(`Schema map validated successfully. Tables: ${Object.keys(map.tables).length}, Columns: ${Object.keys(map.columns).length}`);

  return {
    tables: map.tables,
    columns: map.columns,
    reverseColumnMap,
  };
}
