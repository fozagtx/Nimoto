import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count } from 'drizzle-orm';
import { prizePayouts } from '@/db';
import { toChallengeDate } from '@/shared';
import {
  TEST_ADMIN_TOKEN,
  createHarness,
  createWallet,
  playRankedRun,
  resetDatabase,
  signIn,
  type TestHarness,
} from './helpers.js';

let harness: TestHarness;
const adminHeaders = { 'content-type': 'application/json', authorization: `Bearer ${TEST_ADMIN_TOKEN}` };

beforeAll(async () => {
  harness = await createHarness();
});
beforeEach(() => resetDatabase(harness.ctx));
afterAll(() => harness.close());

async function payoutCount(): Promise<number> {
  const rows = await harness.ctx.db.select({ value: count() }).from(prizePayouts);
  return rows[0]?.value ?? 0;
}

describe('settlement and admin access', () => {
  it('rejects admin endpoints without the admin token', async () => {
    const player = await signIn(harness, createWallet(31));
    const today = toChallengeDate(new Date());

    const anonymous = await harness.request(`/api/admin/settlements/${today}`, { method: 'POST' });
    expect(anonymous.status).toBe(401);

    // A valid wallet session is not admin authorization.
    const asPlayer = await harness.request(`/api/admin/settlements/${today}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${player.token}` },
    });
    expect(asPlayer.status).toBe(401);
  });

  it('allocates prizes deterministically and never settles twice', async () => {
    const today = toChallengeDate(new Date());
    const first = await signIn(harness, createWallet(32));
    const second = await signIn(harness, createWallet(33));
    await playRankedRun(harness, first);
    await playRankedRun(harness, second, { correct: false });

    const dryRun = await harness.request(`/api/admin/settlements/${today}?dryRun=true`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const dryBody = (await dryRun.json()) as any;
    expect(dryBody.dryRun).toBe(true);
    expect(dryBody.plan.lines).toHaveLength(2);
    expect(dryBody.plan.lines[0].amountNim).toBe('30');
    expect(dryBody.plan.lines[1].amountNim).toBe('15');
    expect(await payoutCount()).toBe(0);

    const settled = await harness.request(`/api/admin/settlements/${today}`, {
      method: 'POST',
      headers: adminHeaders,
    });
    expect(((await settled.json()) as any).created).toBe(2);
    expect(await payoutCount()).toBe(2);

    const again = await harness.request(`/api/admin/settlements/${today}`, {
      method: 'POST',
      headers: adminHeaders,
    });
    expect(((await again.json()) as any).created).toBe(0);
    expect(await payoutCount()).toBe(2);
  });

  it('lists winners and records prizes paid by hand', async () => {
    const today = toChallengeDate(new Date());
    const winner = await signIn(harness, createWallet(34));
    await playRankedRun(harness, winner);
    await harness.request(`/api/admin/settlements/${today}`, { method: 'POST', headers: adminHeaders });

    const listed = await harness.request(`/api/admin/settlements/${today}/winners`, { headers: adminHeaders });
    const { winners } = (await listed.json()) as any;
    expect(winners).toHaveLength(1);
    expect(winners[0].amountNim).toBe('30');
    expect(winners[0].status).toBe('pending');

    const paid = await harness.request(`/api/admin/payouts/${winners[0].payoutId}/paid`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ transactionHash: 'abc123' }),
    });
    expect(paid.status).toBe(200);

    const relisted = await harness.request(`/api/admin/settlements/${today}/winners`, { headers: adminHeaders });
    const after = (await relisted.json()) as any;
    expect(after.winners[0].status).toBe('confirmed');
    expect(after.winners[0].transactionHash).toBe('abc123');
  });

  it('reports a missing challenge instead of inventing one', async () => {
    const res = await harness.request('/api/admin/settlements/2020-01-01/preview', { headers: adminHeaders });
    expect(res.status).toBe(404);
  });
});
