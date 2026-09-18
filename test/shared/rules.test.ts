import { describe, expect, it } from 'vitest';
import { abbreviateAddress, formatAddress, isValidAddress, normalizeAddress } from '@/shared/address.js';
import { ATTEMPT_EXPIRY_MS, canStartRanked, competitionPhase, isAttemptExpired } from '@/shared/challenge.js';
import { addDays, diffDays, isChallengeDate, toChallengeDate } from '@/shared/dates.js';
import { evaluateReferral, isValidReferralCode } from '@/shared/referrals.js';
import { buildAuthMessage } from '@/shared/auth-message.js';
import { buildShareText } from '@/shared/share.js';

const VALID_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000';

describe('addresses', () => {
  it('validates the checksum', () => {
    expect(isValidAddress(VALID_ADDRESS)).toBe(true);
    expect(isValidAddress('NQ08 0000 0000 0000 0000 0000 0000 0000 0000')).toBe(false);
    expect(isValidAddress('not-an-address')).toBe(false);
  });

  it('normalizes, formats and abbreviates', () => {
    const compact = normalizeAddress(VALID_ADDRESS);
    expect(compact).toBe('NQ0700000000000000000000000000000000');
    expect(formatAddress(compact)).toBe(VALID_ADDRESS);
    expect(abbreviateAddress(compact)).toBe('NQ07…0000');
  });
});

describe('challenge dates', () => {
  it('parses and validates UTC day keys', () => {
    expect(isChallengeDate('2026-02-29')).toBe(false);
    expect(isChallengeDate('2024-02-29')).toBe(true);
    expect(isChallengeDate('2026-1-1')).toBe(false);
    expect(toChallengeDate(new Date('2026-03-04T23:59:59.999Z'))).toBe('2026-03-04');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(diffDays('2026-01-01', '2026-01-31')).toBe(30);
  });
});

describe('ranked attempt rules', () => {
  const window = {
    status: 'active' as const,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-01-01T23:59:59.999Z'),
  };

  it('allows one ranked attempt inside an active window', () => {
    expect(canStartRanked(window, new Date('2026-01-01T12:00:00Z'), false)).toEqual({ ok: true });
  });

  it('blocks a second ranked attempt on the same day', () => {
    expect(canStartRanked(window, new Date('2026-01-01T12:00:00Z'), true)).toEqual({
      ok: false,
      reason: 'already_played_today',
    });
  });

  it('blocks draft, closed and out-of-window challenges', () => {
    expect(canStartRanked({ ...window, status: 'closed' }, new Date('2026-01-01T12:00:00Z'), false)).toEqual({
      ok: false,
      reason: 'challenge_not_active',
    });
    expect(canStartRanked(window, new Date('2026-01-02T00:00:01Z'), false)).toEqual({
      ok: false,
      reason: 'challenge_window_closed',
    });
  });

  it('expires stale attempts', () => {
    const started = new Date('2026-01-01T12:00:00Z');
    expect(isAttemptExpired(started, new Date(started.getTime() + ATTEMPT_EXPIRY_MS - 1))).toBe(false);
    expect(isAttemptExpired(started, new Date(started.getTime() + ATTEMPT_EXPIRY_MS + 1))).toBe(true);
  });

  it('maps status to a user-facing phase', () => {
    expect(competitionPhase('active')).toBe('active');
    expect(competitionPhase('closed')).toBe('pending_settlement');
    expect(competitionPhase('settled')).toBe('settled');
  });
});

describe('referrals', () => {
  it('validates codes', () => {
    expect(isValidReferralCode('ABC234')).toBe(true);
    expect(isValidReferralCode('ABC01I')).toBe(false);
    expect(isValidReferralCode('SHORT')).toBe(false);
  });

  it('rejects self-referrals, double referrers and returning wallets', () => {
    expect(
      evaluateReferral({
        referrerUserId: 'a',
        referredUserId: 'a',
        referredAlreadyHasReferrer: false,
        referredHasCompletedRankedBefore: false,
      }),
    ).toEqual({ ok: false, reason: 'self_referral' });

    expect(
      evaluateReferral({
        referrerUserId: 'a',
        referredUserId: 'b',
        referredAlreadyHasReferrer: true,
        referredHasCompletedRankedBefore: false,
      }),
    ).toEqual({ ok: false, reason: 'already_referred' });

    expect(
      evaluateReferral({
        referrerUserId: 'a',
        referredUserId: 'b',
        referredAlreadyHasReferrer: false,
        referredHasCompletedRankedBefore: true,
      }),
    ).toEqual({ ok: false, reason: 'referred_user_is_not_new' });

    expect(
      evaluateReferral({
        referrerUserId: 'a',
        referredUserId: 'b',
        referredAlreadyHasReferrer: false,
        referredHasCompletedRankedBefore: false,
      }),
    ).toEqual({ ok: true });
  });
});

describe('auth message and share text', () => {
  it('renders the exact signing message', () => {
    const message = buildAuthMessage({
      address: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
      nonce: 'abc123',
      issuedAt: new Date('2026-01-01T00:00:00Z'),
      expiresAt: new Date('2026-01-01T00:05:00Z'),
    });
    expect(message).toBe(
      [
        'Nimoto Authentication',
        'Wallet: NQ07 0000 0000 0000 0000 0000 0000 0000 0000',
        'Nonce: abc123',
        'Issued: 2026-01-01T00:00:00.000Z',
        'Expiration: 2026-01-01T00:05:00.000Z',
        'Signing does not initiate a transaction or cost NIM.',
      ].join('\n'),
    );
  });

  it('builds share text from server facts only', () => {
    expect(
      buildShareText({
        totalScore: 5842,
        correctCount: 4,
        questionCount: 5,
        rank: 17,
        playersToday: 643,
        referralUrl: 'https://nimoto.app/?ref=ABC234',
      }),
    ).toBe(
      "I scored 5,842 on today's Nimoto ⚡\nRank #17 / 643\nCan you beat me?\nhttps://nimoto.app/?ref=ABC234",
    );
  });
});
