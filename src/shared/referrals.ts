export const REFERRAL_CODE_LENGTH = 6;
/** Unambiguous alphabet: no O/0, I/1, or similar look-alikes. */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_PATTERN = new RegExp(`^[${REFERRAL_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`);

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_PATTERN.test(code.toUpperCase());
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface ReferralCandidate {
  referrerUserId: string;
  referredUserId: string;
  referredAlreadyHasReferrer: boolean;
  referredHasCompletedRankedBefore: boolean;
}

export type ReferralRejection =
  | 'self_referral'
  | 'already_referred'
  | 'referred_user_is_not_new';

/**
 * A referral may only be recorded for a brand new wallet, at most once, and
 * never for the user's own wallet. Qualification (the reward-bearing event)
 * happens separately, after the referred wallet finishes its first ranked run.
 */
export function evaluateReferral(candidate: ReferralCandidate): { ok: true } | { ok: false; reason: ReferralRejection } {
  if (candidate.referrerUserId === candidate.referredUserId) return { ok: false, reason: 'self_referral' };
  if (candidate.referredAlreadyHasReferrer) return { ok: false, reason: 'already_referred' };
  if (candidate.referredHasCompletedRankedBefore) return { ok: false, reason: 'referred_user_is_not_new' };
  return { ok: true };
}

/** XP awarded to the referrer once an invited wallet completes its first ranked run. */
export const REFERRAL_QUALIFIED_XP = 250;
