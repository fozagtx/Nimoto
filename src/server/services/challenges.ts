import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { dailyChallengeQuestions, dailyChallenges, questions } from '@/db';
import {
  SCORING,
  challengeDateEnd,
  challengeDateStart,
  prizeConfigSchema,
  type ChallengeDate,
  type PrizeConfig,
} from '@/shared';
import { ApiError } from '../lib/errors.js';

export type DailyChallengeRow = typeof dailyChallenges.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;

export function parsePrizeConfig(value: unknown): PrizeConfig {
  return prizeConfigSchema.parse(value);
}

export async function findChallengeByDate(
  db: Database,
  date: ChallengeDate,
): Promise<DailyChallengeRow | undefined> {
  const rows = await db.select().from(dailyChallenges).where(eq(dailyChallenges.challengeDate, date)).limit(1);
  return rows[0];
}

/**
 * Creates the day's challenge if it does not exist yet. Question selection is a
 * deterministic function of the date, so the same day always yields the same
 * five questions even if creation is retried or races.
 */
export async function ensureDailyChallenge(
  db: Database,
  date: ChallengeDate,
  prizeConfig: PrizeConfig,
): Promise<DailyChallengeRow> {
  const existing = await findChallengeByDate(db, date);
  if (existing) return existing;

  const picked = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.active, true))
    .orderBy(sql`md5(${questions.id}::text || ${date})`)
    .limit(SCORING.QUESTIONS_PER_RUN);

  if (picked.length < SCORING.QUESTIONS_PER_RUN) {
    throw ApiError.internal(
      'question_bank_too_small',
      `Need at least ${SCORING.QUESTIONS_PER_RUN} active questions to open a challenge`,
    );
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(dailyChallenges)
      .values({
        challengeDate: date,
        status: 'active',
        startsAt: challengeDateStart(date),
        endsAt: challengeDateEnd(date),
        prizeConfig,
      })
      .onConflictDoNothing({ target: dailyChallenges.challengeDate })
      .returning();

    const challenge = inserted[0];
    if (!challenge) {
      const raced = await tx
        .select()
        .from(dailyChallenges)
        .where(eq(dailyChallenges.challengeDate, date))
        .limit(1);
      const row = raced[0];
      if (!row) throw ApiError.internal('challenge_create_failed', 'Could not create the daily challenge');
      return row;
    }

    await tx.insert(dailyChallengeQuestions).values(
      picked.map((question, index) => ({
        dailyChallengeId: challenge.id,
        questionId: question.id,
        position: index + 1,
      })),
    );

    return challenge;
  });
}

export async function challengeQuestions(db: Database, challengeId: string): Promise<QuestionRow[]> {
  const rows = await db
    .select({ question: questions })
    .from(dailyChallengeQuestions)
    .innerJoin(questions, eq(questions.id, dailyChallengeQuestions.questionId))
    .where(eq(dailyChallengeQuestions.dailyChallengeId, challengeId))
    .orderBy(asc(dailyChallengeQuestions.position));
  return rows.map((row) => row.question);
}

/**
 * Practice draws from the rest of the bank so training never previews the
 * ranked questions. The order is a deterministic function of the attempt, so a
 * resumed practice run keeps serving the same questions.
 */
export async function practiceQuestionAtPosition(
  db: Database,
  attemptId: string,
  challengeId: string,
  position: number,
): Promise<QuestionRow | undefined> {
  const reserved = db
    .select({ id: dailyChallengeQuestions.questionId })
    .from(dailyChallengeQuestions)
    .where(eq(dailyChallengeQuestions.dailyChallengeId, challengeId));

  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.active, true), notInArray(questions.id, reserved)))
    .orderBy(sql`md5(${questions.id}::text || ${attemptId})`)
    .limit(SCORING.QUESTIONS_PER_RUN);

  return rows[position - 1];
}

export async function questionAtPosition(
  db: Database,
  challengeId: string,
  position: number,
): Promise<QuestionRow | undefined> {
  const rows = await db
    .select({ question: questions })
    .from(dailyChallengeQuestions)
    .innerJoin(questions, eq(questions.id, dailyChallengeQuestions.questionId))
    .where(
      and(
        eq(dailyChallengeQuestions.dailyChallengeId, challengeId),
        eq(dailyChallengeQuestions.position, position),
      ),
    )
    .limit(1);
  return rows[0]?.question;
}
