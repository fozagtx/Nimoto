import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionUser } from '@/shared';
import { api, ApiRequestError, readToken, writeToken } from '../lib/api.js';
import { captureReferralFromUrl, clearReferral } from '../lib/referral.js';
import { describeWalletError, getProvider, walletFlow, WalletError } from '../lib/nimiq.js';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticating' | 'authenticated';

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  error: string | null;
  /** Which real wallet flow this page will open. */
  flow: 'mini-app' | 'hub';
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me.user);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    captureReferralFromUrl();
    if (!readToken()) {
      // A cookie session may still exist when the API shares the site.
      void refresh();
      return;
    }
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    setError(null);
    setStatus('authenticating');
    try {
      const provider = await getProvider();
      const [account] = await provider.listAccounts();
      if (!account) throw new WalletError('no_account', 'No wallet account is available.');

      const challenge = await api.authChallenge(account.address);
      const signed = await provider.signMessage(challenge.message);
      const referralCode = captureReferralFromUrl();

      const verified = await api.authVerify({
        address: signed.address,
        message: challenge.message,
        publicKey: signed.publicKey,
        signature: signed.signature,
        ...(referralCode ? { referralCode } : {}),
      });

      writeToken(verified.token);
      clearReferral();
      setUser(verified.user);
      setStatus('authenticated');
      void api.track('wallet_auth_completed');
    } catch (caught) {
      setStatus('anonymous');
      setError(
        caught instanceof ApiRequestError ? caught.message : describeWalletError(caught),
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    writeToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      error,
      flow: walletFlow(),
      signIn,
      signOut,
      refresh,
      clearError: () => setError(null),
    }),
    [status, user, error, signIn, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
