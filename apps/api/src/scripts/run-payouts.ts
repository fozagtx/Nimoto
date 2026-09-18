import { createAppContext } from '../context.js';
import { loadEnv } from '../env.js';
import { runPayouts } from '../services/settlement.js';

/** Usage: pnpm payouts:run [--limit 25] */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1] ?? '25', 10) : 25;

  const ctx = createAppContext(loadEnv());
  try {
    const result = await runPayouts(ctx, 'cli', Number.isFinite(limit) ? limit : 25);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await ctx.close();
  }
}

main().catch((error: unknown) => {
  console.error('payout run failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
