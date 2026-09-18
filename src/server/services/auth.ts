import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { authChallenges, sessions, users } from '@/db';
import {
  AUTH_CHALLENGE_TTL_MS,
  SESSION_TTL_MS,
  buildAuthMessage,
  formatAddress,
  isValidAddress,
  normalizeAddress,
} from '@/shared';
import { ApiError } from '../lib/errors.js';
import { hashToken, randomNonce, randomSessionToken } from '../lib/ids.js';
import { verifySignedMessage } from '../lib/nimiq-verify.js';
import type { SessionUser } from '../context.js';
import { findOrCreateUser } from './users.js';

export interface IssuedChallenge {
  message: string;
  nonce: string;
  expiresAt: string;
}

export async function issueChallenge(
  db: Database,
  rawAddress: string,
  now = new Date(),
): Promise<IssuedChallenge> {
  if (!isValidAddress(rawAddress)) {
    throw ApiError.badRequest('invalid_address', 'That is not a valid Nimiq address');
  }
  const walletAddress = normalizeAddress(rawAddress);
  const expiresAt = new Date(now.getTime() + AUTH_CHALLENGE_TTL_MS);
  const nonce = randomNonce();
  const message = buildAuthMessage({
    address: formatAddress(walletAddress),
    nonce,
    issuedAt: now,
    expiresAt,
  });

  await db.insert(authChallenges).values({ walletAddress, nonce, message, expiresAt });
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, new Date(now.getTime() - 60 * 60 * 1000)));

  return { message, nonce, expiresAt: expiresAt.toISOString() };
}

export interface VerifyInput {
  address: string;
  message: string;
  publicKey: string;
  signature: string;
}

export interface VerifiedSession {
  user: SessionUser;
  token: string;
  expiresAt: Date;
}

export async function verifyChallenge(
  db: Database,
  input: VerifyInput,
  now = new Date(),
): Promise<VerifiedSession> {
  if (!isValidAddress(input.address)) {
    throw ApiError.badRequest('invalid_address', 'That is not a valid Nimiq address');
  }
  const walletAddress = normalizeAddress(input.address);

  const rows = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.message, input.message))
    .limit(1);
  const challenge = rows[0];
  if (!challenge) throw ApiError.badRequest('challenge_not_found', 'Sign-in request not recognised');
  if (normalizeAddress(challenge.walletAddress) !== walletAddress) {
    throw ApiError.badRequest('challenge_address_mismatch', 'Sign-in request belongs to another wallet');
  }
  if (challenge.usedAt) throw ApiError.badRequest('challenge_already_used', 'Sign-in request already used');
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw ApiError.badRequest('challenge_expired', 'Sign-in request expired, please try again');
  }

  const verification = verifySignedMessage({
    message: challenge.message,
    publicKeyHex: input.publicKey,
    signatureHex: input.signature,
    expectedAddress: walletAddress,
  });
  if (!verification.ok) {
    throw ApiError.unauthorized('invalid_signature', 'Signature could not be verified', {
      reason: verification.reason,
    });
  }

  // Atomically consume the nonce so a replayed signature cannot create a session.
  const consumed = await db
    .update(authChallenges)
    .set({ usedAt: now })
    .where(and(eq(authChallenges.id, challenge.id), isNull(authChallenges.usedAt)))
    .returning({ id: authChallenges.id });
  if (consumed.length === 0) {
    throw ApiError.badRequest('challenge_already_used', 'Sign-in request already used');
  }

  const user = await findOrCreateUser(db, walletAddress);
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, user.id));

  const token = randomSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      referralCode: user.referralCode,
      isAdmin: user.isAdmin,
    },
  };
}

export async function resolveSession(
  db: Database,
  token: string,
  now = new Date(),
): Promise<SessionUser | undefined> {
  const rows = await db
    .select({
      id: users.id,
      walletAddress: users.walletAddress,
      displayName: users.displayName,
      referralCode: users.referralCode,
      isAdmin: users.isAdmin,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;
  if (row.revokedAt) return undefined;
  if (row.expiresAt.getTime() <= now.getTime()) return undefined;

  await db
    .update(users)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(users.id, row.id));

  return {
    id: row.id,
    walletAddress: row.walletAddress,
    displayName: row.displayName,
    referralCode: row.referralCode,
    isAdmin: row.isAdmin,
  };
}

export async function revokeSession(db: Database, token: string, now = new Date()): Promise<void> {
  await db.update(sessions).set({ revokedAt: now }).where(eq(sessions.tokenHash, hashToken(token)));
}
