import { describe, expect, it } from 'vitest';
import { prizeSharePercent, topPercent } from '@/shared/share.js';
import { nimToLuna } from '@/shared/units.js';

describe('share card stats', () => {
  it('rounds the percentile up so it never flatters the player', () => {
    expect(topPercent(1, 40)).toBe(3);
    expect(topPercent(4, 40)).toBe(10);
    expect(topPercent(40, 40)).toBe(100);
  });

  it('never claims better than the top 1%', () => {
    expect(topPercent(1, 100_000)).toBe(1);
  });

  it('rejects ranks that cannot exist', () => {
    expect(topPercent(0, 10)).toBeNull();
    expect(topPercent(11, 10)).toBeNull();
    expect(topPercent(1, 0)).toBeNull();
  });

  it('reports the slice of the day pool a prize represents', () => {
    expect(prizeSharePercent(nimToLuna('30'), nimToLuna('90'))).toBe(33.3);
    expect(prizeSharePercent(nimToLuna('45'), nimToLuna('90'))).toBe(50);
    expect(prizeSharePercent(0n, nimToLuna('90'))).toBeNull();
    expect(prizeSharePercent(nimToLuna('30'), 0n)).toBeNull();
  });
});
