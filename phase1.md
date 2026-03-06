# Phase 1 — Query Validation, Schema Mapping & Seed Data

**Goal:** The shared library can validate analyst queries and rewrite them for each org's private schema. All 3 org databases have realistic seed data. Unit tests prove everything works.

**Prereqs:** Phase 0 complete — monorepo set up, shared types exist, coordinator boots with health check, 6 DB tables created.

---

## What you're building (big picture)

An analyst submits a query like "give me SUM of amount from transactions". But no org has a table called `transactions` or a column called `amount` — those are **generic names**. Each org has its own private schema:

```
Analyst says:           SUM of "amount" from "transactions"
                              ↓
Query Validator:        Is "SUM" valid? Is "transactions" a known table? Is "amount" a valid column?
                              ↓ (yes → builds SQL)
Built SQL:              SELECT SUM(amount) FROM transactions
                              ↓
Schema Rewriter (Org 1): SELECT SUM(total_amount) FROM sales
Schema Rewriter (Org 2): SELECT SUM(amount) FROM orders
Schema Rewriter (Org 3): SELECT SUM(price) FROM purchases
```

Each org runs the rewritten SQL on its own database, adds noise, and replies. The analyst never sees the real table/column names.

You're implementing the **validator** and **rewriter** — both are pure functions (no database, no network). Plus seed data so the org databases have something to query.

---

## Concepts you need to understand first

### Global Schema

A whitelist of allowed table and column names. This is the "contract" between the analyst and the system. The analyst can only query things that exist in the global schema.

```
GLOBAL_SCHEMA = {
  transactions: ['amount', 'category', 'region', 'tx_date']
}
```

This means: analysts can query the `transactions` table, and only the columns `amount`, `category`, `region`, `tx_date`. Anything else is rejected.

### Schema Map

Each org has a JSON config file that maps global names → local names. Example for org 1:

```json
{
  "tables": { "transactions": "sales" },
  "columns": {
    "amount": "total_amount",
    "category": "product_type",
    "region": "region",
    "tx_date": "sale_date"
  }
}
```

The rewriter uses this to translate `SELECT SUM(amount) FROM transactions` → `SELECT SUM(total_amount) FROM sales`.

### SQL Injection Prevention

The validator **never** puts raw user input into SQL. It checks every identifier (table name, column name, aggregate function) against a whitelist first. If it's not in the list, the query is rejected. This is called **allowlist-based validation** — the safest approach.

### Why AVG is special

You can't just average the averages from 3 orgs. Example:
- Org 1: 2 records, average = 100 → contributed sum = 200
- Org 2: 1000 records, average = 50 → contributed sum = 50,000

Average of averages: (100 + 50) / 2 = 75 ← **WRONG**
Correct global average: (200 + 50,000) / 1002 = 50.1

So for AVG queries, each org returns **both sum and count**, and the coordinator computes the real average.

---

## Files you'll create/modify

```
packages/shared/src/
├── constants.ts          ← ADD: GLOBAL_SCHEMA
├── types.ts              ← ADD: SchemaMap, ValidatorResult, RewriterResult
├── validator.ts          ← NEW: validateAndBuildQuery()
├── rewriter.ts           ← NEW: rewriteQuery()
├── index.ts              ← UPDATE: re-export new modules
└── __tests__/
    ├── validator.test.ts ← NEW: unit tests
    └── rewriter.test.ts  ← NEW: unit tests

packages/org-node/config/
├── schema-map-org1.json  ← NEW: org 1 schema mapping
├── schema-map-org2.json  ← NEW: org 2 schema mapping
└── schema-map-org3.json  ← NEW: org 3 schema mapping

docker/dev-seed/
├── seed-org1.sql         ← REPLACE: real seed data (~10K rows)
├── seed-org2.sql         ← REPLACE: real seed data (~10K rows)
└── seed-org3.sql         ← REPLACE: real seed data (~10K rows)

packages/shared/package.json ← UPDATE: add vitest
```

---

## Step 1 — Add missing types

Your `types.ts` needs 3 more types that the validator and rewriter will use.

### 1.1 `SchemaMap`

The rewriter needs to know how to translate global names → local names. Define an interface:

```typescript
export interface SchemaMap {
  tables: Record<string, string>;    // e.g. { "transactions": "sales" }
  columns: Record<string, string>;   // e.g. { "amount": "total_amount" }
}
```

