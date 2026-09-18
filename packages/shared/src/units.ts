/**
 * Integer-safe conversion between NIM and Luna.
 * 1 NIM = 100_000 Luna. Monetary values are always handled as bigint Luna.
 */
export const LUNA_PER_NIM = 100_000n;
export const NIM_DECIMALS = 5;

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

/**
 * Converts a decimal NIM amount (given as a string, integer number or bigint)
 * into Luna. Fractional input is parsed lexically — never through binary floats.
 */
export function nimToLuna(nim: string | number | bigint): bigint {
  if (typeof nim === 'bigint') return nim * LUNA_PER_NIM;
  if (typeof nim === 'number') {
    if (!Number.isInteger(nim)) {
      throw new InvalidAmountError(
        'Fractional NIM amounts must be passed as strings to avoid floating point errors',
      );
    }
    return BigInt(nim) * LUNA_PER_NIM;
  }

  const raw = nim.trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new InvalidAmountError(`Invalid NIM amount: ${nim}`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  if (fraction.length > NIM_DECIMALS) {
    throw new InvalidAmountError(`NIM amounts support at most ${NIM_DECIMALS} decimals: ${nim}`);
  }
  const paddedFraction = fraction.padEnd(NIM_DECIMALS, '0');
  const luna = BigInt(whole) * LUNA_PER_NIM + BigInt(paddedFraction === '' ? '0' : paddedFraction);
  return negative ? -luna : luna;
}

/** Formats Luna as a decimal NIM string, trimming trailing fractional zeros. */
export function lunaToNim(luna: bigint | number | string, opts?: { trim?: boolean }): string {
  const value = typeof luna === 'bigint' ? luna : BigInt(luna);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / LUNA_PER_NIM;
  const fraction = (abs % LUNA_PER_NIM).toString().padStart(NIM_DECIMALS, '0');
  const trim = opts?.trim ?? true;
  const fractionOut = trim ? fraction.replace(/0+$/, '') : fraction;
  const body = fractionOut.length > 0 ? `${whole}.${fractionOut}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/** Human display helper, e.g. `30 NIM`. */
export function formatNim(luna: bigint): string {
  return `${lunaToNim(luna)} NIM`;
}
