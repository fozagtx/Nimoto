/**
 * Deterministic, server-authoritative scoring for Nimoto.
 * The rules here are the single source of truth and are surfaced verbatim in the UI.
 */
export const SCORING = {
  /** Points awarded for a correct answer, before the speed bonus. */
  BASE_POINTS: 1000,
  /** Maximum speed bonus per question (awarded at 0 ms). */
  MAX_TIME_BONUS: 500,
  /** The speed bonus decays linearly to zero over this window. */
  TIME_BONUS_WINDOW_MS: 15_000,
  /** Answers submitted faster than this are impossible for a human and get flagged. */
  IMPLAUSIBLE_ANSWER_MS: 350,
  /** Questions per ranked run. */
  QUESTIONS_PER_RUN: 5,
} as const;

export interface QuestionScore {
  isCorrect: boolean;
  elapsedMs: number;
  basePoints: number;
  timeBonus: number;
  points: number;
}

/**
 * Scores a single answer. Wrong answers score zero. Correct answers earn
 * BASE_POINTS plus a linearly decaying speed bonus over TIME_BONUS_WINDOW_MS.
 */
export function scoreAnswer(isCorrect: boolean, elapsedMs: number): QuestionScore {
  const elapsed = Math.max(0, Math.round(elapsedMs));
  if (!isCorrect) {
    return { isCorrect: false, elapsedMs: elapsed, basePoints: 0, timeBonus: 0, points: 0 };
  }
  const remaining = Math.max(0, SCORING.TIME_BONUS_WINDOW_MS - elapsed);
  const timeBonus = Math.round((remaining / SCORING.TIME_BONUS_WINDOW_MS) * SCORING.MAX_TIME_BONUS);
  return {
    isCorrect: true,
    elapsedMs: elapsed,
    basePoints: SCORING.BASE_POINTS,
    timeBonus,
    points: SCORING.BASE_POINTS + timeBonus,
  };
}

export interface AttemptTotals {
  totalScore: number;
  correctCount: number;
  totalDurationMs: number;
}

export function summarizeAttempt(answers: readonly QuestionScore[]): AttemptTotals {
  return answers.reduce<AttemptTotals>(
    (acc, answer) => ({
      totalScore: acc.totalScore + answer.points,
      correctCount: acc.correctCount + (answer.isCorrect ? 1 : 0),
      totalDurationMs: acc.totalDurationMs + answer.elapsedMs,
    }),
    { totalScore: 0, correctCount: 0, totalDurationMs: 0 },
  );
}

export const MAX_POSSIBLE_SCORE =
  SCORING.QUESTIONS_PER_RUN * (SCORING.BASE_POINTS + SCORING.MAX_TIME_BONUS);

/** Plain-language scoring rules rendered in the UI so ranking is never hidden. */
export const SCORING_RULES: readonly string[] = [
  `${SCORING.BASE_POINTS.toLocaleString('en-US')} points for every correct answer.`,
  `Up to ${SCORING.MAX_TIME_BONUS} bonus points per question, decreasing smoothly over ${
    SCORING.TIME_BONUS_WINDOW_MS / 1000
  } seconds.`,
  'Wrong answers score zero for that question.',
  'Ties are broken by the faster total time, then by the earlier finish.',
  'All timing is measured on the server, never in your browser.',
];