`Record<string, string>` means an object where every key and value are strings — like a dictionary/map.

### 1.2 `ValidatorResult`

The validator either succeeds (returns SQL) or fails (returns an error). Use a **discriminated union** — TypeScript can narrow the type based on the `valid` field:

```typescript
export type ValidatorResult =
  | { valid: true; sql: string }
  | { valid: false; error: string };
```

When you check `if (result.valid)`, TypeScript knows `result.sql` exists. If `!result.valid`, TypeScript knows `result.error` exists.

### 1.3 `RewriterResult`

The rewriter returns the translated SQL plus a reverse map (so results can be translated back to global names later):

```typescript
export interface RewriterResult {
  sql: string;
  reverseMap: Record<string, string>;  // local column → global column
}
```

Add all three to `types.ts` and export them.

---

## Step 2 — Add GLOBAL_SCHEMA to constants

Add this to `constants.ts`:

```typescript
export const GLOBAL_SCHEMA: Record<string, string[]> = {
  transactions: ['amount', 'category', 'region', 'tx_date']
};
```

This is the **single source of truth** for what analysts can query. Every validation check references this object.

For now there's only one table (`transactions`). More can be added later — the validator code should handle any number of tables automatically.

---

## Step 3 — Write the query validator

Create `packages/shared/src/validator.ts`.

This is the most important file in the phase. It takes a `QueryDefinition` and decides: is this query valid? If yes, produce the SQL. If no, explain why.

### What it does

```
Input:  { aggregate: "SUM", column: "amount", grouping: undefined, ... }
Output: { valid: true, sql: "SELECT SUM(amount) FROM transactions" }

Input:  { aggregate: "SUM", column: "ssn", ... }
Output: { valid: false, error: "Column 'ssn' is not in the global schema for table 'transactions'" }
```

### Validation steps (in order)

Write a function `validateAndBuildQuery(query: QueryDefinition): ValidatorResult` that:

1. **Check aggregate** — is `query.aggregate` in `SUPPORTED_AGGREGATES`? If not → `{ valid: false, error: "Unsupported aggregate: ..." }`

