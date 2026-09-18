import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { attempts as attemptsTable } from '@nimoto/db';
import {
  SCORING,
  answerRequestSchema,
  competitionPhase,
  lunaToNim,
  maxPrizePoolLuna,
  msUntilEndOfDay,
  startAttemptRequestSchema,
  toChallengeDate,
  type AttemptStateResponse,
  type LeaderboardResponse,
  type PrizeTierView,
  type TodayChallengeResponse,
} from '@nimoto/shared';
import type { AppBindings, AppContext, SessionUser } from '../context.js';
import { ApiError } from '../lib/errors.js';
import { rateLimit } from '../lib/rate-limit.js';
import { requireUser } from '../middleware.js';
import { ensureDailyChallenge, parsePrizeConfig, type DailyChallengeRow } from '../services/challenges.js';
import {
  answersFor,
  attemptState,
  findRankedAttempt,
  playersToday,
  startAttempt,
  submitAnswer,
} from '../services/attempts.js';
import { loadLeaderboard } from '../services/leaderboard.js';
import { currentVisibleStreak } from '../services/streaks.js';

function prizeTierViews(challenge: DailyChallengeRow): PrizeTierView[] {
  return parsePrizeConfig(challenge.prizeConfig).tiers.map((tier) => ({
    fromRank: tier.fromRank,
    toRank: tier.toRank,
    amountNim: lunaToNim(BigInt(tier.amountLuna)),
  }));
}

async function todaysChallenge(ctx: AppContext, now: Date): Promise<DailyChallengeRow> {
  return ensureDailyChallenge(ctx.db, toChallengeDate(now), ctx.prizeConfig);
}

const SCORING_RULES = [
  `${SCORING.QUESTIONS_PER_RUN} questions, one ranked run per day`,
  `${SCORING.BASE_POINTS} points per correct answer`,
  `Up to ${SCORING.MAX_TIME_BONUS} bonus points, fading over ${SCORING.TIME_BONUS_WINDOW_MS / 1000}s`,
  'Ties broken by fastest total time',
];

async function loadAttemptForUser(ctx: AppContext, attemptId: string, user: SessionUser) {
  const rows = await ctx.db.select().from(attemptsTable).where(eq(attemptsTable.id, attemptId)).limit(1);
  const attempt = rows[0];
  if (!attempt) throw ApiError.notFound('attempt_not_found', 'That run does not exist');
  if (attempt.userId !== user.id) throw ApiError.forbidden('attempt_not_yours', 'That run belongs to another player');
  return attempt;
}

export function gameRoutes() {
  const app = new Hono<AppBindings>();

  app.get('/challenge/today', async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user');
    const now = new Date();
    const challenge = await todaysChallenge(ctx, now);
    const prizeConfig = parsePrizeConfig(challenge.prizeConfig);

    let me: TodayChallengeResponse['me'] = null;
    if (user) {
      const ranked = await findRankedAttempt(ctx.db, user.id, challenge.id);
      const answered = ranked ? (await answersFor(ctx.db, ranked.id)).length : 0;
      const leaderboard = ranked?.status === 'completed'
        ? await loadLeaderboard(ctx.db, challenge.id, prizeConfig, user.id)
        : null;
      me = {
        rankedAttempt: ranked
          ? {
              attemptId: ranked.id,
              status: ranked.status,
              answeredCount: answered,
              totalScore: ranked.totalScore,
              rank: leaderboard?.me?.rank ?? null,
            }
          : null,
        currentStreak: await currentVisibleStreak(ctx.db, user.id, toChallengeDate(now)),
      };
    }

    return c.json<TodayChallengeResponse>({
      challengeDate: challenge.challengeDate,
      status: challenge.status,
      phase: competitionPhase(challenge.status),
      startsAt: challenge.startsAt.toISOString(),
      endsAt: challenge.endsAt.toISOString(),
      serverTime: now.toISOString(),
      msRemaining: msUntilEndOfDay(now),
      questionCount: SCORING.QUESTIONS_PER_RUN,
      prizePoolNim: lunaToNim(maxPrizePoolLuna(prizeConfig)),
      prizeTiers: prizeTierViews(challenge),
      playersToday: await playersToday(ctx.db, challenge.id),
      scoringRules: SCORING_RULES,
      me,
    });
  });

  app.get('/leaderboard/today', async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user');
    const now = new Date();
    const challenge = await todaysChallenge(ctx, now);
    const prizeConfig = parsePrizeConfig(challenge.prizeConfig);
    const board = await loadLeaderboard(ctx.db, challenge.id, prizeConfig, user?.id);

    return c.json<LeaderboardResponse>({
      challengeDate: challenge.challengeDate,
      status: challenge.status,
      phase: competitionPhase(challenge.status),
      msRemaining: msUntilEndOfDay(now),
      serverTime: now.toISOString(),
      prizePoolNim: lunaToNim(maxPrizePoolLuna(prizeConfig)),
      prizeTiers: prizeTierViews(challenge),
      playersToday: board.playerCount,
      entries: board.entries,
      me: board.me,
    });
  });

  app.post('/attempts', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const now = new Date();
    const body = startAttemptRequestSchema.parse(await c.req.json().catch(() => ({ mode: 'ranked' })));
    const challenge = await todaysChallenge(ctx, now);

    const { attempt } = await startAttempt(ctx.db, {
      userId: user.id,
      challenge,
      mode: body.mode,
      now,
    });

    return c.json<AttemptStateResponse>(
      await attemptState(ctx.db, {
        attempt,
        challenge,
        prizeConfig: parsePrizeConfig(challenge.prizeConfig),
        publicWebUrl: ctx.env.PUBLIC_WEB_URL,
        referralCode: user.referralCode,
        now,
      }),
    );
  });

  app.get('/attempts/:attemptId', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const now = new Date();
    const attempt = await loadAttemptForUser(ctx, c.req.param('attemptId'), user);
    const challenge = await todaysChallenge(ctx, now);
    if (attempt.dailyChallengeId !== challenge.id) {
      throw ApiError.conflict('attempt_from_another_day', 'That run belongs to a past challenge');
    }

    return c.json<AttemptStateResponse>(
      await attemptState(ctx.db, {
        attempt,
        challenge,
        prizeConfig: parsePrizeConfig(challenge.prizeConfig),
        publicWebUrl: ctx.env.PUBLIC_WEB_URL,
        referralCode: user.referralCode,
        now,
      }),
    );
  });

  app.post(
    '/attempts/:attemptId/answer',
    requireUser,
    async (c, next) => rateLimit(c.get('ctx').limiters.answer, 'answer')(c, next),
    async (c) => {
      const ctx = c.get('ctx');
      const user = c.get('user')!;
      const now = new Date();
      const body = answerRequestSchema.parse(await c.req.json());
      const attempt = await loadAttemptForUser(ctx, c.req.param('attemptId'), user);
      const challenge = await todaysChallenge(ctx, now);
      if (attempt.dailyChallengeId !== challenge.id) {
        throw ApiError.conflict('attempt_from_another_day', 'That run belongs to a past challenge');
      }

      return c.json(
        await submitAnswer(ctx.db, {
          attempt,
          challenge,
          questionId: body.questionId,
          selectedOption: body.selectedOption,
          prizeConfig: parsePrizeConfig(challenge.prizeConfig),
          publicWebUrl: ctx.env.PUBLIC_WEB_URL,
          referralCode: user.referralCode,
          now,
        }),
      );
    },
  );

  return app;
}
