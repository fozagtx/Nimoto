import { createHash } from 'node:crypto';
import { Address, PublicKey, Signature } from '@nimiq/core';
import { normalizeAddress } from '@nimoto/shared';

/**
 * Nimiq signs `sha256('\x16Nimiq Signed Message:\n' + byteLength + message)`
 * rather than the raw message, which keeps signed messages from ever being
 * mistaken for transactions.
 */
export function hashSignedMessage(message: string): Uint8Array {
  const body = Buffer.from(message, 'utf8');
  const prefix = Buffer.from(`\x16Nimiq Signed Message:\n${body.length}`, 'utf8');
  return new Uint8Array(createHash('sha256').update(Buffer.concat([prefix, body])).digest());
}

export interface SignedMessageProof {
  message: string;
  publicKeyHex: string;
  signatureHex: string;
  expectedAddress: string;
}

export type VerificationFailure =
  | 'malformed_public_key'
  | 'malformed_signature'
  | 'address_mismatch'
  | 'invalid_signature';

export function verifySignedMessage(
  proof: SignedMessageProof,
): { ok: true } | { ok: false; reason: VerificationFailure } {
  let publicKey: PublicKey;
  try {
    publicKey = PublicKey.fromHex(proof.publicKeyHex.trim());
  } catch {
    return { ok: false, reason: 'malformed_public_key' };
  }

  let signature: Signature;
  try {
    signature = Signature.fromHex(proof.signatureHex.trim());
  } catch {
    return { ok: false, reason: 'malformed_signature' };
  }

  let derived: Address;
  try {
    derived = publicKey.toAddress();
  } catch {
    return { ok: false, reason: 'malformed_public_key' };
  }

  if (normalizeAddress(derived.toUserFriendlyAddress()) !== normalizeAddress(proof.expectedAddress)) {
    return { ok: false, reason: 'address_mismatch' };
  }

  if (!publicKey.verify(signature, hashSignedMessage(proof.message))) {
    return { ok: false, reason: 'invalid_signature' };
  }

  return { ok: true };
}
