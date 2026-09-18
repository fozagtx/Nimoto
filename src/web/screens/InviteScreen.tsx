import { useEffect, useState } from 'react';
import type { ReferralSummaryResponse } from '@/shared';
import { api, ApiRequestError } from '../lib/api.js';
import { shareOrCopy } from '../lib/referral.js';
import { Button } from '../components/Button.js';
import { StatusMessage } from '../components/StatusMessage.js';
import { useSession } from '../state/session.js';
import type { Route } from '../routes.js';

export function InviteScreen({ navigate }: { navigate: (route: Route) => void }) {
  const { status } = useSession();
  const [summary, setSummary] = useState<ReferralSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status !== 'authenticated') return;
    api
      .referrals()
      .then(setSummary)
      .catch((caught: unknown) =>
        setError(caught instanceof ApiRequestError ? caught.message : 'Could not load your invite link.'),
      );
  }, [status]);

  if (status !== 'authenticated') {
    return (
      <StatusMessage
        title="Connect your wallet to invite friends"
        description="Your invite link is tied to your Nimiq address."
        action={<Button onClick={() => navigate({ name: 'home' })}>Back home</Button>}
      />
    );
  }
  if (error) {
    return <StatusMessage tone="error" title="Invite unavailable" description={error} />;
  }
  if (!summary) return <StatusMessage title="Loading your invite link…" />;

  return (
    <div className="space-y-4">
      <section className="surface p-5">
        <h1 className="font-display text-2xl font-black text-navy">Invite a friend</h1>
        <p className="mt-1 text-sm text-muted">
          A friend counts once they finish their first ranked run. You earn XP and a badge — never NIM for
          inviting.
        </p>
        <p className="mt-4 break-all rounded-xl border-2 border-hairline bg-[#fafafa] p-3 font-mono text-sm">
          {summary.link}
        </p>
        <div className="mt-4 grid gap-3">
          <Button
            full
            onClick={async () => {
              void api.track('share_clicked', { surface: 'invite' });
              setShareState(
                await shareOrCopy('Beat my Nimoto score — 5 questions, one run a day.', summary.link),
              );
            }}
          >
            Share invite link
          </Button>
          {shareState !== 'idle' ? (
            <p role="status" className="text-center text-sm font-bold text-muted">
              {shareState === 'shared'
                ? 'Shared.'
                : shareState === 'copied'
                  ? 'Link copied.'
                  : 'Could not copy — select the link above manually.'}
            </p>
          ) : null}
        </div>
      </section>

      <dl className="grid grid-cols-3 gap-2">
        <Cell label="Qualified" value={String(summary.qualifiedCount)} />
        <Cell label="Pending" value={String(summary.pendingCount)} />
        <Cell label="XP" value={String(summary.xp)} />
      </dl>

      <Button variant="ghost" full onClick={() => navigate({ name: 'home' })}>
        Back home
      </Button>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-hairline p-3 text-center">
      <dt className="text-[11px] font-bold uppercase tracking-cta text-muted">{label}</dt>
      <dd className="font-display text-xl font-black text-navy">{value}</dd>
    </div>
  );
}
