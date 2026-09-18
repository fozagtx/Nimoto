/**
 * The exact human-readable text the wallet is asked to sign. The server stores
 * this string verbatim and requires a byte-identical message at verification
 * time, so any change here is a breaking protocol change.
 */
export interface AuthChallengeMessageInput {
  address: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

export function buildAuthMessage(input: AuthChallengeMessageInput): string {
  return [
    'Nimoto Authentication',
    `Wallet: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Issued: ${input.issuedAt.toISOString()}`,
    `Expiration: ${input.expiresAt.toISOString()}`,
    'Signing does not initiate a transaction or cost NIM.',
  ].join('\n');
}

export const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
