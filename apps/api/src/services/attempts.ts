import { and, asc, count, eq } from 'drizzle-orm';
import type { Database } from '@nimoto/db';
import { attemptAnswers, attempts } from '@nimoto/db';
import {
  ATTEMPT_EXPIRY_MS,
  SCORING,
  buildShareText,
  canStartRanked,
  isAttemptExpired,
  lunaToNim,
  prizeForRank,
  scoreAnswer,
  toChallengeDate,
  type AnswerResponse,
  type AttemptMode,
  type AttemptResultResponse,
  type AttemptStateResponse,
  type ChallengeDate,
  type OptionKey,
  type PrizeConfig,
  type QuestionView,
} from '@nimoto/shared';
import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  challengeQuestions,
  practiceQuestionAtPosition,
  questionAtPosition,
  type DailyChallengeRow,
  type QuestionRow,
} from './challenges.js';
import { rankOfAttempt } from './leaderboard.js';
import { currentVisibleStreak, recordRankedCompletion } from './streaks.js';
import { qualifyReferral } from './referrals.js';

export type AttemptRow = typeof attempts.$inferSelect;
export type AnswerRow = typeof attemptAnswers.$inferSelect;

const RANKED_START_MESSAGES: Record<string, { status: 400 | 409; message: string }> = {
  challenge_not_active: { status: 409, message: "Today's challenge is not open yet" },
  challenge_window_closed: { status: 409, message: "Today's challenge has ended" },
  already_played_today: { status: 409, message: 'You already used your ranked run today' },
};

export function toQuestionView(question: QuestionRow, position: number, serverTime: Date): QuestionView {
  return {
    questionId: question.id,
    position,
    prompt: question.prompt,
    options: [
      { key: 'a', text: question.optionA },
      { key: 'b', text: question.optionB },
      { key: 'c', text: question.optionC },
      { key: 'd', text: question.optionD },
    ],
    category: question.category,
    difficulty: question.difficulty,
    serverTime: serverTime.toISOString(),
  };
}

function questionForAttempt(
  db: Database,
  attempt: AttemptRow,
  position: number,
): Promise<QuestionRow | undefined> {
  return attempt.mode === 'practice'
    ? practiceQuestionAtPosition(db, attempt.id, attempt.dailyChallengeId, position)
    : questionAtPosition(db, attempt.dailyChallengeId, position);
}

export async function findActiveAttempt(
  db: Database,
  userId: string,
  challengeId: string,
  mode: AttemptMode,
): Promise<AttemptRow | undefined> {
  const rows = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.dailyChallengeId, challengeId),
        eq(attempts.mode, mode),
        eq(attempts.status, 'started'),
      ),
    )
    .orderBy(asc(attempts.startedAt))
    .limit(1);
  return rows[0];
}

export async function findRankedAttempt(
  db: Database,
  userId: string,
  challengeId: string,
): Promise<AttemptRow | undefined> {
  const rows = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.dailyChallengeId, challengeId),
        eq(attempts.mode, 'ranked'),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function answersFor(db: Database, attemptId: string): Promise<AnswerRow[]> {
  return db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attemptId))
    .orderBy(asc(attemptAnswers.position));
}

async function expireAttempt(db: Database, attempt: AttemptRow): Promise<AttemptRow> {
  const updated = await db
    .update(attempts)
    .set({ status: 'expired' })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.status, 'started')))
    .returning();
  return updated[0] ?? { ...attempt, status: 'expired' };
}

export interface StartAttemptResult {
  attempt: AttemptRow;
  resumed: boolean;
}

export async function startAttempt(
  db: Database,
  params: {
    userId: string;
    challenge: DailyChallengeRow;
    mode: AttemptMode;
    now?: Date;
  },
): Promise<StartAttemptResult> {
  const now = params.now ?? new Date();
  const { challenge, mode, userId } = params;

  // A refresh must land back on the same attempt rather than starting a new one.
  const active = await findActiveAttempt(db, userId, challenge.id, mode);
  if (active) {
    if (!isAttemptExpired(active.startedAt, now)) return { attempt: active, resumed: true };
    await expireAttempt(db, active);
  }

  if (mode === 'ranked') {
    const existingRanked = await findRankedAttempt(db, userId, challenge.id);
    const decision = canStartRanked(
      { status: challenge.status, startsAt: challenge.startsAt, endsAt: challenge.endsAt },
      now,
      existingRanked !== undefined,
    );
    if (!decision.ok) {
      const mapped = RANKED_START_MESSAGES[decision.reason] ?? {
        status: 409 as const,
        message: 'Ranked run unavailable',
      };
      throw new ApiError(mapped.status, decision.reason, mapped.message);
    }
  }

  try {
    const inserted = await db
      .insert(attempts)
      .values({
        userId,
        dailyChallengeId: challenge.id,
        mode,
        status: 'started',
        startedAt: now,
        questionServedAt: now,
      })
      .returning();
    const attempt = inserted[0];
    if (!attempt) throw ApiError.internal('attempt_create_failed', 'Could not start the run');
    return { attempt, resumed: false };
  } catch (error) {
    // The unique partial index is the real guard against a second ranked run.
    const existing = await findRankedAttempt(db, userId, challenge.id);
    if (mode === 'ranked' && existing) {
      throw new ApiError(409, 'already_played_today', 'You already used your ranked run today');
    }
    throw error;
  }
}

