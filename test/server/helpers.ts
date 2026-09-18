import { KeyPair, PrivateKey } from '@nimiq/core';
import { eq, sql } from 'drizzle-orm';
import { SEED_QUESTIONS, questions, runMigrations } from '@/db';
import { createApp } from '@/server/app.js';
import { createAppContext, type AppContext } from '@/server/context.js';
import { loadEnv } from '@/server/env.js';
import { hashSignedMessage } from '@/server/lib/nimiq-verify.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nimoto_test';

export const TEST_ADMIN_TOKEN = 'test-admin-token-0123456789abcdef';

export interface TestHarness {
  ctx: AppContext;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

export async function createHarness(): Promise<TestHarness> {
  await runMigrations(TEST_DATABASE_URL);
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    ADMIN_API_TOKEN: TEST_ADMIN_TOKEN,
    PUBLIC_WEB_URL: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
    RATE_LIMIT_MAX: '100000',
  } as NodeJS.ProcessEnv);

  const ctx = createAppContext(env);
  await ctx.db
    .insert(questions)
    .values(SEED_QUESTIONS)
    .onConflictDoNothing({ target: questions.prompt });
  const app = createApp(ctx);

  return {
    ctx,
    request: async (path, init) => app.request(`http://localhost${path}`, init),
    close: () => ctx.close(),
  };
}

export async function resetDatabase(ctx: AppContext): Promise<void> {
  // Questions survive so tests reuse the seeded bank.
  await ctx.db.execute(sql`truncate table
    analytics_events, audit_logs, prize_payouts, sponsor_contributions, referrals,
    streaks, attempt_answers, attempts, daily_challenge_questions, daily_challenges,
    sessions, auth_challenges, users
   restart identity cascade`);
}

export interface TestWallet {
  address: string;
  publicKeyHex: string;
  sign: (message: string) => string;
}

/** Creates a throwaway Nimiq keypair and signs messages the way Nimiq Pay does. */
export function createWallet(seed = 1): TestWallet {
  const bytes = new Uint8Array(32).fill(seed);
  const keyPair = KeyPair.derive(new PrivateKey(bytes));
  return {
    address: keyPair.publicKey.toAddress().toUserFriendlyAddress(),
    publicKeyHex: keyPair.publicKey.toHex(),
    sign: (message: string) => keyPair.sign(hashSignedMessage(message)).toHex(),
  };
}

export interface AuthedUser {
  token: string;
  address: string;
  userId: string;
  referralCode: string;
}

export async function signIn(
  harness: TestHarness,
  wallet: TestWallet,
  referralCode?: string,
): Promise<AuthedUser> {
  const challengeRes = await harness.request('/api/auth/challenge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address }),
  });
  if (challengeRes.status !== 200) throw new Error(`challenge failed: ${await challengeRes.text()}`);
  const challenge = (await challengeRes.json()) as { message: string };

  const verifyRes = await harness.request('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      address: wallet.address,
      message: challenge.message,
      publicKey: wallet.publicKeyHex,
      signature: wallet.sign(challenge.message),
      ...(referralCode ? { referralCode } : {}),
    }),
  });
  if (verifyRes.status !== 200) throw new Error(`verify failed: ${await verifyRes.text()}`);
  const body = (await verifyRes.json()) as {
    token: string;
    user: { id: string; walletAddress: string; referralCode: string };
  };

  return {
    token: body.token,
    address: body.user.walletAddress,
    userId: body.user.id,
    referralCode: body.user.referralCode,
  };
}

export function authHeaders(user: AuthedUser): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${user.token}` };
}

/** Plays a full ranked run, always answering correctly (or always wrongly). */
export async function playRankedRun(
  harness: TestHarness,
  user: AuthedUser,
  options: { correct?: boolean } = {},
): Promise<{ attemptId: string; result: { totalScore: number; rank: number | null } }> {
  const startRes = await harness.request('/api/attempts', {
    method: 'POST',
    headers: authHeaders(user),
    body: JSON.stringify({ mode: 'ranked' }),
  });
  if (startRes.status !== 200) throw new Error(`start failed: ${await startRes.text()}`);
  const state = (await startRes.json()) as {
    attemptId: string;
    currentQuestion: { questionId: string } | null;
  };

  let question = state.currentQuestion;
  let result: { totalScore: number; rank: number | null } | null = null;

  while (question) {
    const correctOption = await correctOptionFor(harness, question.questionId);
    const selectedOption = options.correct === false ? wrongOption(correctOption) : correctOption;
    const answerRes = await harness.request(`/api/attempts/${state.attemptId}/answer`, {
      method: 'POST',
      headers: authHeaders(user),
      body: JSON.stringify({ questionId: question.questionId, selectedOption }),
    });
    if (answerRes.status !== 200) throw new Error(`answer failed: ${await answerRes.text()}`);
    const body = (await answerRes.json()) as {
      nextQuestion: { questionId: string } | null;
      result: { totalScore: number; rank: number | null } | null;
    };
    question = body.nextQuestion;
    result = body.result;
  }

  if (!result) throw new Error('run did not produce a result');
  return { attemptId: state.attemptId, result };
}

export async function correctOptionFor(harness: TestHarness, questionId: string): Promise<string> {
  const rows = await harness.ctx.db
    .select({ correctOption: questions.correctOption })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  const option = rows[0]?.correctOption;
  if (!option) throw new Error(`unknown question ${questionId}`);
  return option;
}

export function wrongOption(correct: string): string {
  return correct === 'a' ? 'b' : 'a';
}
