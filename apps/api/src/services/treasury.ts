import { Address, KeyPair, PrivateKey, TransactionBuilder } from '@nimiq/core';
import { normalizeAddress } from '@nimoto/shared';
import type { Env } from '../env.js';
import { logger } from '../lib/logger.js';

export interface PayoutRequest {
  recipientAddress: string;
  amountLuna: bigint;
}

export interface Treasury {
  readonly enabled: boolean;
  readonly address: string | null;
  /** Sends a prize payout and returns the broadcast transaction hash. */
  send(request: PayoutRequest): Promise<{ transactionHash: string }>;
}

class DisabledTreasury implements Treasury {
  readonly enabled = false;
  readonly address = null;

  send(): Promise<{ transactionHash: string }> {
    return Promise.reject(
      new Error('Treasury is not configured: set TREASURY_PRIVATE_KEY, TREASURY_ADDRESS and NIMIQ_RPC_URL'),
    );
  }
}

const NETWORK_IDS: Record<Env['NIMIQ_NETWORK'], number> = {
  'main-albatross': 24,
  'test-albatross': 5,
};

/**
 * Signs payouts locally and broadcasts them through a Nimiq RPC node. The key
 * lives only inside this service; no route can ask it to send an arbitrary
 * transaction.
 */
class RpcTreasury implements Treasury {
  readonly enabled = true;

  constructor(
    readonly address: string,
    private readonly privateKeyHex: string,
    private readonly rpcUrl: string,
    private readonly networkId: number,
  ) {}

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) {
      throw new Error(`Nimiq RPC ${method} failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { result?: { data?: T }; error?: { message?: string } };
    if (payload.error) throw new Error(`Nimiq RPC ${method} failed: ${payload.error.message ?? 'unknown error'}`);
    if (payload.result?.data === undefined) throw new Error(`Nimiq RPC ${method} returned no data`);
    return payload.result.data;
  }

  async send({ recipientAddress, amountLuna }: PayoutRequest): Promise<{ transactionHash: string }> {
    if (amountLuna <= 0n) throw new Error('Payout amount must be positive');

    const sender = Address.fromUserFriendlyAddress(this.address);
    const recipient = Address.fromUserFriendlyAddress(recipientAddress);
    if (normalizeAddress(recipient.toUserFriendlyAddress()) === normalizeAddress(this.address)) {
      throw new Error('Refusing to pay the treasury itself');
    }

    const blockNumber = await this.rpc<number>('getBlockNumber', []);
    const transaction = TransactionBuilder.newBasic(
      sender,
      recipient,
      amountLuna,
      0n,
      blockNumber,
      this.networkId,
    );
    const keyPair = KeyPair.derive(PrivateKey.fromHex(this.privateKeyHex));
    transaction.sign(keyPair, undefined);

    const transactionHash = await this.rpc<string>('sendRawTransaction', [transaction.toHex()]);
    logger.info('payout broadcast', { recipientAddress, amountLuna: amountLuna.toString(), transactionHash });
    return { transactionHash };
  }
}

export function createTreasury(env: Env): Treasury {
  if (!env.TREASURY_PRIVATE_KEY || !env.TREASURY_ADDRESS || !env.NIMIQ_RPC_URL) {
    return new DisabledTreasury();
  }
  return new RpcTreasury(
    env.TREASURY_ADDRESS,
    env.TREASURY_PRIVATE_KEY,
    env.NIMIQ_RPC_URL,
    NETWORK_IDS[env.NIMIQ_NETWORK],
  );
}
