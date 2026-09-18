import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '@nimoto/db';
import { attempts, users } from '@nimoto/db';
import {
  abbreviateAddress,
  lunaToNim,
  prizeForRank,
  type LeaderboardEntry,
  type PrizeConfig,
} from '@nimoto/shared';

export const LEADERBOARD_LIMIT = 100;

interface RawRow {
  attemptId: string;
  userId: string;
  walletAddress: string;
  displayName: string | null;
  totalScore: number | null;
  totalDurationMs: number | null;
  completedAt: Date | null;
}

/**
 * Ordering happens in SQL with the same key the shared comparator uses, so the
 * database can serve it straight from the leaderboard index.
 */
async function rankedRows(db: Database, challengeId: string): Promise<RawRow[]> {
  return db
    .select({
      attemptId: attempts.id,
      userId: attempts.userId,
      walletAddress: users.walletAddress,
      displayName: users.displayName,
      totalScore: attempts.totalScore,
      totalDurationMs: attempts.totalDurationMs,
      completedAt: attempts.completedAt,
    })
    .from(attempts)
    .innerJoin(users, eq(users.id, attempts.userId))
    .where(
      and(
        eq(attempts.dailyChallengeId, challengeId),
        eq(attempts.mode, 'ranked'),
        eq(attempts.status, 'completed'),
        isNotNull(attempts.completedAt),
      ),
    )
    .orderBy(
      desc(attempts.totalScore),
      asc(attempts.totalDurationMs),
      asc(attempts.completedAt),
      asc(attempts.id),
    );
}

function toEntry(row: RawRow, rank: number, prizeConfig: PrizeConfig, viewerId?: string): LeaderboardEntry {
  const prizeLuna = prizeForRank(prizeConfig, rank);
  return {
    rank,
    userId: row.userId,
    displayName: row.displayName,
    walletAddressAbbreviated: abbreviateAddress(row.walletAddress),
    totalScore: row.totalScore ?? 0,
    totalDurationMs: row.totalDurationMs ?? 0,
    completedAt: (row.completedAt ?? new Date(0)).toISOString(),
    prizeNim: prizeLuna > 0n ? lunaToNim(prizeLuna) : null,
    isMe: viewerId !== undefined && row.userId === viewerId,
  };
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  playerCount: number;
}

export async function loadLeaderboard(
  db: Database,
  challengeId: string,
  prizeConfig: PrizeConfig,
  viewerId?: string,
): Promise<LeaderboardResult> {
  const rows = await rankedRows(db, challengeId);
  const entries = rows
    .slice(0, LEADERBOARD_LIMIT)
    .map((row, index) => toEntry(row, index + 1, prizeConfig, viewerId));

  let me: LeaderboardEntry | null = null;
  if (viewerId) {
    const viewerIndex = rows.findIndex((row) => row.userId === viewerId);
    if (viewerIndex >= 0) me = toEntry(rows[viewerIndex]!, viewerIndex + 1, prizeConfig, viewerId);
  }

  return { entries, me, playerCount: rows.length };
}

export async function rankOfAttempt(
  db: Database,
  challengeId: string,
  attemptId: string,
): Promise<{ rank: number | null; playerCount: number }> {
  const rows = await rankedRows(db, challengeId);
  const index = rows.findIndex((row) => row.attemptId === attemptId);
  return { rank: index >= 0 ? index + 1 : null, playerCount: rows.length };
}

/** Ranked finishers ordered for settlement; identical ordering to the leaderboard. */
export async function settlementOrder(db: Database, challengeId: string): Promise<RawRow[]> {
  return rankedRows(db, challengeId);
}
