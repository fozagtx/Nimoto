import { z } from 'zod';
import { nimToLuna } from './units.js';

/**
 * Prize structures are data, never constants sprinkled through the codebase.
 * Each tier covers an inclusive rank range and pays the same amount per rank.
 */
export const prizeTierSchema = z
  .object({
    fromRank: z.number().int().min(1),
    toRank: z.number().int().min(1),
    amountLuna: z.string().regex(/^\d+$/, 'amountLuna must be an integer string of Luna'),
  })
  .refine((tier) => tier.toRank >= tier.fromRank, {
    message: 'toRank must be greater than or equal to fromRank',
  });

export const prizeConfigSchema = z
  .object({
    currency: z.literal('NIM').default('NIM'),
    tiers: z.array(prizeTierSchema).min(1),
  })
  .refine((config) => !hasOverlappingTiers(config.tiers), {
    message: 'Prize tiers must not overlap',
  });

export type PrizeTier = z.infer<typeof prizeTierSchema>;
export type PrizeConfig = z.infer<typeof prizeConfigSchema>;

function hasOverlappingTiers(tiers: readonly PrizeTier[]): boolean {
  const sorted = [...tiers].sort((a, b) => a.fromRank - b.fromRank);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    if (current.fromRank <= previous.toRank) return true;
  }
  return false;
}

export function prizeForRank(config: PrizeConfig, rank: number): bigint {
  const tier = config.tiers.find((candidate) => rank >= candidate.fromRank && rank <= candidate.toRank);
  return tier ? BigInt(tier.amountLuna) : 0n;
}

/** Total Luna the configuration pays out if every prize position is filled. */
export function maxPrizePoolLuna(config: PrizeConfig): bigint {
  return config.tiers.reduce(
    (total, tier) => total + BigInt(tier.amountLuna) * BigInt(tier.toRank - tier.fromRank + 1),
    0n,
  );
}

/** Total Luna actually owed for a given number of ranked finishers. */
export function payablePoolLuna(config: PrizeConfig, finisherCount: number): bigint {
  let total = 0n;
  for (const tier of config.tiers) {
    const to = Math.min(tier.toRank, finisherCount);
    if (to < tier.fromRank) continue;
    total += BigInt(tier.amountLuna) * BigInt(to - tier.fromRank + 1);
  }
  return total;
}

export interface PrizeAllocation {
  rank: number;
  amountLuna: bigint;
}

/**
 * Deterministic winner allocation: ranks are already totally ordered by
 * `compareAttempts`, so allocation is a pure function of the finisher count.
 */
export function allocatePrizes(config: PrizeConfig, finisherCount: number): PrizeAllocation[] {
  const allocations: PrizeAllocation[] = [];
  for (let rank = 1; rank <= finisherCount; rank += 1) {
    const amountLuna = prizeForRank(config, rank);
    if (amountLuna > 0n) allocations.push({ rank, amountLuna });
  }
  return allocations;
}

/** Ships as the default when no per-challenge configuration is supplied. */
export function defaultPrizeConfig(env: {
  DAILY_PRIZE_1?: string;
  DAILY_PRIZE_2?: string;
  DAILY_PRIZE_3?: string;
  DAILY_PRIZE_4_TO_10?: string;
}): PrizeConfig {
  return prizeConfigSchema.parse({
    currency: 'NIM',
    tiers: [
      { fromRank: 1, toRank: 1, amountLuna: nimToLuna(env.DAILY_PRIZE_1 ?? '30').toString() },
      { fromRank: 2, toRank: 2, amountLuna: nimToLuna(env.DAILY_PRIZE_2 ?? '15').toString() },
      { fromRank: 3, toRank: 3, amountLuna: nimToLuna(env.DAILY_PRIZE_3 ?? '10').toString() },
      { fromRank: 4, toRank: 10, amountLuna: nimToLuna(env.DAILY_PRIZE_4_TO_10 ?? '5').toString() },
    ],
  });
}
