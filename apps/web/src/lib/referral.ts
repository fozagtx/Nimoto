const REFERRAL_KEY = 'nimoto.ref';

/**
 * A referral code arrives in the URL before the wallet exists, so it is parked
 * in storage and replayed at sign-in time.
 */
export function captureReferralFromUrl(search = window.location.search): string | null {
  const code = new URLSearchParams(search).get('ref');
  if (!code) return readReferral();
  const normalized = code.trim().toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(normalized)) return readReferral();
  try {
    window.localStorage.setItem(REFERRAL_KEY, normalized);
  } catch {
    // Non-fatal: the referral simply will not survive a reload.
  }
  return normalized;
}

export function readReferral(): string | null {
  try {
    return window.localStorage.getItem(REFERRAL_KEY);
  } catch {
    return null;
  }
}

export function clearReferral(): void {
  try {
    window.localStorage.removeItem(REFERRAL_KEY);
  } catch {
    // ignored
  }
}

export async function shareOrCopy(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: 'Nimoto', text, url });
      return 'shared';
    } catch {
      // Falls through to clipboard when the share sheet is dismissed.
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
