import { describe, expect, it } from 'vitest';
import { InvalidAmountError, LUNA_PER_NIM, formatNim, lunaToNim, nimToLuna } from '@/shared/units.js';

describe('nimToLuna', () => {
  it('converts integers', () => {
    expect(nimToLuna(1)).toBe(100_000n);
    expect(nimToLuna(30)).toBe(3_000_000n);
    expect(nimToLuna(0)).toBe(0n);
  });

  it('converts decimal strings without float error', () => {
    expect(nimToLuna('0.1')).toBe(10_000n);
    expect(nimToLuna('0.00001')).toBe(1n);
    expect(nimToLuna('1.23456')).toBe(123_456n);
    expect(nimToLuna('0.07')).toBe(7_000n);
  });

  it('handles negatives and bigints', () => {
    expect(nimToLuna('-2.5')).toBe(-250_000n);
    expect(nimToLuna(5n)).toBe(500_000n);
  });

  it('rejects fractional numbers and over-precise strings', () => {
    expect(() => nimToLuna(0.1)).toThrow(InvalidAmountError);
    expect(() => nimToLuna('1.234567')).toThrow(InvalidAmountError);
    expect(() => nimToLuna('abc')).toThrow(InvalidAmountError);
  });
});

describe('lunaToNim', () => {
  it('round-trips', () => {
    for (const value of ['0', '1', '30', '0.00001', '12.34567', '999999.99999']) {
      expect(lunaToNim(nimToLuna(value))).toBe(value === '0' ? '0' : value);
    }
  });

  it('trims trailing zeros and formats', () => {
    expect(lunaToNim(3_000_000n)).toBe('30');
    expect(lunaToNim(10_000n)).toBe('0.1');
    expect(lunaToNim(1n, { trim: false })).toBe('0.00001');
    expect(formatNim(LUNA_PER_NIM * 15n)).toBe('15 NIM');
    expect(lunaToNim(-250_000n)).toBe('-2.5');
  });
});