2. **Find the table** — For Phase 1, there's only one table. You can either:
   - Accept an optional `table` field in the query (you'd need to add it to `QueryDefinition`)
   - Or default to `'transactions'` (simpler — recommended for now)
   
   Either way, check that the table exists in `GLOBAL_SCHEMA`.

3. **Check column** — is `query.column` in `GLOBAL_SCHEMA[table]`? If not → invalid.

4. **Check grouping** — if `query.grouping` is provided, is it in `GLOBAL_SCHEMA[table]`? If not → invalid.

5. **Check filters** — if `query.filter` is provided, check that every filter's `column` is in `GLOBAL_SCHEMA[table]`. If any is not → invalid.

6. **Build the SQL** — all checks passed, now construct the SQL string:

### SQL building rules

The SQL structure depends on the aggregate and whether there's a GROUP BY:

**Without GROUP BY:**
| Aggregate | SQL |
|-----------|-----|
| COUNT | `SELECT COUNT(column) FROM table` |
| SUM | `SELECT SUM(column) FROM table` |
| AVG | `SELECT SUM(column) AS sum, COUNT(column) AS count FROM table` |
| MAX | `SELECT MAX(column) FROM table` |
| MIN | `SELECT MIN(column) FROM table` |

**With GROUP BY:**
Add the grouping column to SELECT and append GROUP BY:
| Aggregate | SQL |
|-----------|-----|
| COUNT | `SELECT grouping, COUNT(column) FROM table GROUP BY grouping` |
| SUM | `SELECT grouping, SUM(column) FROM table GROUP BY grouping` |
| AVG | `SELECT grouping, SUM(column) AS sum, COUNT(column) AS count FROM table GROUP BY grouping` |

**With Filters:**
Add `WHERE` clause between `FROM table` and `GROUP BY`:
```
SELECT SUM(amount) FROM transactions WHERE region = $1 AND category = $2
```

For filters, use **parameterized placeholders** (`$1`, `$2`, etc.) instead of putting values directly in the SQL. This is defense-in-depth — even though the column names are already validated, we never put user-provided *values* into SQL strings.

However, for Phase 1, you can simplify: since the validator only needs to produce the SQL *template* (the org-node will handle parameterization when it actually runs the query), you can use literal values in the SQL for now. Just make sure column names in the WHERE clause are validated against the global schema.

### Important: Why this is safe

Every identifier in the SQL (table name, column name, aggregate function) was checked against a hardcoded whitelist before being placed into the string. There's no path for user input to become arbitrary SQL.

### Return value

```typescript
return { valid: true, sql: builtSqlString };
```

---

## Step 4 — Write the schema rewriter

Create `packages/shared/src/rewriter.ts`.

This function takes the SQL from the validator (which uses generic names) and replaces them with org-specific local names.

### What it does

```
Input:  sql = "SELECT SUM(amount) FROM transactions"
        schemaMap = { tables: { transactions: "sales" }, columns: { amount: "total_amount" } }

Output: { sql: "SELECT SUM(total_amount) FROM sales",
          reverseMap: { "total_amount": "amount" } }
```

### Function signature

```typescript
export function rewriteQuery(sql: string, schemaMap: SchemaMap): RewriterResult
```

### Implementation approach

**WARNING — the #1 bug in this phase:**

If you use naive `string.replace('amount', 'total_amount')` and there's another column like `total_amount` already in the string, or a column name that's a substring of another, you'll get corrupted SQL.

**Safe approach — replace with word boundaries:**

Use a regex with word boundary markers to ensure you only replace whole words:

```typescript
// Replace a whole word only
function replaceWholeWord(sql: string, oldWord: string, newWord: string): string {
  const regex = new RegExp(`\\b${oldWord}\\b`, 'g');
  return sql.replace(regex, newWord);
}
```

`\b` matches a word boundary — the position between a word character and a non-word character. So `\bamount\b` matches `amount` but NOT `total_amount`.

### Steps

1. Start with the input SQL
2. Replace each table name: `for (const [globalTable, localTable] of Object.entries(schemaMap.tables))`
3. Replace each column name: `for (const [globalCol, localCol] of Object.entries(schemaMap.columns))`
4. Build reverseMap: flip the columns mapping (local → global)
5. Return `{ sql: rewrittenSql, reverseMap }`

### Building the reverse map

```typescript
const reverseMap: Record<string, string> = {};
for (const [globalCol, localCol] of Object.entries(schemaMap.columns)) {
  reverseMap[localCol] = globalCol;
}
```

This is used later (Phase 3+) when the org-node gets results back from its DB — the column names in the result set are local, and we need to translate them back to global names before sending to the coordinator.

---

## Step 5 — Update exports

### 5.1 Update `index.ts`

Add re-exports for the new modules:

```typescript
export * from './types';
export * from './constants';
export * from './validator';
export * from './rewriter';
```

### 5.2 Build and verify

```bash
cd /path/to/securum
npm run build
```

Should compile without errors. Check `packages/shared/dist/` for the new `.js` and `.d.ts` files.

---

## Step 6 — Create schema map configs

Create 3 JSON files in `packages/org-node/config/`. Each org has different real table/column names — this simulates real-world orgs with different databases.

### `packages/org-node/config/schema-map-org1.json`

```json
{
  "tables": {
    "transactions": "sales"
  },
  "columns": {
    "amount": "total_amount",
    "category": "product_type",
    "region": "region",
    "tx_date": "sale_date"
  }
}
```

Org 1 is a retail company. Their data is in a `sales` table. `amount` is called `total_amount`, `category` is `product_type`, `region` stays the same, `tx_date` is `sale_date`.

### `packages/org-node/config/schema-map-org2.json`

```json
{
  "tables": {
    "transactions": "orders"
  },
  "columns": {
    "amount": "amount",
    "category": "category",
    "region": "area",
    "tx_date": "order_date"
  }
}
```

Org 2 is an e-commerce company. Their table is `orders`. Most column names happen to match except `region` → `area` and `tx_date` → `order_date`.

### `packages/org-node/config/schema-map-org3.json`

```json
{
  "tables": {
    "transactions": "purchases"
  },
  "columns": {
    "amount": "price",
    "category": "item_class",
    "region": "location",
    "tx_date": "purchase_date"
  }
}
```

Org 3 is a procurement company. Completely different naming — `purchases` table, `price` instead of `amount`, etc.

This diversity is intentional — it proves the rewriter handles different mappings correctly.

---

## Step 7 — Create seed data

Replace the placeholder seed files with real data. Each org gets ~10,000 rows of realistic transaction data.

### Why `generate_series` + `random()`?

PostgreSQL can generate thousands of rows in a single SQL statement. No need to write 10,000 INSERT statements.

### `docker/dev-seed/seed-org1.sql`

```sql
-- Org 1: Retail company — "sales" table
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    total_amount NUMERIC(10,2) NOT NULL,
    product_type VARCHAR(50) NOT NULL,
    region VARCHAR(50) NOT NULL,
    sale_date DATE NOT NULL
);

INSERT INTO sales (total_amount, product_type, region, sale_date)
SELECT
    ROUND((random() * 490 + 10)::numeric, 2),
    (ARRAY['Electronics','Clothing','Food','Furniture','Sports'])[floor(random()*5+1)::int],
    (ARRAY['North','South','East','West'])[floor(random()*4+1)::int],
    DATE '2024-01-01' + (random() * 730)::int
FROM generate_series(1, 10000);
```

This creates 10,000 rows with:
- `total_amount`: random between 10.00 and 500.00
- `product_type`: one of 5 categories
- `region`: one of 4 regions
- `sale_date`: random date in 2024-2025

### `docker/dev-seed/seed-org2.sql`

```sql
-- Org 2: E-commerce company — "orders" table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    area VARCHAR(50) NOT NULL,
    order_date DATE NOT NULL
);

INSERT INTO orders (amount, category, area, order_date)
SELECT
    ROUND((random() * 490 + 10)::numeric, 2),
    (ARRAY['Electronics','Clothing','Food','Furniture','Sports'])[floor(random()*5+1)::int],
    (ARRAY['North','South','East','West'])[floor(random()*4+1)::int],
    DATE '2024-01-01' + (random() * 730)::int
FROM generate_series(1, 10000);
```

### `docker/dev-seed/seed-org3.sql`

```sql
-- Org 3: Procurement company — "purchases" table
CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    price NUMERIC(10,2) NOT NULL,
    item_class VARCHAR(50) NOT NULL,
    location VARCHAR(50) NOT NULL,
    purchase_date DATE NOT NULL
);

INSERT INTO purchases (price, item_class, location, purchase_date)
SELECT
    ROUND((random() * 490 + 10)::numeric, 2),
    (ARRAY['Electronics','Clothing','Food','Furniture','Sports'])[floor(random()*5+1)::int],
    (ARRAY['North','South','East','West'])[floor(random()*4+1)::int],
    DATE '2024-01-01' + (random() * 730)::int
FROM generate_series(1, 10000);
```

**Important:** Since we're replacing the placeholder seeds, you need to destroy old volumes first:
```bash
docker compose -f docker/docker-compose.yml down -v
```

---

## Step 8 — Write unit tests

### 8.1 Set up vitest

Add vitest to the shared package:

```bash
cd packages/shared
npm install --save-dev vitest
```

Add a test script to `packages/shared/package.json`:
```json
"scripts": {
  "build": "tsc",
  "test": "vitest run"
}
```

### 8.2 Create test directory

```bash
mkdir -p packages/shared/src/__tests__
```

### 8.3 `packages/shared/src/__tests__/validator.test.ts`

Write tests for these scenarios:

**Should pass (valid queries):**
- COUNT on a valid column → returns `{ valid: true, sql: "SELECT COUNT(amount) FROM transactions" }`
- SUM with grouping → returns SQL with GROUP BY
- AVG → returns SQL with both SUM and COUNT (the special case)
- Query with valid filters → returns SQL with WHERE clause
- All 5 aggregate types work

**Should fail (invalid queries):**
- Unknown aggregate (e.g. "MEDIAN") → `{ valid: false, error: "..." }`
- Unknown column (e.g. "ssn") → invalid
- Unknown grouping column → invalid
- Filter on unknown column → invalid
- SQL injection attempt in column name (e.g. `"amount; DROP TABLE"`) → invalid (not in whitelist)

**Example test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateAndBuildQuery } from '../validator';

