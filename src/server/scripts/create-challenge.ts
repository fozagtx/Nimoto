import { addDays, isChallengeDate, toChallengeDate, type ChallengeDate } from '@/shared';
import { createAppContext } from '../context.js';
import { loadEnv } from '../env.js';
import { ensureDailyChallenge } from '../services/challenges.js';

/**
 * Usage: pnpm challenge:create -- [YYYY-MM-DD] [--days 7]
 * Pre-creates challenges so a scheduler never races the first player of the day.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const daysIndex = args.indexOf('--days');
  const days = daysIndex >= 0 ? Number.parseInt(args[daysIndex + 1] ?? '1', 10) : 1;
  const startArg = args.find((arg) => !arg.startsWith('--') && isChallengeDate(arg));
  const start: ChallengeDate = startArg ?? toChallengeDate(new Date());

  const ctx = createAppContext(loadEnv());
  try {
    for (let offset = 0; offset < Math.max(1, days); offset += 1) {
      const date = addDays(start, offset);
      const challenge = await ensureDailyChallenge(ctx.db, date, ctx.prizeConfig);
      console.log(`${date}: ${challenge.id} (${challenge.status})`);
    }
  } finally {
    await ctx.close();
  }
}

main().catch((error: unknown) => {
  console.error('challenge creation failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
