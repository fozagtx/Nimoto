import { createDatabase, type Database } from '@/db';
import { defaultPrizeConfig, nimToLuna, type PrizeConfig } from '@/shared';
import type { Env } from './env.js';
import { RateLimiter } from './lib/rate-limit.js';
import { createTreasury, type Treasury } from './services/treasury.js';

export interface AppContext {
  env: Env;
  db: Database;
  prizeConfig: PrizeConfig;
  limits: {
    maxDailyPayoutLuna: bigint;
    maxSinglePayoutLuna: bigint;
  };
  treasury: Treasury;
  limiters: {
    auth: RateLimiter;
    answer: RateLimiter;
    general: RateLimiter;
  };
  close: () => Promise<void>;
}

export function createAppContext(env: Env): AppContext {
  const { db, close } = createDatabase({ url: env.DATABASE_URL, ssl: env.DATABASE_SSL });
  return {
    env,
    db,
    prizeConfig: defaultPrizeConfig(env),
    limits: {
      maxDailyPayoutLuna: nimToLuna(env.MAX_DAILY_PAYOUT_NIM),
      maxSinglePayoutLuna: nimToLuna(env.MAX_SINGLE_PAYOUT_NIM),
    },
    treasury: createTreasury(env),
    limiters: {
      auth: new RateLimiter(env.RATE_LIMIT_WINDOW_MS, 20),
      answer: new RateLimiter(env.RATE_LIMIT_WINDOW_MS, 60),
      general: new RateLimiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX),
    },
    close,
  };
}

export interface SessionUser {
  id: string;
  walletAddress: string;
  displayName: string | null;
  referralCode: string;
  isAdmin: boolean;
}

export interface AppBindings {
  Variables: {
    ctx: AppContext;
    user?: SessionUser;
  };
}
