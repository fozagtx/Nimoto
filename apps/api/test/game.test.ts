import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { attempts } from '@nimoto/db';
import { SCORING } from '@nimoto/shared';
import {
  authHeaders,
  correctOptionFor,
  createHarness,
  createWallet,
  playRankedRun,
  resetDatabase,
  signIn,
  wrongOption,
  type TestHarness,
} from './helpers.js';

let harness: TestHarness;

beforeAll(async () => {
  harness = await createHarness();
});
beforeEach(() => resetDatabase(harness.ctx));
afterAll(() => harness.close());

async function startRanked(user: Awaited<ReturnType<typeof signIn>>) {
  const res = await harness.request('/api/attempts', {
    method: 'POST',
    headers: authHeaders(user),
    body: JSON.stringify({ mode: 'ranked' }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe('daily challenge and ranked runs', () => {
  it('creates today’s challenge on demand and hides correct answers', async () => {
    const res = await harness.request('/api/challenge/today');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.questionCount).toBe(SCORING.QUESTIONS_PER_RUN);
    expect(body.prizePoolNim).toBe('90');
    expect(JSON.stringify(body)).not.toContain('correctOption');
  });

  it('serves questions one at a time without the answer key', async () => {
    const user = await signIn(harness, createWallet(11));
    const { status, body } = await startRanked(user);
    expect(status).toBe(200);
    expect(body.currentQuestion.position).toBe(1);
    expect(body.currentQuestion.options).toHaveLength(4);
    expect(JSON.stringify(body.currentQuestion)).not.toContain('correctOption');
    expect(body.result).toBeNull();
  });

  it('resumes the same attempt after a refresh', async () => {
    const user = await signIn(harness, createWallet(12));
    const first = await startRanked(user);
    const second = await startRanked(user);
    expect(second.body.attemptId).toBe(first.body.attemptId);

    const fetched = await harness.request(`/api/attempts/${first.body.attemptId}`, {
      headers: authHeaders(user),
    });
    expect(((await fetched.json()) as any).attemptId).toBe(first.body.attemptId);
  });

  it('allows exactly one ranked run per wallet per day', async () => {
    const user = await signIn(harness, createWallet(13));
    await playRankedRun(harness, user);
    const again = await startRanked(user);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_played_today');
  });

  it('rejects answering a question out of order and answering twice', async () => {
    const user = await signIn(harness, createWallet(14));
    const { body } = await startRanked(user);
    const questionId = body.currentQuestion.questionId;
    const option = await correctOptionFor(harness, questionId);

    const wrongQuestion = await harness.request(`/api/attempts/${body.attemptId}/answer`, {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ questionId: '00000000-0000-4000-8000-000000000000', selectedOption: 'a' }),
    });
    expect(wrongQuestion.status).toBe(409);

    const first = await harness.request(`/api/attempts/${body.attemptId}/answer`, {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ questionId, selectedOption: option }),
    });
    expect(first.status).toBe(200);

    const duplicate = await harness.request(`/api/attempts/${body.attemptId}/answer`, {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ questionId, selectedOption: option }),
    });
    expect(duplicate.status).toBe(409);
  });

  it('does not restart the speed clock when a ranked run is reloaded', async () => {
    const user = await signIn(harness, createWallet(28));
    const { body } = await startRanked(user);
    const servedAt = new Date(body.currentQuestion.serverTime).getTime();

    const reloaded = (await (
      await harness.request(`/api/attempts/${body.attemptId}`, { headers: authHeaders(user) })
    ).json()) as any;
    expect(new Date(reloaded.currentQuestion.serverTime).getTime()).toBe(servedAt);

    const [row] = await harness.ctx.db.select().from(attempts).where(eq(attempts.id, body.attemptId));
    expect(row?.questionServedAt.getTime()).toBe(servedAt);
  });

  it('never previews the ranked questions in practice', async () => {
    const user = await signIn(harness, createWallet(29));
    const practice = await harness.request('/api/attempts', {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ mode: 'practice' }),
    });
    const practiceState = (await practice.json()) as any;
    const ranked = await startRanked(user);

    const practiceIds = new Set<string>();
    let question = practiceState.currentQuestion;
    while (question) {
      practiceIds.add(question.questionId);
      const option = await correctOptionFor(harness, question.questionId);
      const res = await harness.request(`/api/attempts/${practiceState.attemptId}/answer`, {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ questionId: question.questionId, selectedOption: option }),
      });
      question = ((await res.json()) as any).nextQuestion;
    }

    expect(practiceIds.size).toBe(SCORING.QUESTIONS_PER_RUN);
    expect(practiceIds.has(ranked.body.currentQuestion.questionId)).toBe(false);
  });

  it('scores a perfect run within the documented maximum', async () => {
    const user = await signIn(harness, createWallet(15));
    const { result } = await playRankedRun(harness, user);
    const maxScore = SCORING.QUESTIONS_PER_RUN * (SCORING.BASE_POINTS + SCORING.MAX_TIME_BONUS);
    expect(result.totalScore).toBeGreaterThan(SCORING.QUESTIONS_PER_RUN * SCORING.BASE_POINTS);
    expect(result.totalScore).toBeLessThanOrEqual(maxScore);
    expect(result.rank).toBe(1);
  });

  it('scores zero for a run of wrong answers', async () => {
    const user = await signIn(harness, createWallet(16));
    const { result } = await playRankedRun(harness, user, { correct: false });
    expect(result.totalScore).toBe(0);
  });

  it('flags implausibly fast answers', async () => {
    const user = await signIn(harness, createWallet(17));
    const { attemptId } = await playRankedRun(harness, user);
    const [row] = await harness.ctx.db.select().from(attempts).where(eq(attempts.id, attemptId));
    expect(row?.flagged).toBe(true);
  });

  it('keeps practice runs out of the leaderboard', async () => {
    const user = await signIn(harness, createWallet(18));
    const start = await harness.request('/api/attempts', {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ mode: 'practice' }),
    });
    const state = (await start.json()) as any;
    let question = state.currentQuestion;
    while (question) {
      const option = await correctOptionFor(harness, question.questionId);
      const res = await harness.request(`/api/attempts/${state.attemptId}/answer`, {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ questionId: question.questionId, selectedOption: option }),
      });
      question = ((await res.json()) as any).nextQuestion;
    }

    const board = (await (await harness.request('/api/leaderboard/today')).json()) as any;
    expect(board.entries).toHaveLength(0);
    expect(board.playersToday).toBe(0);

    // Practice must not consume the ranked run.
    const ranked = await startRanked(user);
    expect(ranked.status).toBe(200);
  });

  it('ranks players by score then speed and exposes prize tiers', async () => {
    const winner = await signIn(harness, createWallet(19));
    const loser = await signIn(harness, createWallet(20));
    await playRankedRun(harness, winner);
    await playRankedRun(harness, loser, { correct: false });

    const board = (await (
      await harness.request('/api/leaderboard/today', { headers: authHeaders(loser) })
    ).json()) as any;
    expect(board.playersToday).toBe(2);
    expect(board.entries[0].totalScore).toBeGreaterThan(board.entries[1].totalScore);
    expect(board.entries[0].prizeNim).toBe('30');
    expect(board.me.rank).toBe(2);
    expect(board.entries[0].walletAddressAbbreviated).not.toContain(' ');
  });

  it('starts a streak at one after the first ranked completion', async () => {
    const user = await signIn(harness, createWallet(21));
    await playRankedRun(harness, user);
    const me = (await (await harness.request('/api/me', { headers: authHeaders(user) })).json()) as any;
    expect(me.currentStreak).toBe(1);
    expect(me.totalRankedAttempts).toBe(1);
  });

  it('qualifies a referral only after the invited wallet finishes a ranked run', async () => {
    const referrer = await signIn(harness, createWallet(22));
    const invited = await signIn(harness, createWallet(23), referrer.referralCode);

    const before = (await (
      await harness.request('/api/referrals/me', { headers: authHeaders(referrer) })
    ).json()) as any;
    expect(before.pendingCount).toBe(1);
    expect(before.qualifiedCount).toBe(0);

    await playRankedRun(harness, invited);

    const after = (await (
      await harness.request('/api/referrals/me', { headers: authHeaders(referrer) })
    ).json()) as any;
    expect(after.qualifiedCount).toBe(1);
    expect(after.xp).toBeGreaterThan(0);
    expect(after.link).toContain(referrer.referralCode);
  });

  it('ignores a self-referral', async () => {
    const wallet = createWallet(24);
    const user = await signIn(harness, wallet);
    const challenge = await harness.request('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message } = (await challenge.json()) as { message: string };
    await harness.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        message,
        publicKey: wallet.publicKeyHex,
        signature: wallet.sign(message),
        referralCode: user.referralCode,
      }),
    });

    const summary = (await (
      await harness.request('/api/referrals/me', { headers: authHeaders(user) })
    ).json()) as any;
    expect(summary.pendingCount).toBe(0);
    expect(summary.qualifiedCount).toBe(0);
  });

  it('refuses to answer somebody else’s attempt', async () => {
    const owner = await signIn(harness, createWallet(25));
    const stranger = await signIn(harness, createWallet(26));
    const { body } = await startRanked(owner);
    const option = await correctOptionFor(harness, body.currentQuestion.questionId);

    const res = await harness.request(`/api/attempts/${body.attemptId}/answer`, {
      method: 'POST',
      headers: authHeaders(stranger),
      body: JSON.stringify({
        questionId: body.currentQuestion.questionId,
        selectedOption: wrongOption(option),
      }),
    });
    expect(res.status).toBe(403);
  });
});
