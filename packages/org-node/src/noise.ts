import { addLaplaceNoise } from '@securum/shared';
import { LocalResult } from './types';
import { config } from './config';

export interface NoisyResult {
  type: LocalResult['type'];
  [key: string]: unknown;
}

export function applyNoise(result: LocalResult, epsilon: number): NoisyResult {
  const sensitivity = {
    count: 1,
    sum: config.sumSensitivity,
  };

  switch (result.type) {
    case 'scalar': {
      const noisyValue = addLaplaceNoise(result.value, sensitivity.sum, epsilon);
      return {
        type: 'scalar',
        value: ensureFinite(noisyValue),
      };
    }

    case 'avg': {
      const noisySum = addLaplaceNoise(result.sum, sensitivity.sum, epsilon);
      const noisyCount = addLaplaceNoise(result.count, sensitivity.count, epsilon);
      return {
        type: 'avg',
        sum: ensureFinite(noisySum),
        count: ensureFinite(Math.max(0, noisyCount)),
      };
    }

    case 'grouped': {
      const groups = result.groups.map((g) => ({
        groupKey: g.groupKey,
        value: ensureFinite(addLaplaceNoise(g.value, sensitivity.sum, epsilon)),
      }));
      return { type: 'grouped', groups };
    }

    case 'grouped_avg': {
      const groups = result.groups.map((g) => ({
        groupKey: g.groupKey,
        sum: ensureFinite(addLaplaceNoise(g.sum, sensitivity.sum, epsilon)),
        count: ensureFinite(Math.max(0, addLaplaceNoise(g.count, sensitivity.count, epsilon))),
      }));
      return { type: 'grouped_avg', groups };
    }

    default:
      throw new Error(`Unknown result type`);
  }
}

function ensureFinite(n: number): number {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return n;
}
