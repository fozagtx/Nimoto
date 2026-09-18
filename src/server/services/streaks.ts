import { eq } from 'drizzle-orm';
import type { Database } from '@/db';
import { streaks } from '@/db';
import {
  EMPTY_STREAK,
  applyRankedCompletion,
  visibleStreak,
  type ChallengeDate,
  type StreakState,
} from '@/shared';

type Tx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export async function readStreak(db: Tx, userId: string): Promise<StreakState> {
  const rows = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return EMPTY_STREAK;
  return {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastCompletedDate: (row.lastCompletedDate as ChallengeDate | null) ?? null,
  };
}

export async function recordRankedCompletion(
  db: Tx,
  userId: string,
  date: ChallengeDate,
): Promise<StreakState> {
  const current = await readStreak(db, userId);
  const next = applyRankedCompletion(current, date);
  await db
    .insert(streaks)
    .values({
      userId,
      currentStreak: next.currentStreak,
      longestStreak: next.longestStreak,
      lastCompletedDate: next.lastCompletedDate,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: streaks.userId,
      set: {
        currentStreak: next.currentStreak,
        longestStreak: next.longestStreak,
        lastCompletedDate: next.lastCompletedDate,
        updatedAt: new Date(),
      },
    });
  return next;
}

export async function currentVisibleStreak(
  db: Tx,
  userId: string,
  today: ChallengeDate,
): Promise<number> {
  return visibleStreak(await readStreak(db, userId), today);
}
