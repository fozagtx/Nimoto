import { toChallengeDate, isChallengeDate, type ChallengeDate } from '@/shared';
import { createAppContext } from '../context.js';
import { loadEnv } from '../env.js';
import { listWinners } from '../services/settlement.js';

/** Usage: pnpm winners [--date YYYY-MM-DD] [--csv] */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dateArg = args[args.indexOf('--date') + 1];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const date: ChallengeDate =
    args.includes('--date') && dateArg && isChallengeDate(dateArg) ? dateArg : toChallengeDate(yesterday);

  const ctx = createAppContext(loadEnv());
  try {
    const winners = await listWinners(ctx, date);
    if (args.includes('--csv')) {
      console.log('rank,address,nim,status,payoutId');
      for (const w of winners) {
        console.log([w.rank, w.recipientAddress, w.amountNim, w.status, w.payoutId].join(','));
      }
      return;
    }
    console.log(`Winners for ${date} (${winners.length}) — transfer these by hand, then mark them paid:`);
    for (const w of winners) {
      console.log(`  #${w.rank}  ${w.amountNim.padStart(6)} NIM  ${w.recipientAddress}  [${w.status}]`);
    }
  } finally {
    await ctx.close();
  }
}

main().catch((error: unknown) => {
  console.error('winners lookup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
