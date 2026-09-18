export interface RankableAttempt {
  attemptId: string;
  totalScore: number;
  totalDurationMs: number;
  completedAt: Date | string;
}

export interface RankedAttempt<T extends RankableAttempt> {
  rank: number;
  entry: T;
}

function completedAtMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Canonical leaderboard ordering: score desc, then total duration asc,
 * then the earlier completion, then attempt id for a total order.
 */
export function compareAttempts(a: RankableAttempt, b: RankableAttempt): number {
  if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
  if (a.totalDurationMs !== b.totalDurationMs) return a.totalDurationMs - b.totalDurationMs;
  const byTime = completedAtMs(a.completedAt) - completedAtMs(b.completedAt);
  if (byTime !== 0) return byTime;
  return a.attemptId < b.attemptId ? -1 : a.attemptId > b.attemptId ? 1 : 0;
}

/** Ranks attempts 1..n with no shared ranks — the tiebreakers form a total order. */
export function rankAttempts<T extends RankableAttempt>(attempts: readonly T[]): RankedAttempt<T>[] {
  return [...attempts].sort(compareAttempts).map((entry, index) => ({ rank: index + 1, entry }));
}
