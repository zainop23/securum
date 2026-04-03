/**
 * Global aggregation over verified noisy results from org-nodes.
 *
 * Each org contributes one NoisyResult. This module merges them into
 * a single global result (sum values for COUNT/SUM, weighted merge for AVG,
 * group-key union for GROUP BY variants).
 */

// The coordinator doesn't import from org-node directly — define the
// result shapes locally. These match the JSON payloads returned by org-nodes.
export type NoisyResult =
  | { type: 'scalar'; value: number }
  | { type: 'avg'; sum: number; count: number }
  | { type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }
  | { type: 'grouped_avg'; groups: Array<{ groupKey: string; sum: number; count: number }> };

/**
 * Merge multiple org results into a single global result.
 *
 * For scalar (COUNT/SUM): sum all `value` fields.
 * For avg: sum all `sum` and `count` fields, then divide (clamping count ≥ 1).
 * For grouped: merge by groupKey, sum values.
 * For grouped_avg: merge by groupKey, sum sum/count, then divide per group.
 */
export function aggregateResults(results: NoisyResult[]): NoisyResult {
  if (results.length === 0) {
    throw new Error('Cannot aggregate zero results');
  }

  const firstType = results[0].type;

  // Sanity: all results should have the same type
  for (const r of results) {
    if (r.type !== firstType) {
      throw new Error(`Mismatched result types: expected "${firstType}", got "${r.type}"`);
    }
  }

  switch (firstType) {
    case 'scalar':
      return aggregateScalar(results as Array<{ type: 'scalar'; value: number }>);

    case 'avg':
      return aggregateAvg(results as Array<{ type: 'avg'; sum: number; count: number }>);

    case 'grouped':
      return aggregateGrouped(
        results as Array<{ type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }>
      );

    case 'grouped_avg':
      return aggregateGroupedAvg(
        results as Array<{
          type: 'grouped_avg';
          groups: Array<{ groupKey: string; sum: number; count: number }>;
        }>
      );

    default:
      throw new Error(`Unknown result type: "${firstType}"`);
  }
}

// ---------------------------------------------------------------------------
// Scalar (COUNT / SUM): just sum all values
// ---------------------------------------------------------------------------
function aggregateScalar(results: Array<{ type: 'scalar'; value: number }>): NoisyResult {
  const total = results.reduce((sum, r) => sum + r.value, 0);
  return { type: 'scalar', value: total };
}

// ---------------------------------------------------------------------------
// AVG: sum the sums, sum the counts, divide.
// Clamp count ≥ 1 to avoid division-by-zero from DP noise.
// The final result is returned as 'scalar' since the avg is now computed.
// ---------------------------------------------------------------------------
function aggregateAvg(results: Array<{ type: 'avg'; sum: number; count: number }>): NoisyResult {
  const totalSum = results.reduce((acc, r) => acc + r.sum, 0);
  const totalCount = results.reduce((acc, r) => acc + r.count, 0);
  return {
    type: 'scalar',
    value: totalSum / Math.max(totalCount, 1),
  };
}

// ---------------------------------------------------------------------------
// GROUP BY (COUNT / SUM): merge groups by key, sum values per key
// ---------------------------------------------------------------------------
function aggregateGrouped(
  results: Array<{ type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }>
): NoisyResult {
  const merged = new Map<string, number>();

  for (const r of results) {
    for (const { groupKey, value } of r.groups) {
      merged.set(groupKey, (merged.get(groupKey) ?? 0) + value);
    }
  }

  return {
    type: 'grouped',
    groups: Array.from(merged.entries()).map(([groupKey, value]) => ({ groupKey, value })),
  };
}

// ---------------------------------------------------------------------------
// GROUP BY AVG: merge sum/count per key, then divide per group.
// Clamp count ≥ 1 per group for the same DP-noise reason.
// Returns 'grouped' (with computed averages), not 'grouped_avg'.
// ---------------------------------------------------------------------------
function aggregateGroupedAvg(
  results: Array<{
    type: 'grouped_avg';
    groups: Array<{ groupKey: string; sum: number; count: number }>;
  }>
): NoisyResult {
  const mergedSum = new Map<string, number>();
  const mergedCount = new Map<string, number>();

  for (const r of results) {
    for (const { groupKey, sum, count } of r.groups) {
      mergedSum.set(groupKey, (mergedSum.get(groupKey) ?? 0) + sum);
      mergedCount.set(groupKey, (mergedCount.get(groupKey) ?? 0) + count);
    }
  }

  return {
    type: 'grouped',
    groups: Array.from(mergedSum.entries()).map(([groupKey, totalSum]) => ({
      groupKey,
      value: totalSum / Math.max(mergedCount.get(groupKey)!, 1),
    })),
  };
}
