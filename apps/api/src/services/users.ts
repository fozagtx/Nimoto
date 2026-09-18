import { eq } from 'drizzle-orm';
import type { Database } from '@nimoto/db';
import { users } from '@nimoto/db';
import { normalizeAddress } from '@nimoto/shared';
import { randomReferralCode } from '../lib/ids.js';
import { ApiError } from '../lib/errors.js';

export type UserRow = typeof users.$inferSelect;

export async function findUserByAddress(db: Database, address: string): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, normalizeAddress(address)))
    .limit(1);
  return rows[0];
}

export async function findUserByReferralCode(db: Database, code: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
  return rows[0];
}

/** Creates the user on first successful wallet verification, retrying referral-code collisions. */
export async function findOrCreateUser(db: Database, address: string): Promise<UserRow> {
  const walletAddress = normalizeAddress(address);
  const existing = await findUserByAddress(db, walletAddress);
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const inserted = await db
        .insert(users)
        .values({ walletAddress, referralCode: randomReferralCode() })
        .onConflictDoNothing({ target: users.walletAddress })
        .returning();
      const created = inserted[0];
      if (created) return created;
      const raced = await findUserByAddress(db, walletAddress);
      if (raced) return raced;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw ApiError.internal('user_create_failed', 'Could not allocate a referral code');
}
