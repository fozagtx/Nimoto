import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App.js';
import { setProvider, WalletError } from '../src/lib/nimiq.js';
import { installMockApi, installMockWallet } from './mock-server.js';
import { captureReferralFromUrl, readReferral } from '../src/lib/referral.js';

beforeEach(() => {
  setProvider(null);
});

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /connect nimiq wallet/i }));
  await waitFor(() => expect(screen.getByRole('button', { name: /play today/i })).toBeInTheDocument());
}

describe('Nimoto app', () => {
  it('shows the daily challenge summary before sign-in', async () => {
    installMockApi();
    installMockWallet();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'NIMOTO' })).toBeInTheDocument();
    expect(screen.getByText('90 NIM')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect nimiq wallet/i })).toBeInTheDocument();
  });

  it('signs in with the wallet and unlocks the ranked run', async () => {
    installMockApi();
    installMockWallet();
    const user = userEvent.setup();
    render(<App />);
    await signIn(user);
  });

  it('surfaces a rejected wallet signature without breaking the app', async () => {
    installMockApi();
    installMockWallet({
      signMessage: async () => {
        throw new WalletError('rejected', 'You cancelled the wallet request.');
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /connect nimiq wallet/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled the wallet request/i);
  });

  it('plays a full ranked run and shows the result with rank and streak', async () => {
    installMockApi();
    installMockWallet();
    const user = userEvent.setup();
    render(<App />);
    await signIn(user);

    await user.click(screen.getByRole('button', { name: /play today/i }));

    for (let index = 1; index <= 5; index += 1) {
      const option = await screen.findByRole('button', { name: new RegExp(`Answer A${index}`) });
      await user.click(option);
      await user.click(await screen.findByRole('button', { name: /next question|see results/i }));
    }

    expect(await screen.findByText('6,200')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();
    expect(screen.getByText('4 🔥')).toBeInTheDocument();
    expect(screen.getByText(/10 NIM/)).toBeInTheDocument();
  });

  it('renders the leaderboard with the signed-in player highlighted', async () => {
    installMockApi({ authenticated: true, answered: 0 });
    installMockWallet();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /leaderboard/i }));
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByText('You')).toBeInTheDocument();
  });

  it('copies the invite link when the share sheet is unavailable', async () => {
    installMockApi({ authenticated: true, answered: 0 });
    installMockWallet();
    const writeText = vi.fn(async (_text: string) => undefined);
    const user = userEvent.setup();
    // userEvent installs its own clipboard stub, so override it afterwards.
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /invite a friend/i }));
    await user.click(await screen.findByRole('button', { name: /share invite link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('https://nimoto.app/?ref=ABC123'));
  });
});

describe('referral capture', () => {
  it('stores a valid referral code from the URL', () => {
    expect(captureReferralFromUrl('?ref=abc123')).toBe('ABC123');
    expect(readReferral()).toBe('ABC123');
  });

  it('ignores a malformed referral code', () => {
    expect(captureReferralFromUrl('?ref=not-a-code')).toBeNull();
  });
});
