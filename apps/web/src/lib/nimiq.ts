/**
 * The single place in the web app that talks to a Nimiq wallet provider.
 * Everything else consumes this interface, so the real Mini App SDK, the
 * development mock, and tests are interchangeable.
 */

export type WalletErrorKind =
  | 'unavailable'
  | 'rejected'
  | 'no_account'
  | 'network'
  | 'consensus'
  | 'unknown';

export class WalletError extends Error {
  constructor(
    readonly kind: WalletErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface WalletAccount {
  address: string;
  label?: string;
}

export interface SignedMessage {
  /** The exact message that was signed, byte for byte. */
  message: string;
  publicKey: string;
  signature: string;
  address: string;
}

export interface SendTransactionInput {
  recipient: string;
  /** Amount in Luna. 1 NIM = 100000 Luna. */
  valueLuna: string;
  feeLuna?: string;
}

export interface NimiqProvider {
  readonly kind: 'mini-app' | 'mock';
  listAccounts(): Promise<WalletAccount[]>;
  signMessage(message: string): Promise<SignedMessage>;
  isConsensusEstablished(): Promise<boolean>;
  getBlockNumber(): Promise<number>;
  sendTransaction(input: SendTransactionInput): Promise<{ transactionHash: string }>;
}

const REJECTION_HINTS = ['reject', 'cancel', 'denied', 'abort', 'closed'];

function classify(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  if (REJECTION_HINTS.some((hint) => lowered.includes(hint))) {
    return new WalletError('rejected', 'You cancelled the wallet request.', error);
  }
  if (lowered.includes('network') || lowered.includes('fetch') || lowered.includes('timeout')) {
    return new WalletError('network', 'The wallet could not reach the network.', error);
  }
  return new WalletError('unknown', message || 'The wallet request failed.', error);
}

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw classify(error);
  }
}

/* --------------------------------- mock ---------------------------------- */

/**
 * Deterministic provider used for local development and browser tests.
 * It is only reachable when VITE_USE_MOCK_NIMIQ is exactly "true" and the
 * build is not a production build, so it can never ship to real users.
 */
export function createMockProvider(seed = 42): NimiqProvider {
  let blockNumber = 3_500_000;

  // A deterministic throwaway key, so the mock produces signatures the real
  // API verifies. No bypass exists on the server side.
  const keyPair = async () => {
    const { KeyPair, PrivateKey } = await import('@nimiq/core');
    return KeyPair.derive(new PrivateKey(new Uint8Array(32).fill(seed)));
  };

  return {
    kind: 'mock',
    async listAccounts() {
      const pair = await keyPair();
      return [{ address: pair.publicKey.toAddress().toUserFriendlyAddress(), label: 'Dev wallet' }];
    },
    async signMessage(message: string) {
      const { Hash } = await import('@nimiq/core');
      const pair = await keyPair();
      const body = new TextEncoder().encode(message);
      const prefix = new TextEncoder().encode(`\x16Nimiq Signed Message:\n${body.length}`);
      const payload = new Uint8Array(prefix.length + body.length);
      payload.set(prefix);
      payload.set(body, prefix.length);
      return {
        message,
        address: pair.publicKey.toAddress().toUserFriendlyAddress(),
        publicKey: pair.publicKey.toHex(),
        signature: pair.sign(Hash.computeSha256(payload)).toHex(),
      };
    },
    async isConsensusEstablished() {
      return true;
    },
    async getBlockNumber() {
      blockNumber += 1;
      return blockNumber;
    },
    async sendTransaction() {
      return { transactionHash: 'ab'.repeat(32) };
    },
  };
}

export function mockEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCK_NIMIQ === 'true' && !import.meta.env.PROD;
}

/* ------------------------------- mini app -------------------------------- */

interface MiniAppSdk {
  listAccounts(): Promise<Array<{ address: string; label?: string }>>;
  sign(message: string): Promise<{ publicKey: string; signature: string; address?: string }>;
  isConsensusEstablished(): Promise<boolean>;
  getBlockNumber(): Promise<number>;
  sendBasicTransaction(input: {
    recipient: string;
    value: number;
    fee?: number;
    validityStartHeight?: number;
  }): Promise<{ transactionHash?: string; hash?: string } | string>;
}

async function initMiniApp(): Promise<MiniAppSdk> {
  try {
    const module = (await import('@nimiq/mini-app-sdk')) as unknown as {
      init: () => Promise<MiniAppSdk>;
    };
    return await module.init();
  } catch (error) {
    throw new WalletError(
      'unavailable',
      'Open Nimoto inside Nimiq Pay to connect your wallet.',
      error,
    );
  }
}

function createMiniAppProvider(sdk: MiniAppSdk): NimiqProvider {
  return {
    kind: 'mini-app',
    listAccounts: () =>
      guard(async () => {
        const accounts = await sdk.listAccounts();
        if (accounts.length === 0) {
          throw new WalletError('no_account', 'No wallet account is available in Nimiq Pay.');
        }
        return accounts.map((account) => ({
          address: account.address,
          ...(account.label ? { label: account.label } : {}),
        }));
      }),
    signMessage: (message: string) =>
      guard(async () => {
        const signed = await sdk.sign(message);
        const [first] = await sdk.listAccounts();
        const address = signed.address ?? first?.address;
        if (!address) throw new WalletError('no_account', 'No wallet account is available.');
        return { message, address, publicKey: signed.publicKey, signature: signed.signature };
      }),
    isConsensusEstablished: () => guard(() => sdk.isConsensusEstablished()),
    getBlockNumber: () => guard(() => sdk.getBlockNumber()),
    sendTransaction: (input) =>
      guard(async () => {
        const response = await sdk.sendBasicTransaction({
          recipient: input.recipient,
          // The SDK expects Luna, never NIM.
          value: Number(input.valueLuna),
          ...(input.feeLuna ? { fee: Number(input.feeLuna) } : {}),
        });
        const transactionHash =
          typeof response === 'string' ? response : (response.transactionHash ?? response.hash);
        if (!transactionHash) {
          throw new WalletError('unknown', 'The wallet did not return a transaction hash.');
        }
        return { transactionHash };
      }),
  };
}

let providerPromise: Promise<NimiqProvider> | null = null;

export function getProvider(): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = mockEnabled()
      ? Promise.resolve(createMockProvider())
      : initMiniApp().then(createMiniAppProvider);
  }
  return providerPromise;
}

/** Test seam: replaces the provider for the lifetime of the page. */
export function setProvider(provider: NimiqProvider | null): void {
  providerPromise = provider ? Promise.resolve(provider) : null;
}

export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message;
  return 'Something went wrong talking to your wallet.';
}
