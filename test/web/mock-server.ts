import { vi } from 'vitest';
import type {
  AnswerResponse,
  AttemptResultResponse,
  AttemptStateResponse,
  LeaderboardResponse,
  MeResponse,
  QuestionView,
  ReferralSummaryResponse,
  TodayChallengeResponse,
} from '@/shared';
import { setProvider, type NimiqProvider } from '@/web/lib/nimiq.js';

export const TEST_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0001';

/** Test seam: a stand-in provider so flows can run without a real wallet popup. */
export function installTestWallet(overrides: Partial<NimiqProvider> = {}): NimiqProvider {
  const provider: NimiqProvider = {
    kind: 'hub',
    listAccounts: async () => [{ address: TEST_ADDRESS, label: 'Test wallet' }],
    signMessage: async (message: string) => ({
      message,
      address: TEST_ADDRESS,
      publicKey: 'aa'.repeat(32),
      signature: 'bb'.repeat(64),
    }),
    isConsensusEstablished: async () => true,
    getBlockNumber: async () => 1,
    sendTransaction: async () => ({ transactionHash: 'cc'.repeat(32) }),
    ...overrides,
  };
  setProvider(provider);
  return provider;
}

function question(position: number): QuestionView {
  return {
    questionId: `00000000-0000-4000-8000-00000000000${position}`,
    position,
    prompt: `Question ${position}?`,
    options: [
      { key: 'a', text: `Answer A${position}` },
      { key: 'b', text: `Answer B${position}` },
      { key: 'c', text: `Answer C${position}` },
      { key: 'd', text: `Answer D${position}` },
    ],
    category: 'logic',
    difficulty: 2,
    serverTime: new Date().toISOString(),
  };
}

const RESULT: AttemptResultResponse = {
  attemptId: 'attempt-1',
  mode: 'ranked',
  totalScore: 6200,
  correctCount: 5,
  questionCount: 5,
  totalDurationMs: 24_000,
  rank: 3,
  playersToday: 42,
  currentStreak: 4,
  prizeNim: '10',
  nextChallengePoolNim: '90',
  referralUrl: 'http://localhost/?ref=ABC123',
  shareText: 'I scored 6200 on Nimoto today.',
};

export interface ServerState {
  authenticated: boolean;
  answered: number;
}

/**
 * A tiny in-memory stand-in for the API so screens can be exercised without a
 * live backend. It mirrors the real response contracts from @/shared.
 */
export function installMockApi(state: ServerState = { authenticated: false, answered: 0 }): ServerState {
  const today = (): TodayChallengeResponse => ({
    challengeDate: '2026-01-31',
    status: 'active',
    phase: 'active',
    startsAt: '2026-01-31T00:00:00.000Z',
    endsAt: '2026-02-01T00:00:00.000Z',
    serverTime: new Date().toISOString(),
    msRemaining: 3_600_000,
    questionCount: 5,
    prizePoolNim: '90',
    prizeTiers: [{ fromRank: 1, toRank: 1, amountNim: '30' }],
    playersToday: 42,
    scoringRules: ['1000 points per correct answer', 'Up to 500 bonus points for speed'],
    me: state.authenticated ? { rankedAttempt: null, currentStreak: 3 } : null,
  });

  const me: MeResponse = {
    user: {
      id: 'user-1',
      walletAddress: TEST_ADDRESS.replace(/ /g, ''),
      displayName: null,
      referralCode: 'ABC123',
      xp: 100,
      currentStreak: 3,
      longestStreak: 5,
    },
    currentStreak: 3,
    longestStreak: 5,
    lastCompletedDate: null,
    totalRankedAttempts: 7,
    bestRank: 2,
  };

  const leaderboard: LeaderboardResponse = {
    challengeDate: '2026-01-31',
    status: 'active',
    phase: 'active',
    msRemaining: 3_600_000,
    serverTime: new Date().toISOString(),
    prizePoolNim: '90',
    prizeTiers: [{ fromRank: 1, toRank: 1, amountNim: '30' }],
    playersToday: 42,
    entries: [
      {
        rank: 1,
        userId: 'user-9',
        displayName: 'Sprinter',
        walletAddressAbbreviated: 'NQ07…0009',
        totalScore: 7100,
        totalDurationMs: 18_000,
        completedAt: '2026-01-31T10:00:00.000Z',
        prizeNim: '30',
        isMe: false,
      },
      {
        rank: 3,
        userId: 'user-1',
        displayName: null,
        walletAddressAbbreviated: 'NQ07…0001',
        totalScore: 6200,
        totalDurationMs: 24_000,
        completedAt: '2026-01-31T10:05:00.000Z',
        prizeNim: '10',
        isMe: true,
      },
    ],
    me: null,
  };

  const referrals: ReferralSummaryResponse = {
    code: 'ABC123',
    link: 'https://nimoto.app/?ref=ABC123',
    qualifiedCount: 2,
    pendingCount: 1,
    xp: 200,
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

      if (url.includes('/api/analytics/events')) return json({ ok: true });
      if (url.includes('/api/challenge/today')) return json(today());
      if (url.includes('/api/leaderboard/today')) return json(leaderboard);
      if (url.includes('/api/referrals/me')) return json(referrals);
      if (url.includes('/api/me')) {
        return state.authenticated ? json(me) : json({ error: { code: 'unauthorized', message: 'no session' } }, 401);
      }
      if (url.includes('/api/auth/challenge')) {
        return json({ nonce: 'nonce', message: 'Nimoto Authentication', expiresAt: new Date().toISOString() });
      }
      if (url.includes('/api/auth/verify')) {
        state.authenticated = true;
        return json({ token: 'token-1', expiresAt: new Date().toISOString(), user: me.user });
      }
      if (url.includes('/api/attempts') && url.endsWith('/answer')) {
        state.answered += 1;
        const done = state.answered >= 5;
        const body: AnswerResponse = {
          isCorrect: true,
          correctOption: 'a',
          pointsEarned: 1240,
          timeBonus: 240,
          elapsedMs: 4200,
          explanation: 'Because A is right.',
          nextQuestion: done ? null : question(state.answered + 1),
          result: done ? RESULT : null,
        };
        return json(body);
      }
      if (url.includes('/api/attempts')) {
        const body: AttemptStateResponse = {
          attemptId: 'attempt-1',
          mode: 'ranked',
          status: 'started',
          challengeDate: '2026-01-31',
          questionCount: 5,
          answeredCount: state.answered,
          expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
          currentQuestion: question(state.answered + 1),
          result: null,
        };
        return json(body);
      }
      return json({ error: { code: 'not_found', message: 'unhandled route' } }, 404);
    }),
  );

  return state;
}
