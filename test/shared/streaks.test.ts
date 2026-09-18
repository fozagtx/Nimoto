import { describe, expect, it } from 'vitest';
import { EMPTY_STREAK, applyRankedCompletion, visibleStreak } from '@/shared/streaks.js';

describe('applyRankedCompletion', () => {
  it('starts at one', () => {
    const state = applyRankedCompletion(EMPTY_STREAK, '2026-01-01');
    expect(state).toEqual({ currentStreak: 1, longestStreak: 1, lastCompletedDate: '2026-01-01' });
  });

  it('increments on consecutive UTC days', () => {
    let state = applyRankedCompletion(EMPTY_STREAK, '2026-01-01');
    state = applyRankedCompletion(state, '2026-01-02');
    state = applyRankedCompletion(state, '2026-01-03');
    expect(state.currentStreak).toBe(3);
    expect(state.longestStreak).toBe(3);
  });

  it('resets to one after a missed day and keeps the record', () => {
    let state = applyRankedCompletion(EMPTY_STREAK, '2026-01-01');
    state = applyRankedCompletion(state, '2026-01-02');
    state = applyRankedCompletion(state, '2026-01-05');
    expect(state.currentStreak).toBe(1);
    expect(state.longestStreak).toBe(2);
  });

  it('is idempotent for the same day', () => {
    const first = applyRankedCompletion(EMPTY_STREAK, '2026-01-01');
    expect(applyRankedCompletion(first, '2026-01-01')).toEqual(first);
  });

  it('ignores out-of-order backfills', () => {
    const state = applyRankedCompletion(EMPTY_STREAK, '2026-01-10');
    expect(applyRankedCompletion(state, '2026-01-01')).toEqual(state);
  });

  it('crosses month and year boundaries', () => {
    let state = applyRankedCompletion(EMPTY_STREAK, '2025-12-31');
    state = applyRankedCompletion(state, '2026-01-01');
    expect(state.currentStreak).toBe(2);
  });
});

describe('visibleStreak', () => {
  it('keeps the streak visible on the day after the last completion', () => {
    const state = applyRankedCompletion(EMPTY_STREAK, '2026-01-01');
    expect(visibleStreak(state, '2026-01-01')).toBe(1);
    expect(visibleStreak(state, '2026-01-02')).toBe(1);
    expect(visibleStreak(state, '2026-01-03')).toBe(0);
  });

  it('is zero without history', () => {
    expect(visibleStreak(EMPTY_STREAK, '2026-01-01')).toBe(0);
  });
});
