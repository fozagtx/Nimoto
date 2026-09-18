import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanish.default('false'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  /** Public base URL of the web app, used for referral links and share text. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  /** Shared secret for admin-only endpoints and the settlement CLI. */
  ADMIN_API_TOKEN: z.string().min(24, 'ADMIN_API_TOKEN must be at least 24 characters'),
  SESSION_COOKIE_NAME: z.string().default('nimoto_session'),
  /** Cookies are only usable when the API and web app share a site. */
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  DAILY_PRIZE_1: z.string().default('30'),
  DAILY_PRIZE_2: z.string().default('15'),
  DAILY_PRIZE_3: z.string().default('10'),
  DAILY_PRIZE_4_TO_10: z.string().default('5'),
  /** Hard ceiling on what a single settlement may pay out, in NIM. */
  MAX_DAILY_PAYOUT_NIM: z.string().default('200'),
  /** Hard ceiling on a single payout, in NIM. */
  MAX_SINGLE_PAYOUT_NIM: z.string().default('100'),
  /** Treasury is optional: without it the API runs in "no payout" mode. */
  TREASURY_PRIVATE_KEY: z.string().optional(),
  TREASURY_ADDRESS: z.string().optional(),
  NIMIQ_NETWORK: z.enum(['main-albatross', 'test-albatross']).default('test-albatross'),
  NIMIQ_RPC_URL: z.string().url().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return parsed.data;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
