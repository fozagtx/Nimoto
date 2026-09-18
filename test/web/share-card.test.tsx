import { describe, expect, it } from 'vitest';
import type { AttemptResultResponse } from '@/shared';
import { shareCardStats } from '@/web/lib/share-card.js';

function result(overrides: Partial<AttemptResultResponse> = {}): AttemptResultResponse {
  return {
    attemptId: 'attempt-1',
    mode: 'ranked',
    totalScore: 6203,
    correctCount: 5,
    questionCount: 5,
    totalDurationMs: 36_210,
    rank: 1,
    playersToday: 3,
    currentStreak: 1,
    prizeNim: null,
    nextChallengePoolNim: '90',
    referralUrl: 'http://localhost/?ref=ABC123',
    shareText: 'share',
    ...overrides,
  };
}

describe('shareCardStats', () => {
  it('shows the streak on ranked cards', () => {
    expect(shareCardStats(result()).map((stat) => stat.label)).toContain('Streak');
  });

  it('hides the streak on practice cards, which never earn one', () => {
    const stats = shareCardStats(result({ mode: 'practice', rank: null, currentStreak: 0 }));
    expect(stats.map((stat) => stat.label)).toEqual(['Correct']);
  });
});
