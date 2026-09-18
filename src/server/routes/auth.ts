import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { eq } from 'drizzle-orm';
import { streaks, users } from '@/db';
import {
  authChallengeRequestSchema,
  authVerifyRequestSchema,
  type AuthChallengeResponse,
  type AuthVerifyResponse,
} from '@/shared';
import type { AppBindings } from '../context.js';
import { rateLimit } from '../lib/rate-limit.js';
import { attachUser, bearerToken, requireUser } from '../middleware.js';
import { issueChallenge, revokeSession, verifyChallenge } from '../services/auth.js';
import { attachReferral } from '../services/referrals.js';
import { logger } from '../lib/logger.js';

export function authRoutes(limiterScope = 'auth') {
  const app = new Hono<AppBindings>();

  app.post(
    '/challenge',
    async (c, next) => rateLimit(c.get('ctx').limiters.auth, limiterScope)(c, next),
    async (c) => {
      const ctx = c.get('ctx');
      const body = authChallengeRequestSchema.parse(await c.req.json());
      const challenge = await issueChallenge(ctx.db, body.address);
      return c.json<AuthChallengeResponse>(challenge);
    },
  );

  app.post(
    '/verify',
    async (c, next) => rateLimit(c.get('ctx').limiters.auth, `${limiterScope}-verify`)(c, next),
    async (c) => {
      const ctx = c.get('ctx');
      const body = authVerifyRequestSchema.parse(await c.req.json());
      const session = await verifyChallenge(ctx.db, body);

      if (body.referralCode) {
        const outcome = await attachReferral(ctx.db, session.user.id, body.referralCode);
        if (!outcome.ok) logger.info('referral not attached', { reason: outcome.reason });
      }

      const secure = ctx.env.NODE_ENV === 'production';
      setCookie(c, ctx.env.SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        secure,
        sameSite: secure ? 'None' : 'Lax',
        path: '/',
        expires: session.expiresAt,
        ...(ctx.env.SESSION_COOKIE_DOMAIN ? { domain: ctx.env.SESSION_COOKIE_DOMAIN } : {}),
      });

      const [profile] = await ctx.db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
      const [streak] = await ctx.db.select().from(streaks).where(eq(streaks.userId, session.user.id)).limit(1);

      return c.json<AuthVerifyResponse>({
        // The token is also returned for webviews that cannot use cookies.
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        user: {
          id: session.user.id,
          walletAddress: session.user.walletAddress,
          displayName: session.user.displayName,
          referralCode: session.user.referralCode,
          xp: profile?.xp ?? 0,
          currentStreak: streak?.currentStreak ?? 0,
          longestStreak: streak?.longestStreak ?? 0,
        },
      });
    },
  );

  app.post('/logout', attachUser, requireUser, async (c) => {
    const ctx = c.get('ctx');
    const token = bearerToken(c.req.header('authorization')) ?? getCookie(c, ctx.env.SESSION_COOKIE_NAME);
    if (token) await revokeSession(ctx.db, token);
    deleteCookie(c, ctx.env.SESSION_COOKIE_NAME, { path: '/' });
    return c.json({ ok: true });
  });

  return app;
}
