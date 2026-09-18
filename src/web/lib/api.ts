import type {
  AnswerResponse,
  AttemptStateResponse,
  AuthChallengeResponse,
  AuthVerifyResponse,
  LeaderboardResponse,
  MeResponse,
  ReferralSummaryResponse,
  TodayChallengeResponse,
} from '@/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
const TOKEN_KEY = 'nimoto.session';

export function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private-mode browsers simply fall back to a cookie-only session.
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiRequestError(0, 'offline', 'You appear to be offline. Check your connection.');
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as
    | { error?: { code: string; message: string } }
    | null;

  if (!response.ok) {
    const code = body?.error?.code ?? 'request_failed';
    if (response.status === 401 && code !== 'admin_unauthorized') writeToken(null);
    throw new ApiRequestError(response.status, code, body?.error?.message ?? 'Something went wrong.');
  }
  return body as T;
}

export const api = {
  today: () => request<TodayChallengeResponse>('/api/challenge/today'),
  leaderboard: () => request<LeaderboardResponse>('/api/leaderboard/today'),
  me: () => request<MeResponse>('/api/me'),
  referrals: () => request<ReferralSummaryResponse>('/api/referrals/me'),
  authChallenge: (address: string) =>
    request<AuthChallengeResponse>('/api/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),
  authVerify: (payload: {
    address: string;
    message: string;
    publicKey: string;
    signature: string;
    referralCode?: string;
  }) =>
    request<AuthVerifyResponse>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  startAttempt: (mode: 'ranked' | 'practice') =>
    request<AttemptStateResponse>('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  attempt: (attemptId: string) => request<AttemptStateResponse>(`/api/attempts/${attemptId}`),
  answer: (attemptId: string, questionId: string, selectedOption: string) =>
    request<AnswerResponse>(`/api/attempts/${attemptId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ questionId, selectedOption }),
    }),
  track: (event: string, properties?: Record<string, string | number | boolean | null>) =>
    request<{ ok: boolean }>('/api/analytics/events', {
      method: 'POST',
      body: JSON.stringify({ event, ...(properties ? { properties } : {}) }),
    }).catch(() => ({ ok: false })),
};
