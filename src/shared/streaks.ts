import { diffDays, type ChallengeDate } from './dates.js';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: ChallengeDate | null;
}

export const EMPTY_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
};

/**
 * Applies a completed ranked attempt to a streak state.
 *
 * - The first completion starts a streak of 1.
 * - Completing the next UTC day's ranked challenge increments the streak.
 * - Missing one or more whole UTC days restarts the streak at 1.
 * - Repeat completions of the same day are idempotent.
 * - Practice attempts never reach this function.
 */
export function applyRankedCompletion(state: StreakState, completedDate: ChallengeDate): StreakState {
  if (state.lastCompletedDate === null) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, state.longestStreak),
      lastCompletedDate: completedDate,
    };
  }

  const gap = diffDays(state.lastCompletedDate, completedDate);
  if (gap <= 0) return state; // same day or an out-of-order backfill: no change

  const currentStreak = gap === 1 ? state.currentStreak + 1 : 1;
  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, state.longestStreak),
    lastCompletedDate: completedDate,
  };
}

/**
 * The streak as displayed on `today`: a stored streak decays to 0 once a whole
 * UTC day has been missed, even before the user plays again.
 */
export function visibleStreak(state: StreakState, today: ChallengeDate): number {
  if (!state.lastCompletedDate) return 0;
  const gap = diffDays(state.lastCompletedDate, today);
  if (gap <= 1) return state.currentStreak;
  return 0;
}
