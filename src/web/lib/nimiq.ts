/**
 * The single place in the web app that talks to a Nimiq wallet provider:
 * the Nimiq Pay Mini App SDK inside Nimiq Pay, the Nimiq Hub everywhere
 * else. Both are real wallets — no simulated signer exists.
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
    override readonly cause?: unknown,
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
  readonly kind: 'mini-app' | 'hub';
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

/* ------------------------------- mini app -------------------------------- */

type MiniAppSdk = import('@nimiq/mini-app-sdk').NimiqProvider;
type MiniAppError = import('@nimiq/mini-app-sdk').ErrorResponse;

function isMiniAppError(value: unknown): value is MiniAppError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/** The SDK reports failures as a value, not a rejection. */
function unwrap<T>(value: T | MiniAppError): T {
  if (isMiniAppError(value)) {
    const { type, message } = value.error;
    const kind: WalletErrorKind = /reject|denied|cancel/i.test(`${type} ${message}`)
      ? 'rejected'
      : 'unknown';
    throw new WalletError(kind, message || 'Nimiq Pay could not complete the request.');
  }
  return value;
}

async function initMiniApp(): Promise<MiniAppSdk> {
  try {
    const { init } = await import('@nimiq/mini-app-sdk');
    const sdk = await init();
    if (!sdk.connected) await sdk.connect();
    return sdk;
  } catch (error) {
    throw new WalletError(
      'unavailable',
      'Open Nimoto inside Nimiq Pay to connect your wallet.',
      error,
    );
  }
}

async function miniAppAccounts(sdk: MiniAppSdk): Promise<WalletAccount[]> {
  const accounts = unwrap(await sdk.listAccounts());
  if (accounts.length === 0) {
    throw new WalletError('no_account', 'No wallet account is available in Nimiq Pay.');
  }
  return accounts.map((address) => ({ address }));
}

function createMiniAppProvider(sdk: MiniAppSdk): NimiqProvider {
  return {
    kind: 'mini-app',
    listAccounts: () => guard(() => miniAppAccounts(sdk)),
    signMessage: (message: string) =>
      guard(async () => {
        const signed = unwrap(await sdk.sign(message));
        // The signature carries no address, so it belongs to the active account.
        const [first] = await miniAppAccounts(sdk);
        if (!first) throw new WalletError('no_account', 'No wallet account is available.');
        return {
          message,
          address: first.address,
          publicKey: signed.publicKey,
          signature: signed.signature,
        };
      }),
    isConsensusEstablished: () => guard(() => sdk.isConsensusEstablished()),
    getBlockNumber: () => guard(() => sdk.getBlockNumber()),
    sendTransaction: (input) =>
      guard(async () => {
        const response = unwrap(
          await sdk.sendBasicTransaction({
            recipient: input.recipient,
            // The SDK expects Luna, never NIM.
            value: Number(input.valueLuna),
            ...(input.feeLuna ? { fee: Number(input.feeLuna) } : {}),
          }),
        );
        return { transactionHash: response };
      }),
  };
}

/* ---------------------------------- hub ---------------------------------- */

const HUB_APP_NAME = 'Nimoto';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hubEndpoint(): string {
  return import.meta.env.VITE_NIMIQ_HUB_URL ?? 'https://hub.nimiq.com';
}

/**
 * Nimiq Connect through the Nimiq Hub: the wallet flow for any regular
 * browser, where the Nimiq Pay webview provider does not exist. Address
 * choice and signing both open the Hub in a popup the user controls.
 */
async function createHubProvider(): Promise<NimiqProvider> {
  const { default: HubApi } = await import('@nimiq/hub-api');
  const hub = new HubApi(hubEndpoint());
  let chosen: WalletAccount | null = null;

  return {
    kind: 'hub',
    listAccounts: () =>
      guard(async () => {
        if (!chosen) {
          const result = await hub.chooseAddress({ appName: HUB_APP_NAME });
          chosen = { address: result.address, label: result.label };
        }
        return [chosen];
      }),
    signMessage: (message: string) =>
      guard(async () => {
        const signed = await hub.signMessage({
          appName: HUB_APP_NAME,
          ...(chosen ? { signer: chosen.address } : {}),
          message,
        });
        return {
          message,
          address: signed.signer,
          publicKey: toHex(signed.signerPublicKey),
          signature: toHex(signed.signature),
        };
      }),
    // The Hub signs through the user's wallet; it exposes no consensus or head
    // state to the calling site, and Nimoto only needs those for payouts.
    async isConsensusEstablished() {
      return true;
    },
    async getBlockNumber() {
      throw new WalletError('unavailable', 'Block height is not available through the Nimiq Hub.');
    },
    sendTransaction: () =>
      guard(async () => {
        throw new WalletError(
          'unavailable',
          'Sending transactions from the browser is not part of Nimoto.',
        );
      }),
  };
}

/** Nimiq Pay injects its provider before the page script runs. */
function insideNimiqPay(): boolean {
  return typeof window !== 'undefined' && Boolean(window.nimiq ?? window.nimiqPay);
}

let providerPromise: Promise<NimiqProvider> | null = null;

export function getProvider(): Promise<NimiqProvider> {
  if (!providerPromise) {
    if (insideNimiqPay()) {
      providerPromise = initMiniApp().then(createMiniAppProvider);
    } else {
      providerPromise = createHubProvider();
    }
  }
  return providerPromise;
}

/** Which wallet flow the current page will use, without initialising it. */
export function walletFlow(): 'mini-app' | 'hub' {
  return insideNimiqPay() ? 'mini-app' : 'hub';
}

/** Test seam: replaces the provider for the lifetime of the page. */
export function setProvider(provider: NimiqProvider | null): void {
  providerPromise = provider ? Promise.resolve(provider) : null;
}

export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message;
  return 'Something went wrong talking to your wallet.';
}
