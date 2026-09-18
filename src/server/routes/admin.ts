import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { dailyChallenges, prizePayouts } from '@/db';
import { isChallengeDate, toChallengeDate, type ChallengeDate } from '@/shared';
import type { AppBindings } from '../context.js';
import { ApiError } from '../lib/errors.js';
import { requireAdmin } from '../middleware.js';
import { ensureDailyChallenge } from '../services/challenges.js';
import { planSettlement, runPayouts, settleChallenge } from '../services/settlement.js';

function parseDate(value: string | undefined): ChallengeDate {
  if (!value || !isChallengeDate(value)) {
    throw ApiError.badRequest('invalid_date', 'Provide a UTC date as YYYY-MM-DD');
  }
  return value;
}

export function adminRoutes() {
  const app = new Hono<AppBindings>();
  app.use('*', requireAdmin);

  app.post('/challenges', async (c) => {
    const ctx = c.get('ctx');
    const body = (await c.req.json().catch(() => ({}))) as { date?: string };
    const date = body.date ? parseDate(body.date) : toChallengeDate(new Date());
    const challenge = await ensureDailyChallenge(ctx.db, date, ctx.prizeConfig);
    return c.json({ challenge });
  });

  app.get('/settlements/:date/preview', async (c) => {
    const plan = await planSettlement(c.get('ctx'), parseDate(c.req.param('date')));
    return c.json({ plan });
  });

  app.post('/settlements/:date', async (c) => {
    const ctx = c.get('ctx');
    const date = parseDate(c.req.param('date'));
    const dryRun = c.req.query('dryRun') === 'true';
    if (dryRun) return c.json({ dryRun: true, plan: await planSettlement(ctx, date) });
    const { plan, created } = await settleChallenge(ctx, date, 'admin-api');
    return c.json({ dryRun: false, created, plan });
  });

  app.post('/payouts/run', async (c) => {
    return c.json(await runPayouts(c.get('ctx'), 'admin-api'));
  });

  app.get('/payouts', async (c) => {
    const ctx = c.get('ctx');
    const rows = await ctx.db
      .select()
      .from(prizePayouts)
      .orderBy(desc(prizePayouts.createdAt))
      .limit(200);
    return c.json({ payouts: rows });
  });

  app.get('/challenges/:date', async (c) => {
    const ctx = c.get('ctx');
    const date = parseDate(c.req.param('date'));
    const [challenge] = await ctx.db
      .select()
      .from(dailyChallenges)
      .where(eq(dailyChallenges.challengeDate, date))
      .limit(1);
    if (!challenge) throw ApiError.notFound('challenge_not_found', `No challenge for ${date}`);
    return c.json({ challenge });
  });

  return app;
}
