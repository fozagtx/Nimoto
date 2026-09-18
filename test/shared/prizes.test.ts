import { describe, expect, it } from 'vitest';
import {
  allocatePrizes,
  defaultPrizeConfig,
  maxPrizePoolLuna,
  payablePoolLuna,
  prizeConfigSchema,
  prizeForRank,
} from '@/shared/prizes.js';
import { lunaToNim } from '@/shared/units.js';

const config = defaultPrizeConfig({});

describe('prize configuration', () => {
  it('builds the documented default structure', () => {
    expect(lunaToNim(prizeForRank(config, 1))).toBe('30');
    expect(lunaToNim(prizeForRank(config, 2))).toBe('15');
    expect(lunaToNim(prizeForRank(config, 3))).toBe('10');
    expect(lunaToNim(prizeForRank(config, 7))).toBe('5');
    expect(prizeForRank(config, 11)).toBe(0n);
  });

  it('reads amounts from configuration instead of hardcoding', () => {
    const custom = defaultPrizeConfig({ DAILY_PRIZE_1: '100.5', DAILY_PRIZE_4_TO_10: '2' });
    expect(lunaToNim(prizeForRank(custom, 1))).toBe('100.5');
    expect(lunaToNim(prizeForRank(custom, 10))).toBe('2');
  });

  it('rejects overlapping tiers', () => {
    expect(() =>
      prizeConfigSchema.parse({
        currency: 'NIM',
        tiers: [
          { fromRank: 1, toRank: 5, amountLuna: '1' },
          { fromRank: 3, toRank: 8, amountLuna: '1' },
        ],
      }),
    ).toThrow();
  });

  it('rejects inverted ranges and non-integer amounts', () => {
    expect(() =>
      prizeConfigSchema.parse({ currency: 'NIM', tiers: [{ fromRank: 5, toRank: 1, amountLuna: '1' }] }),
    ).toThrow();
    expect(() =>
      prizeConfigSchema.parse({ currency: 'NIM', tiers: [{ fromRank: 1, toRank: 1, amountLuna: '1.5' }] }),
    ).toThrow();
  });
});

describe('prize allocation', () => {
  it('pays the full pool when every position is filled', () => {
    expect(lunaToNim(maxPrizePoolLuna(config))).toBe('90');
    const allocations = allocatePrizes(config, 25);
    expect(allocations).toHaveLength(10);
    expect(allocations.reduce((sum, a) => sum + a.amountLuna, 0n)).toBe(maxPrizePoolLuna(config));
  });

  it('only pays positions that were actually filled', () => {
    const allocations = allocatePrizes(config, 5);
    expect(allocations.map((a) => a.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(allocations.reduce((sum, a) => sum + a.amountLuna, 0n)).toBe(payablePoolLuna(config, 5));
    expect(lunaToNim(payablePoolLuna(config, 5))).toBe('65');
  });

  it('pays nothing when nobody finishes', () => {
    expect(allocatePrizes(config, 0)).toEqual([]);
    expect(payablePoolLuna(config, 0)).toBe(0n);
  });

  it('is deterministic', () => {
    expect(allocatePrizes(config, 12)).toEqual(allocatePrizes(config, 12));
  });
});
