import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { authChallenges } from '@nimoto/db';
import { createHarness, createWallet, resetDatabase, signIn, type TestHarness } from './helpers.js';

let harness: TestHarness;

beforeAll(async () => {
  harness = await createHarness();
});
beforeEach(() => resetDatabase(harness.ctx));
afterAll(() => harness.close());

describe('wallet challenge-response auth', () => {
  it('issues a challenge and accepts a valid signature', async () => {
    const wallet = createWallet(3);
    const user = await signIn(harness, wallet);
    expect(user.address).toBe(wallet.address.replace(/ /g, ''));
    expect(user.referralCode).toMatch(/^[0-9A-Z]{6,10}$/);

    const me = await harness.request('/api/me', {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(me.status).toBe(200);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await harness.request('/api/me');
    expect(res.status).toBe(401);
  });

  it('rejects a signature from a different wallet', async () => {
    const wallet = createWallet(4);
    const attacker = createWallet(5);
    const challengeRes = await harness.request('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message } = (await challengeRes.json()) as { message: string };

    const res = await harness.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        message,
        publicKey: attacker.publicKeyHex,
        signature: attacker.sign(message),
      }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered message', async () => {
    const wallet = createWallet(6);
    const challengeRes = await harness.request('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message } = (await challengeRes.json()) as { message: string };
    const tampered = message.replace('Nonce:', 'Nonce :');

    const res = await harness.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        message: tampered,
        publicKey: wallet.publicKeyHex,
        signature: wallet.sign(tampered),
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a reused challenge', async () => {
    const wallet = createWallet(7);
    const challengeRes = await harness.request('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message } = (await challengeRes.json()) as { message: string };
    const payload = JSON.stringify({
      address: wallet.address,
      message,
      publicKey: wallet.publicKeyHex,
      signature: wallet.sign(message),
    });
    const headers = { 'content-type': 'application/json' };

    const first = await harness.request('/api/auth/verify', { method: 'POST', headers, body: payload });
    const second = await harness.request('/api/auth/verify', { method: 'POST', headers, body: payload });
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe('challenge_already_used');
  });

  it('rejects an expired challenge', async () => {
    const wallet = createWallet(8);
    const challengeRes = await harness.request('/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message } = (await challengeRes.json()) as { message: string };
    await harness.ctx.db
      .update(authChallenges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authChallenges.message, message));

    const res = await harness.request('/api/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        address: wallet.address,
        message,
        publicKey: wallet.publicKeyHex,
        signature: wallet.sign(message),
      }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('challenge_expired');
  });

  it('logs out and invalidates the session', async () => {
    const user = await signIn(harness, createWallet(9));
    const logout = await harness.request('/api/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(logout.status).toBe(200);

    const after = await harness.request('/api/me', {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(after.status).toBe(401);
  });
});