export async function attemptState(
  db: Database,
  params: {
    attempt: AttemptRow;
    challenge: DailyChallengeRow;
    prizeConfig: PrizeConfig;
    publicWebUrl: string;
    referralCode: string;
    now?: Date;
  },
): Promise<AttemptStateResponse> {
  const now = params.now ?? new Date();
  let attempt = params.attempt;
  const answers = await answersFor(db, attempt.id);

  if (attempt.status === 'started' && isAttemptExpired(attempt.startedAt, now)) {
    attempt = await expireAttempt(db, attempt);
  }

  let currentQuestion: QuestionView | null = null;
  if (attempt.status === 'started') {
    const nextPosition = answers.length + 1;
    const question = await questionForAttempt(db, attempt, nextPosition);
    if (question) {
      // Ranked keeps the original service time: restarting it would let a
      // reload buy back the speed bonus. Practice is free to restart.
      if (attempt.mode === 'practice') {
        await db.update(attempts).set({ questionServedAt: now }).where(eq(attempts.id, attempt.id));
        attempt = { ...attempt, questionServedAt: now };
      }
      currentQuestion = toQuestionView(question, nextPosition, attempt.questionServedAt);
    }
  }

  const result =
    attempt.status === 'completed'
      ? await buildResult(db, {
          attempt,
          challenge: params.challenge,
          prizeConfig: params.prizeConfig,
          publicWebUrl: params.publicWebUrl,
          referralCode: params.referralCode,
        })
      : null;

  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    status: attempt.status,
    challengeDate: params.challenge.challengeDate as ChallengeDate,
    questionCount: SCORING.QUESTIONS_PER_RUN,
    answeredCount: answers.length,
    expiresAt: new Date(attempt.startedAt.getTime() + ATTEMPT_EXPIRY_MS).toISOString(),
    currentQuestion,
    result,
  };
}

export async function buildResult(
  db: Database,
  params: {
    attempt: AttemptRow;
    challenge: DailyChallengeRow;
    prizeConfig: PrizeConfig;
    publicWebUrl: string;
    referralCode: string;
  },
): Promise<AttemptResultResponse> {
  const { attempt, challenge, prizeConfig } = params;
  const ranked = attempt.mode === 'ranked';

  const placement = ranked
    ? await rankOfAttempt(db, challenge.id, attempt.id)
    : { rank: null, playerCount: 0 };
  const streak = ranked
    ? await currentVisibleStreak(db, attempt.userId, challenge.challengeDate as ChallengeDate)
    : 0;

  const prizeLuna = placement.rank ? prizeForRank(prizeConfig, placement.rank) : 0n;
  const referralUrl = `${params.publicWebUrl.replace(/\/$/, '')}/?ref=${params.referralCode}`;
  const totalScore = attempt.totalScore ?? 0;
  const correctCount = attempt.correctCount ?? 0;

  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    totalScore,
    correctCount,
    questionCount: SCORING.QUESTIONS_PER_RUN,
    totalDurationMs: attempt.totalDurationMs ?? 0,
    rank: placement.rank,
    playersToday: placement.playerCount,
    currentStreak: streak,
    prizeNim: prizeLuna > 0n ? lunaToNim(prizeLuna) : null,
    nextChallengePoolNim: lunaToNim(
      prizeConfig.tiers.reduce(
        (total, tier) => total + BigInt(tier.amountLuna) * BigInt(tier.toRank - tier.fromRank + 1),
        0n,
      ),
    ),
    shareText: buildShareText({
      totalScore,
      correctCount,
      questionCount: SCORING.QUESTIONS_PER_RUN,
      rank: placement.rank,
      playersToday: placement.playerCount,
      referralUrl,
    }),
  };
}

export interface SubmitAnswerParams {
  attempt: AttemptRow;
  challenge: DailyChallengeRow;
  questionId: string;
  selectedOption: OptionKey;
  prizeConfig: PrizeConfig;
  publicWebUrl: string;
  referralCode: string;
  now?: Date;
}

