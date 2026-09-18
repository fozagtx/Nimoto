import { and, eq, inArray, sql } from 'drizzle-orm';
import { auditLogs, dailyChallenges, prizePayouts } from '@nimoto/db';
import {
  allocatePrizes,
  isValidAddress,
  lunaToNim,
  normalizeAddress,
  type ChallengeDate,
} from '@nimoto/shared';
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

export interface PayoutRunResult {
  processed: number;
  confirmed: number;
  failed: number;
}

/** Sends every pending payout; failures stay retryable and are never double-sent. */
export async function runPayouts(ctx: AppContext, actor: string, limit = 25): Promise<PayoutRunResult> {
  if (!ctx.treasury.enabled) {
    throw ApiError.badRequest('treasury_disabled', 'No treasury is configured, payouts cannot be sent');
  }

  const claimable = await ctx.db
    .select({ id: prizePayouts.id })
    .from(prizePayouts)
    .where(inArray(prizePayouts.status, ['pending', 'failed']))
    .limit(limit);
  if (claimable.length === 0) return { processed: 0, confirmed: 0, failed: 0 };

  const claimed = await ctx.db
    .update(prizePayouts)
    .set({
      status: 'processing',
      attemptCount: sql`${prizePayouts.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(
          prizePayouts.id,
          claimable.map((row) => row.id),
        ),
        inArray(prizePayouts.status, ['pending', 'failed']),
      ),
    )
    .returning();

  let confirmed = 0;
  let failed = 0;

  for (const payout of claimed) {
    const amountLuna = BigInt(payout.amountLuna);
    if (amountLuna > ctx.limits.maxSinglePayoutLuna || !isValidAddress(payout.recipientAddress)) {
      await ctx.db
        .update(prizePayouts)
        .set({ status: 'failed', error: 'failed payout safety check', updatedAt: new Date() })
        .where(eq(prizePayouts.id, payout.id));
      failed += 1;
      continue;
    }
    try {
      const { transactionHash } = await ctx.treasury.send({
        recipientAddress: payout.recipientAddress,
        amountLuna,
      });
      await ctx.db
        .update(prizePayouts)
        .set({ status: 'broadcast', transactionHash, error: null, updatedAt: new Date() })
        .where(eq(prizePayouts.id, payout.id));
      confirmed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown payout error';
      await ctx.db
        .update(prizePayouts)
        .set({ status: 'failed', error: message, updatedAt: new Date() })
        .where(eq(prizePayouts.id, payout.id));
      logger.error('payout failed', { payoutId: payout.id, message });
      failed += 1;
    }
  }

  await ctx.db.insert(auditLogs).values({
    actor,
    action: 'payouts.run',
    metadata: { processed: claimed.length, confirmed, failed },
  });

  return { processed: claimed.length, confirmed, failed };
}
