import { asc, eq } from 'drizzle-orm';
import { auditLogs, dailyChallenges, prizePayouts } from '@/db';
import {
  allocatePrizes,
  isValidAddress,
  lunaToNim,
  normalizeAddress,
  type ChallengeDate,
} from '@/shared';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { AppContext } from '../context.js';
import { parsePrizeConfig } from './challenges.js';
import { settlementOrder } from './leaderboard.js';

export interface SettlementLine {
  rank: number;
  userId: string;
  attemptId: string;
  recipientAddress: string;
  amountLuna: string;
  amountNim: string;
}

export interface SettlementPlan {
  challengeDate: ChallengeDate;
  challengeId: string;
  finisherCount: number;
  lines: SettlementLine[];
  totalLuna: string;
  totalNim: string;
  alreadySettled: boolean;
}

export async function planSettlement(ctx: AppContext, date: ChallengeDate): Promise<SettlementPlan> {
  const rows = await ctx.db
    .select()
    .from(dailyChallenges)
    .where(eq(dailyChallenges.challengeDate, date))
    .limit(1);
  const challenge = rows[0];
  if (!challenge) throw ApiError.notFound('challenge_not_found', `No challenge exists for ${date}`);

  const prizeConfig = parsePrizeConfig(challenge.prizeConfig);
  const finishers = await settlementOrder(ctx.db, challenge.id);
  const allocations = allocatePrizes(prizeConfig, finishers.length);

  const lines: SettlementLine[] = allocations.map((allocation) => {
    const finisher = finishers[allocation.rank - 1]!;
    return {
      rank: allocation.rank,
      userId: finisher.userId,
      attemptId: finisher.attemptId,
      recipientAddress: normalizeAddress(finisher.walletAddress),
      amountLuna: allocation.amountLuna.toString(),
      amountNim: lunaToNim(allocation.amountLuna),
    };
  });

  const totalLuna = lines.reduce((sum, line) => sum + BigInt(line.amountLuna), 0n);
  if (totalLuna > ctx.limits.maxDailyPayoutLuna) {
    throw ApiError.badRequest(
      'daily_payout_cap_exceeded',
      `Settlement of ${lunaToNim(totalLuna)} NIM exceeds the configured daily cap`,
    );
  }
  for (const line of lines) {
    if (BigInt(line.amountLuna) > ctx.limits.maxSinglePayoutLuna) {
      throw ApiError.badRequest('single_payout_cap_exceeded', `Payout for rank ${line.rank} exceeds the cap`);
    }
    if (!isValidAddress(line.recipientAddress)) {
      throw ApiError.badRequest('invalid_recipient', `Rank ${line.rank} has an unusable payout address`);
    }
  }

  return {
    challengeDate: date,
    challengeId: challenge.id,
    finisherCount: finishers.length,
    lines,
    totalLuna: totalLuna.toString(),
    totalNim: lunaToNim(totalLuna),
    alreadySettled: challenge.status === 'settled',
  };
}

/**
 * Writes the payout rows and marks the challenge settled. Re-running is a
 * no-op because the payout table is unique per challenge+rank and per
 * challenge+user.
 */
export async function settleChallenge(
  ctx: AppContext,
  date: ChallengeDate,
  actor: string,
): Promise<{ plan: SettlementPlan; created: number }> {
  const plan = await planSettlement(ctx, date);

  const created = await ctx.db.transaction(async (tx) => {
    if (plan.lines.length > 0) {
      const inserted = await tx
        .insert(prizePayouts)
        .values(
          plan.lines.map((line) => ({
            challengeId: plan.challengeId,
            userId: line.userId,
            attemptId: line.attemptId,
            recipientAddress: line.recipientAddress,
            rank: line.rank,
            amountLuna: line.amountLuna,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: prizePayouts.id });
      await tx
        .update(dailyChallenges)
        .set({ status: 'settled', settledAt: new Date() })
        .where(eq(dailyChallenges.id, plan.challengeId));
      return inserted.length;
    }
    await tx
      .update(dailyChallenges)
      .set({ status: 'settled', settledAt: new Date() })
      .where(eq(dailyChallenges.id, plan.challengeId));
    return 0;
  });

  await ctx.db.insert(auditLogs).values({
    actor,
    action: 'settlement.run',
    subject: date,
    metadata: { created, totalNim: plan.totalNim, finisherCount: plan.finisherCount },
  });
  logger.info('settlement complete', { date, created, totalNim: plan.totalNim });

  return { plan, created };
}

export interface WinnerRow extends SettlementLine {
  payoutId: string;
  status: string;
  transactionHash: string | null;
}

/** The list you work through by hand: who is owed what for a settled day. */
export async function listWinners(ctx: AppContext, date: ChallengeDate): Promise<WinnerRow[]> {
  const rows = await ctx.db
    .select({ payout: prizePayouts })
    .from(prizePayouts)
    .innerJoin(dailyChallenges, eq(prizePayouts.challengeId, dailyChallenges.id))
    .where(eq(dailyChallenges.challengeDate, date))
    .orderBy(asc(prizePayouts.rank));

  return rows.map(({ payout }) => ({
    rank: payout.rank,
    userId: payout.userId,
    attemptId: payout.attemptId,
    payoutId: payout.id,
    recipientAddress: payout.recipientAddress,
    amountLuna: payout.amountLuna,
    amountNim: lunaToNim(BigInt(payout.amountLuna)),
    status: payout.status,
    transactionHash: payout.transactionHash,
  }));
}

/** Records a prize that was transferred by hand from the prize pool wallet. */
export async function markPayoutPaid(
  ctx: AppContext,
  payoutId: string,
  actor: string,
  transactionHash?: string,
): Promise<{ payoutId: string; status: 'confirmed' }> {
  const [updated] = await ctx.db
    .update(prizePayouts)
    .set({ status: 'confirmed', transactionHash: transactionHash ?? null, error: null, updatedAt: new Date() })
    .where(eq(prizePayouts.id, payoutId))
    .returning({ id: prizePayouts.id });
  if (!updated) throw ApiError.notFound('payout_not_found', `No payout with id ${payoutId}`);

  await ctx.db.insert(auditLogs).values({
    actor,
    action: 'payout.marked_paid',
    subject: payoutId,
    metadata: { transactionHash: transactionHash ?? null },
  });
  logger.info('payout marked paid', { payoutId, transactionHash });

  return { payoutId, status: 'confirmed' };
}
