import { describe, expect, it, vi } from 'vitest';
import { addLaplaceNoise, computeCommitment } from '../privacy';

describe('computeCommitment', () => {
  it('is deterministic for same inputs', () => {
    const a = computeCommitment('{"x":1}', 'nonce-1', 'query-1');
    const b = computeCommitment('{"x":1}', 'nonce-1', 'query-1');

    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when nonce changes', () => {
    const a = computeCommitment('{"x":1}', 'nonce-1', 'query-1');
    const b = computeCommitment('{"x":1}', 'nonce-2', 'query-1');

    expect(a).not.toBe(b);
  });

  it('changes when queryId changes', () => {
    const a = computeCommitment('{"x":1}', 'nonce-1', 'query-1');
    const b = computeCommitment('{"x":1}', 'nonce-1', 'query-2');

    expect(a).not.toBe(b);
  });
});

describe('addLaplaceNoise', () => {
  it('returns finite numbers', () => {
    const v = addLaplaceNoise(100, 1, 0.5);
    expect(Number.isFinite(v)).toBe(true);
  });

  it('retries when sampled u is 0', () => {
    const spy = vi.spyOn(Math, 'random');
    spy.mockReturnValueOnce(0.5).mockReturnValueOnce(0.75);

    const v = addLaplaceNoise(10, 1, 1);
    expect(Number.isFinite(v)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });

  it('throws for invalid trueValue', () => {
    expect(() => addLaplaceNoise(Number.NaN, 1, 1)).toThrow('trueValue must be finite');
  });

  it('throws for invalid sensitivity', () => {
    expect(() => addLaplaceNoise(1, 0, 1)).toThrow('sensitivity must be > 0');
    expect(() => addLaplaceNoise(1, -1, 1)).toThrow('sensitivity must be > 0');
  });

  it('throws for invalid epsilon', () => {
    expect(() => addLaplaceNoise(1, 1, 0)).toThrow('epsilon must be > 0');
    expect(() => addLaplaceNoise(1, 1, -1)).toThrow('epsilon must be > 0');
  });
});