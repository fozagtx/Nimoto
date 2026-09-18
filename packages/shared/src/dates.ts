/** All competition days are UTC days, keyed as `YYYY-MM-DD`. */
export type ChallengeDate = string;

export const CHALLENGE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isChallengeDate(value: string): value is ChallengeDate {
  if (!CHALLENGE_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toChallengeDate(parsed) === value;
}

export function toChallengeDate(date: Date): ChallengeDate {
  return date.toISOString().slice(0, 10);
}

export function challengeDateStart(date: ChallengeDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function challengeDateEnd(date: ChallengeDate): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

export function addDays(date: ChallengeDate, days: number): ChallengeDate {
  const start = challengeDateStart(date);
  start.setUTCDate(start.getUTCDate() + days);
  return toChallengeDate(start);
}

/** Whole-day difference `later - earlier` in UTC days. */
export function diffDays(earlier: ChallengeDate, later: ChallengeDate): number {
  const ms = challengeDateStart(later).getTime() - challengeDateStart(earlier).getTime();
  return Math.round(ms / 86_400_000);
}

export function msUntilEndOfDay(now: Date): number {
  const end = challengeDateEnd(toChallengeDate(now)).getTime() + 1;
  return Math.max(0, end - now.getTime());
}
