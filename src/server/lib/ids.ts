import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH } from '@/shared';

export function randomNonce(): string {
  return randomBytes(24).toString('base64url');
}

export function randomSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function randomReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_ALPHABET[bytes[i]! % REFERRAL_ALPHABET.length];
  }
  return code;
}

export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
