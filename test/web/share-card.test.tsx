import { describe, expect, it } from 'vitest';
import type { AttemptResultResponse } from '@/shared';
import {
  avatarHue,
  playerLabel,
  shareCardCaption,
  shareCardHero,
  shareCardStats,
  shortAddress,
} from '@/web/lib/share-card.js';

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

const ADDRESS = 'NQ63 6JD3 2CNK XJ8V 8RPS UXV1 CVG2 AXB9 491H';

describe('shareCardHero', () => {
  it('leads with NIM earned when there is a prize', () => {
    const hero = shareCardHero(result({ prizeNim: '30' }));
    expect(hero.value).toBe('+30 NIM');
    expect(hero.detail).toBe("33.3% of today's prize pool");
  });

  it('falls back to the percentile when ranked without a prize', () => {
    const hero = shareCardHero(result({ rank: 12, playersToday: 40 }));
    expect(hero.value).toBe('Top 30%');
    expect(hero.detail).toBe('of 40 players today');
  });

  it('shows the score for practice', () => {
    const hero = shareCardHero(result({ mode: 'practice', rank: null, currentStreak: 0 }));
    expect(hero.value).toBe('6,203');
    expect(hero.detail).toBe('5/5 correct in 36.2s');
  });
});

describe('shareCardStats', () => {
  it('shows the streak on ranked cards', () => {
    expect(shareCardStats(result()).map((stat) => stat.label)).toEqual(['Score', 'Correct', 'Streak']);
  });

  it('swaps the streak for the time on practice cards, which never earn one', () => {
    const stats = shareCardStats(result({ mode: 'practice', rank: null, currentStreak: 0 }));
    expect(stats.map((stat) => stat.label)).toEqual(['Correct', 'Time']);
  });
});

describe('player identity', () => {
  it('shortens a wallet address but keeps it recognisable', () => {
    expect(shortAddress(ADDRESS)).toBe('NQ63 6JD3 … 491H');
  });

  it('prefers the display name over the address', () => {
    expect(playerLabel({ displayName: 'Awaken', walletAddress: ADDRESS })).toBe('Awaken');
    expect(playerLabel({ displayName: '  ', walletAddress: ADDRESS })).toBe('NQ63 6JD3 … 491H');
  });

  it('gives every wallet a stable hue', () => {
    expect(avatarHue(ADDRESS)).toBe(avatarHue(ADDRESS));
    expect(avatarHue(ADDRESS)).toBeLessThan(360);
  });
});

describe('shareCardCaption', () => {
  it('brags about the NIM when there is a prize', () => {
    expect(shareCardCaption(result({ prizeNim: '30' }))).toBe(
      'I just earned 30 NIM finishing #1 on Nimoto ⚡ Can you beat me?',
    );
  });
});