export async function submitAnswer(db: Database, params: SubmitAnswerParams): Promise<AnswerResponse> {
  const now = params.now ?? new Date();
  const { challenge, selectedOption } = params;
  let attempt = params.attempt;

  if (attempt.status === 'completed') {
    throw ApiError.conflict('attempt_completed', 'This run is already finished');
  }
  if (attempt.status === 'expired' || isAttemptExpired(attempt.startedAt, now)) {
    if (attempt.status === 'started') attempt = await expireAttempt(db, attempt);
    throw ApiError.conflict('attempt_expired', 'This run expired, come back tomorrow for a fresh one');
  }

  const answers = await answersFor(db, attempt.id);
  const position = answers.length + 1;
  if (position > SCORING.QUESTIONS_PER_RUN) {
    throw ApiError.conflict('attempt_completed', 'This run is already finished');
  }

  const expected = await questionForAttempt(db, attempt, position);
  if (!expected) throw ApiError.internal('challenge_incomplete', 'The daily challenge is missing a question');
  if (expected.id !== params.questionId) {
    throw ApiError.conflict('unexpected_question', 'That is not the question you are on');
  }

  // Elapsed time is measured between two server clock readings only.
  const elapsedMs = Math.max(0, now.getTime() - attempt.questionServedAt.getTime());
  const isCorrect = expected.correctOption === selectedOption;
  const score = scoreAnswer(isCorrect, elapsedMs);
  const implausible = elapsedMs < SCORING.IMPLAUSIBLE_ANSWER_MS;

  try {
    await db.insert(attemptAnswers).values({
      attemptId: attempt.id,
      questionId: expected.id,
      position,
      selectedOption,
      isCorrect,
      elapsedMs,
      scoreAwarded: score.points,
    });
  } catch {
    throw ApiError.conflict('duplicate_answer', 'That question was already answered');
  }

  if (implausible) {
    await db.update(attempts).set({ flagged: true }).where(eq(attempts.id, attempt.id));
    logger.warn('implausibly fast answer', { attemptId: attempt.id, elapsedMs });
  }

  const isLast = position === SCORING.QUESTIONS_PER_RUN;
  let nextQuestion: QuestionView | null = null;
  let result: AttemptResultResponse | null = null;

  if (isLast) {
    const allAnswers = await answersFor(db, attempt.id);
    const totalScore = allAnswers.reduce((sum, answer) => sum + answer.scoreAwarded, 0);
    const correctCount = allAnswers.filter((answer) => answer.isCorrect).length;
    const totalDurationMs = allAnswers.reduce((sum, answer) => sum + answer.elapsedMs, 0);

    const completed = await db
      .update(attempts)
      .set({ status: 'completed', completedAt: now, totalScore, correctCount, totalDurationMs })
      .where(and(eq(attempts.id, attempt.id), eq(attempts.status, 'started')))
      .returning();
    attempt = completed[0] ?? { ...attempt, status: 'completed', completedAt: now, totalScore, correctCount, totalDurationMs };

    if (attempt.mode === 'ranked') {
      await recordRankedCompletion(db, attempt.userId, challenge.challengeDate as ChallengeDate);
      await qualifyReferral(db, attempt.userId, now);
    }

    result = await buildResult(db, {
      attempt,
      challenge,
      prizeConfig: params.prizeConfig,
      publicWebUrl: params.publicWebUrl,
      referralCode: params.referralCode,
    });
  } else {
    const upcoming = await questionForAttempt(db, attempt, position + 1);
    if (upcoming) {
      await db.update(attempts).set({ questionServedAt: now }).where(eq(attempts.id, attempt.id));
      nextQuestion = toQuestionView(upcoming, position + 1, now);
    }
  }

  return {
    isCorrect,
    correctOption: expected.correctOption,
    pointsEarned: score.points,
    timeBonus: score.timeBonus,
    elapsedMs,
    explanation: expected.explanation,
    nextQuestion,
    result,
  };
}

export async function playersToday(db: Database, challengeId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(attempts)
    .where(
      and(
        eq(attempts.dailyChallengeId, challengeId),
        eq(attempts.mode, 'ranked'),
        eq(attempts.status, 'completed'),
      ),
    );
  return rows[0]?.value ?? 0;
}

export function todayDate(now = new Date()): ChallengeDate {
  return toChallengeDate(now);
}

export async function allChallengeQuestionIds(db: Database, challengeId: string): Promise<string[]> {
  return (await challengeQuestions(db, challengeId)).map((question) => question.id);
}
