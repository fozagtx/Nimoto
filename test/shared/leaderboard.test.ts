import { describe, expect, it } from 'vitest';
import { compareAttempts, rankAttempts } from '@/shared/leaderboard.js';

const base = { totalScore: 5000, totalDurationMs: 10_000, completedAt: '2026-01-01T10:00:00.000Z' };

describe('leaderboard ordering', () => {
  it('ranks by score descending', () => {
    const ranked = rankAttempts([
      { ...base, attemptId: 'low', totalScore: 1000 },
      { ...base, attemptId: 'high', totalScore: 7000 },
    ]);
    expect(ranked.map((r) => r.entry.attemptId)).toEqual(['high', 'low']);
  });

  it('breaks score ties with the faster total duration', () => {
    const ranked = rankAttempts([
      { ...base, attemptId: 'slow', totalDurationMs: 20_000 },
      { ...base, attemptId: 'fast', totalDurationMs: 9_000 },
    ]);
    expect(ranked[0]!.entry.attemptId).toBe('fast');
  });

  it('breaks remaining ties with the earlier completion', () => {
    const ranked = rankAttempts([
      { ...base, attemptId: 'later', completedAt: '2026-01-01T11:00:00.000Z' },
      { ...base, attemptId: 'earlier', completedAt: '2026-01-01T09:00:00.000Z' },
    ]);
    expect(ranked[0]!.entry.attemptId).toBe('earlier');
  });

  it('is a total order with stable ranks', () => {
    const entries = [
      { ...base, attemptId: 'b' },
      { ...base, attemptId: 'a' },
    ];
    expect(rankAttempts(entries).map((r) => r.entry.attemptId)).toEqual(['a', 'b']);
    expect(compareAttempts(entries[0]!, entries[0]!)).toBe(0);
    expect(rankAttempts(entries).map((r) => r.rank)).toEqual([1, 2]);
  });

  it('does not mutate the input array', () => {
    const entries = [
      { ...base, attemptId: 'b', totalScore: 1 },
      { ...base, attemptId: 'a', totalScore: 2 },
    ];
    rankAttempts(entries);
    expect(entries[0]!.attemptId).toBe('b');
  });
});
