export const CHALLENGE_STATUSES = ['draft', 'active', 'closed', 'settled'] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export const ATTEMPT_MODES = ['ranked', 'practice'] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

export const ATTEMPT_STATUSES = ['started', 'completed', 'expired'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const OPTIONS = ['a', 'b', 'c', 'd'] as const;
export type OptionKey = (typeof OPTIONS)[number];

/** A started ranked attempt may be resumed within this window before it expires. */
export const ATTEMPT_EXPIRY_MS = 30 * 60 * 1000;

export interface ChallengeWindow {
  status: ChallengeStatus;
  startsAt: Date;
  endsAt: Date;
}

export type RankedStartRejection =
  | 'challenge_not_active'
  | 'challenge_window_closed'
  | 'already_played_today';

/** Single source of truth for "can this wallet start a ranked run right now?". */
export function canStartRanked(
  window: ChallengeWindow,
  now: Date,
  hasRankedAttemptToday: boolean,
): { ok: true } | { ok: false; reason: RankedStartRejection } {
  if (window.status !== 'active') return { ok: false, reason: 'challenge_not_active' };
  if (now < window.startsAt || now > window.endsAt) {
    return { ok: false, reason: 'challenge_window_closed' };
  }
  if (hasRankedAttemptToday) return { ok: false, reason: 'already_played_today' };
  return { ok: true };
}

export function isAttemptExpired(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() > ATTEMPT_EXPIRY_MS;
}

/** Competition phase shown on the leaderboard. */
export function competitionPhase(status: ChallengeStatus): 'active' | 'pending_settlement' | 'settled' | 'pending' {
  switch (status) {
    case 'active':
      return 'active';
    case 'closed':
      return 'pending_settlement';
    case 'settled':
      return 'settled';
    case 'draft':
      return 'pending';
  }
}
