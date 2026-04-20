import { createHash } from 'crypto';

export function computeCommitment(value: string, nonce: string, queryId: string): string {
  return createHash('sha256').update(value + nonce + queryId).digest('hex');
}
  
export function addLaplaceNoise(trueValue: number, sensitivity: number, epsilon: number): number {
  if (!Number.isFinite(trueValue)) {
    throw new Error('trueValue must be finite');
  }
  if (!(sensitivity > 0)) {
    throw new Error('sensitivity must be > 0');
  }
  if (!(epsilon > 0)) {
    throw new Error('epsilon must be > 0');
  }

  let u = Math.random() - 0.5;
  while (u === 0) {
    u = Math.random() - 0.5;
  }

  const scale = sensitivity / epsilon;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));

  return trueValue + noise;
}