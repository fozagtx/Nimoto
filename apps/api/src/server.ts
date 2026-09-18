import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { createApp } from './app.js';
import { createAppContext } from './context.js';
import { loadEnv } from './env.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const ctx = createAppContext(env);

  // Fail fast instead of serving traffic against an unmigrated database.
  const [{ count } = { count: 0 }] = await ctx.db.execute<{ count: number }>(
    sql`select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = 'daily_challenges'`,
  );
  if (count === 0) {
    throw new Error('Database schema is missing. Run "pnpm db:migrate" before starting the API.');
  }

  const server = serve({ fetch: createApp(ctx).fetch, port: env.PORT }, (info) => {
    logger.info('api listening', { port: info.port, env: env.NODE_ENV });
  });

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    server.close(() => {
      void ctx.close().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error('api failed to start', { error });
  process.exit(1);
});
