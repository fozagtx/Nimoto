import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@nimoto/shared';
import { corsOrigins } from './env.js';
import type { AppBindings, AppContext } from './context.js';
import { ApiError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { rateLimit } from './lib/rate-limit.js';
import { attachUser, securityHeaders } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import { profileRoutes } from './routes/profile.js';
import { sponsorRoutes } from './routes/sponsor.js';
import { adminRoutes } from './routes/admin.js';

export function createApp(ctx: AppContext) {
  const app = new Hono<AppBindings>();
  const allowedOrigins = corsOrigins(ctx.env);

  app.use('*', async (c, next) => {
    c.set('ctx', ctx);
    await next();
  });
  app.use('*', securityHeaders);
  app.use(
    '*',
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? ''),
      credentials: true,
      allowHeaders: ['content-type', 'authorization', 'x-admin-token'],
      allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    }),
  );
  app.use('/api/*', async (c, next) => rateLimit(ctx.limiters.general, 'general')(c, next));
  app.use('/api/*', attachUser);

  app.get('/health', async (c) => {
    try {
      await ctx.db.execute(sql`select 1`);
    } catch (error) {
      logger.error('health check failed', { error });
      return c.json({ status: 'degraded', database: 'unreachable' }, 503);
    }
    return c.json({
      status: 'ok',
      serverTime: new Date().toISOString(),
      treasury: ctx.treasury.enabled ? 'configured' : 'disabled',
    });
  });

  app.route('/api/auth', authRoutes());
  app.route('/api', gameRoutes());
  app.route('/api', profileRoutes());
  app.route('/api', sponsorRoutes());
  app.route('/api/admin', adminRoutes());

  app.notFound((c) => c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'Unknown endpoint' } }, 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json<ApiErrorBody>(
        { error: { code: error.code, message: error.message, details: error.details } },
        error.status,
      );
    }
    if (error instanceof ZodError) {
      return c.json<ApiErrorBody>(
        { error: { code: 'invalid_request', message: 'Request failed validation', details: error.issues } },
        400,
      );
    }
    logger.error('unhandled error', { error, path: c.req.path });
    return c.json<ApiErrorBody>({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
  });

  return app;
}
