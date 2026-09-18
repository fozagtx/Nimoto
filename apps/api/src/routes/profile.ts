import { Hono } from 'hono';
import { and, asc, count, eq } from 'drizzle-orm';
import { analyticsEvents, attempts, dailyChallenges, streaks, users } from '@nimoto/db';
import {
  analyticsEventSchema,
  toChallengeDate,
  updateProfileRequestSchema,
  type MeResponse,
  type ReferralSummaryResponse,
} from '@nimoto/shared';
import type { AppBindings } from '../context.js';
import { requireUser } from '../middleware.js';
import { readStreak } from '../services/streaks.js';
import { referralCounts } from '../services/referrals.js';
import { loadLeaderboard } from '../services/leaderboard.js';
import { parsePrizeConfig } from '../services/challenges.js';

export function profileRoutes() {
  const app = new Hono<AppBindings>();

  app.get('/me', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const [profile] = await ctx.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const streak = await readStreak(ctx.db, user.id);
    const [{ value: totalRankedAttempts } = { value: 0 }] = await ctx.db
      .select({ value: count() })
      .from(attempts)
      .where(and(eq(attempts.userId, user.id), eq(attempts.mode, 'ranked'), eq(attempts.status, 'completed')));

    return c.json<MeResponse>({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        displayName: profile?.displayName ?? null,
        referralCode: user.referralCode,
        xp: profile?.xp ?? 0,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
      },
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastCompletedDate: streak.lastCompletedDate,
      totalRankedAttempts,
      bestRank: null,
    });
  });

  app.patch('/me', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const body = updateProfileRequestSchema.parse(await c.req.json());
    await ctx.db.update(users).set({ displayName: body.displayName }).where(eq(users.id, user.id));
    await ctx.db
      .update(streaks)
      .set({ updatedAt: new Date() })
      .where(eq(streaks.userId, user.id));
    return c.json({ ok: true, displayName: body.displayName });
  });

  app.get('/me/history', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const rows = await ctx.db
      .select({
        challengeDate: dailyChallenges.challengeDate,
        totalScore: attempts.totalScore,
        correctCount: attempts.correctCount,
        totalDurationMs: attempts.totalDurationMs,
        completedAt: attempts.completedAt,
      })
      .from(attempts)
      .innerJoin(dailyChallenges, eq(dailyChallenges.id, attempts.dailyChallengeId))
      .where(and(eq(attempts.userId, user.id), eq(attempts.mode, 'ranked'), eq(attempts.status, 'completed')))
      .orderBy(asc(dailyChallenges.challengeDate))
      .limit(60);
    return c.json({ history: rows });
  });

  app.get('/referrals/me', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const counts = await referralCounts(ctx.db, user.id);
    const [profile] = await ctx.db.select({ xp: users.xp }).from(users).where(eq(users.id, user.id)).limit(1);

    return c.json<ReferralSummaryResponse>({
      code: user.referralCode,
      link: `${ctx.env.PUBLIC_WEB_URL.replace(/\/$/, '')}/?ref=${user.referralCode}`,
      qualifiedCount: counts.qualifiedCount,
      pendingCount: counts.pendingCount,
      xp: profile?.xp ?? 0,
    });
  });

  app.get('/me/rank', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const today = toChallengeDate(new Date());
    const [challenge] = await ctx.db
      .select()
      .from(dailyChallenges)
      .where(eq(dailyChallenges.challengeDate, today))
      .limit(1);
    if (!challenge) return c.json({ rank: null, playersToday: 0 });
    const board = await loadLeaderboard(ctx.db, challenge.id, parsePrizeConfig(challenge.prizeConfig), user.id);
    return c.json({ rank: board.me?.rank ?? null, playersToday: board.playerCount });
  });

  // Analytics is intentionally coarse: a named event, optional flat properties
  // and an optional user. No fingerprinting, no IP storage.
  app.post('/analytics/events', async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user');
    const body = analyticsEventSchema.parse(await c.req.json());
    await ctx.db.insert(analyticsEvents).values({
      userId: user?.id ?? null,
      event: body.event,
      properties: body.properties ?? null,
    });
    return c.json({ ok: true }, 202);
  });

  return app;
}