describe('validateAndBuildQuery', () => {
  it('builds valid COUNT query', () => {
    const result = validateAndBuildQuery({
      aggregate: 'COUNT',
      column: 'amount',
      submitter: 'analyst1',
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.sql).toContain('COUNT(amount)');
      expect(result.sql).toContain('FROM transactions');
    }
  });

  it('rejects unknown column', () => {
    const result = validateAndBuildQuery({
      aggregate: 'SUM',
      column: 'ssn',
      submitter: 'analyst1',
    });
    expect(result.valid).toBe(false);
  });

  // ... more tests
});
```

### 8.4 `packages/shared/src/__tests__/rewriter.test.ts`

Write tests for:

**Basic rewrites:**
- Replaces table name correctly
- Replaces column names correctly
- Returns correct reverse map

**Edge cases:**
- Column name that's a substring of another (e.g. if you had columns `amount` and `total_amount` in the same query — make sure `amount` doesn't corrupt `total_amount`)
- Schema map where some names are the same (e.g. org 2's `amount` → `amount`) — shouldn't break
- Multiple columns in one query (GROUP BY + aggregate column)

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { rewriteQuery } from '../rewriter';

describe('rewriteQuery', () => {
  const schemaMap = {
    tables: { transactions: 'sales' },
    columns: { amount: 'total_amount', category: 'product_type', region: 'region', tx_date: 'sale_date' }
  };

  it('rewrites table and column names', () => {
    const result = rewriteQuery('SELECT SUM(amount) FROM transactions', schemaMap);
    expect(result.sql).toBe('SELECT SUM(total_amount) FROM sales');
  });

  it('returns correct reverse map', () => {
    const result = rewriteQuery('SELECT SUM(amount) FROM transactions', schemaMap);
    expect(result.reverseMap['total_amount']).toBe('amount');
  });

  // ... more tests
});
```

