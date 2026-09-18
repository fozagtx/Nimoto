import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { attempts, referrals, users } from '@/db';
import { evaluateReferral, normalizeReferralCode } from '@/shared';
import { logger } from '../lib/logger.js';
import { findUserByReferralCode } from './users.js';

/** XP granted to a referrer once their invitee finishes a first ranked run. */
export const REFERRAL_XP = 100;

type Tx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export async function hasCompletedRanked(db: Tx, userId: string): Promise<boolean> {
  const rows = await db
    .select({ value: count() })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.mode, 'ranked'), eq(attempts.status, 'completed')));
  return (rows[0]?.value ?? 0) > 0;
}

/**
 * Records the intent to credit a referrer. The link only becomes qualified
 * after the invited wallet completes its first ranked run.
 */
export async function attachReferral(
  db: Database,
  referredUserId: string,
  rawCode: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const code = normalizeReferralCode(rawCode);
  const referrer = await findUserByReferralCode(db, code);
  if (!referrer) return { ok: false, reason: 'referral_code_unknown' };

  const existing = await db
    .select({ id: referrals.id })
    .from(referrals)
    .where(eq(referrals.referredUserId, referredUserId))
    .limit(1);

  const decision = evaluateReferral({
    referrerUserId: referrer.id,
    referredUserId,
    referredAlreadyHasReferrer: existing.length > 0,
    referredHasCompletedRankedBefore: await hasCompletedRanked(db, referredUserId),
  });
  if (!decision.ok) return { ok: false, reason: decision.reason };

  await db
    .insert(referrals)
    .values({ referrerUserId: referrer.id, referredUserId })
    .onConflictDoNothing({ target: referrals.referredUserId });
  await db
    .update(users)
    .set({ referredByUserId: referrer.id })
    .where(and(eq(users.id, referredUserId), isNull(users.referredByUserId)));

  return { ok: true };
}

/** Called once the referred wallet completes a ranked run; safe to call repeatedly. */
export async function qualifyReferral(db: Tx, referredUserId: string, now = new Date()): Promise<void> {
  const qualified = await db
    .update(referrals)
    .set({ qualifiedAt: now })
    .where(and(eq(referrals.referredUserId, referredUserId), isNull(referrals.qualifiedAt)))
    .returning({ referrerUserId: referrals.referrerUserId });

  const referrerUserId = qualified[0]?.referrerUserId;
  if (!referrerUserId) return;

  await db
    .update(users)
    .set({ xp: sql`${users.xp} + ${REFERRAL_XP}` })
    .where(eq(users.id, referrerUserId));
  logger.info('referral qualified', { referrerUserId, referredUserId });
}

export interface ReferralCounts {
  qualifiedCount: number;
  pendingCount: number;
}

export async function referralCounts(db: Database, referrerUserId: string): Promise<ReferralCounts> {
  const qualified = await db
    .select({ value: count() })
    .from(referrals)
    .where(and(eq(referrals.referrerUserId, referrerUserId), isNotNull(referrals.qualifiedAt)));
  const pending = await db
    .select({ value: count() })
    .from(referrals)
    .where(and(eq(referrals.referrerUserId, referrerUserId), isNull(referrals.qualifiedAt)));
  return {
    qualifiedCount: qualified[0]?.value ?? 0,
    pendingCount: pending[0]?.value ?? 0,
  };
}
