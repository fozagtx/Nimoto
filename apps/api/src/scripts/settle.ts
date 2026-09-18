import { isChallengeDate, toChallengeDate } from '@nimoto/shared';
import { createAppContext } from '../context.js';
import { loadEnv } from '../env.js';
import { planSettlement, settleChallenge } from '../services/settlement.js';

/**
 * Usage: pnpm settle -- 2026-01-31 [--dry-run]
 * Defaults to yesterday, the most recent fully closed UTC day.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateArg = args.find((arg) => !arg.startsWith('--'));
  const fallback = toChallengeDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const date = dateArg ?? fallback;

  if (!isChallengeDate(date)) {
    console.error(`Invalid date "${date}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }

  const ctx = createAppContext(loadEnv());
  try {
    if (dryRun) {
      const plan = await planSettlement(ctx, date);
      console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
      return;
    }
    const { plan, created } = await settleChallenge(ctx, date, 'cli');
    console.log(
      JSON.stringify(
        { date, created, finisherCount: plan.finisherCount, totalNim: plan.totalNim, lines: plan.lines },
        null,
        2,
      ),
    );
  } finally {
    await ctx.close();
  }
}

main().catch((error: unknown) => {
  console.error('settlement failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