### 8.5 Run tests

```bash
cd /path/to/securum
npm run test -w @securum/shared
```

All tests should pass.

---

## Verification

Run everything in order:

```bash
# 1. Build shared package
npm install && npm run build

# 2. Run unit tests
npm run test -w @securum/shared

# 3. Rebuild containers (destroy old volumes for new seed data)
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up --build

# 4. Verify seed data (in a new terminal)
# Org 1:
docker exec -it $(docker ps -qf name=postgres-org1) psql -U securum -d org1_db -c 'SELECT COUNT(*) FROM sales;'
# → 10000

# Org 2:
docker exec -it $(docker ps -qf name=postgres-org2) psql -U securum -d org2_db -c 'SELECT COUNT(*) FROM orders;'
# → 10000

# Org 3:
docker exec -it $(docker ps -qf name=postgres-org3) psql -U securum -d org3_db -c 'SELECT COUNT(*) FROM purchases;'
# → 10000

# 5. Verify coordinator still works
curl http://localhost:4000/health
# → {"status":"ok","db":"connected"}

# 6. Quick sanity check on actual data
docker exec -it $(docker ps -qf name=postgres-org1) psql -U securum -d org1_db -c 'SELECT region, COUNT(*), ROUND(AVG(total_amount),2) FROM sales GROUP BY region;'
# → Should show 4 regions, ~2500 rows each, average ~250
```

---

## Progress

- [ ] Add SchemaMap, ValidatorResult, RewriterResult to types.ts
- [ ] Add GLOBAL_SCHEMA to constants.ts
- [ ] Write validator.ts
- [ ] Write rewriter.ts
- [ ] Update index.ts exports
- [ ] Create 3 schema-map JSON configs
- [ ] Replace 3 seed SQL files with real data
- [ ] Set up vitest
- [ ] Write validator tests
- [ ] Write rewriter tests
- [ ] All tests pass
- [ ] Seed data verified in Docker

---

## Summary

| What | File | Type |
|------|------|------|
| 3 new types | `types.ts` | Write yourself |
| 1 new constant | `constants.ts` | Copy-paste |
| Query validator | `validator.ts` | Write yourself — core logic |
| Schema rewriter | `rewriter.ts` | Write yourself — core logic |
| Updated barrel | `index.ts` | One line change |
| 3 schema maps | `config/*.json` | Copy-paste |
| 3 seed files | `dev-seed/*.sql` | Copy-paste |
| Test setup | `package.json` | One line change |
| Validator tests | `__tests__/validator.test.ts` | Write yourself |
| Rewriter tests | `__tests__/rewriter.test.ts` | Write yourself |

**Real dev work:** validator.ts, rewriter.ts, and their tests. Everything else is config/data.
