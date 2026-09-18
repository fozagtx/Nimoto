import { abbreviateAddress } from '@/shared';
import { Button } from './Button.js';
import { api } from '../lib/api.js';
import { useErrorShake, useTextSwap } from '../lib/motion.js';
import { useSession } from '../state/session.js';

const FLOW_LABEL = {
  'mini-app': 'Nimiq Pay wallet',
  hub: 'Nimiq Hub · browser wallet',
} as const;

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V9h1.5A1.5 1.5 0 0 1 22 10.5v5A1.5 1.5 0 0 1 20.5 17H19v1.5A2.5 2.5 0 0 1 16.5 21h-11A2.5 2.5 0 0 1 3 18.5v-11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16.5" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
}

/**
 * The single entry point to a real Nimiq wallet. Inside Nimiq Pay it opens the
 * Mini App wallet; in any other browser it opens Nimiq Hub Connect.
 */
export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { status, user, flow, signIn, error, clearError } = useSession();
  const busy = status === 'authenticating';
  const idleLabel = compact ? 'Connect wallet' : 'Connect Nimiq wallet';
  const swap = useTextSwap(busy ? (compact ? 'Confirming…' : 'Confirm in your wallet…') : idleLabel);
  const shakeRef = useErrorShake(error);

  const connect = () => {
    clearError();
    void api.track('wallet_auth_started');
    void signIn();
  };

  if (status === 'authenticated' && user) {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-xl border-2 border-owl bg-owl-soft px-3 py-2 ${
          compact ? '' : 'w-full justify-center'
        }`}
      >
        <span className="text-owl">
          <WalletIcon />
        </span>
        <span className="font-display text-xs font-extrabold text-navy">
          {abbreviateAddress(user.walletAddress)}
        </span>
        <span className="sr-only">Connected with {FLOW_LABEL[flow]}</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div ref={shakeRef} className="t-input inline-flex rounded-xl">
        <Button
          className="min-h-[40px] px-3 py-2 text-xs"
          onClick={connect}
          disabled={busy || status === 'loading'}
        >
          <WalletIcon />
          <span ref={swap.ref} className="t-text-swap">
            {swap.label}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div ref={shakeRef} className="t-input surface border-navy p-5 text-center">
      <p className="font-display text-xs font-extrabold uppercase tracking-cta text-muted">
        {FLOW_LABEL[flow]}
      </p>
      <h2 className="mt-1 font-display text-xl font-black text-navy">Connect your Nimiq wallet</h2>
      <p className="mt-1 text-sm text-muted">
        You sign a one-time message to prove the address is yours. Nimoto never asks for your keys.
      </p>
      <Button full className="mt-4" onClick={connect} disabled={busy || status === 'loading'}>
        <WalletIcon />
        <span ref={swap.ref} className="t-text-swap">
          {swap.label}
        </span>
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-cardinal">
          {error}
        </p>
      ) : null}
    </div>
  );
}
