import { useEffect, useState } from 'react';
import type { TodayChallengeResponse } from '@nimoto/shared';
import { api, ApiRequestError } from '../lib/api.js';
import { formatCountdown, formatNumber } from '../lib/format.js';
import { Button } from '../components/Button.js';
import { Mascot } from '../components/Mascot.js';
import { StatusMessage } from '../components/StatusMessage.js';
import { useSession } from '../state/session.js';
import type { Route } from '../routes.js';

export function HomeScreen({ navigate }: { navigate: (route: Route) => void }) {
  const { status, user, signIn, error: authError, clearError, mock } = useSession();
  const [today, setToday] = useState<TodayChallengeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .today()
      .then((data) => {
        if (cancelled) return;
        setToday(data);
        setRemaining(data.msRemaining);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setLoadError(caught instanceof ApiRequestError ? caught.message : 'Could not load today’s challenge.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!today) return undefined;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [today]);

  if (loadError) {
    return (
      <StatusMessage
        tone="error"
        title="We could not reach Nimoto"
        description={loadError}
        action={<Button onClick={() => window.location.reload()}>Try again</Button>}
      />
    );
  }

  if (!today) {
    return <StatusMessage title="Warming up today’s challenge…" description="One moment." />;
  }

  const rankedAttempt = today.me?.rankedAttempt ?? null;
  const rankedDone = rankedAttempt?.status === 'completed';
  const rankedInProgress = rankedAttempt?.status === 'started';
  const challengeOver = today.phase !== 'active' || remaining <= 0;

  return (
    <div className="space-y-4">
      <section className="surface relative overflow-hidden p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-xs font-extrabold uppercase tracking-cta text-owl">Today’s challenge</p>
            <h1 className="font-display text-3xl font-black text-navy">NIMOTO</h1>
            <p className="mt-1 text-sm text-muted">
              {today.questionCount} questions · one ranked run · Daily Brain Sprint
            </p>
          </div>
          <Mascot mood={rankedDone ? 'cheer' : 'happy'} size={84} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Prize pool" value={`${today.prizePoolNim} NIM`} accent="text-owl" />
          <Stat label="Players today" value={formatNumber(today.playersToday)} accent="text-macaw" />
          <Stat label="Your streak" value={`${today.me?.currentStreak ?? 0} 🔥`} accent="text-fox" />
          <Stat label="Resets in" value={formatCountdown(remaining)} accent="text-beetle" />
        </dl>
      </section>

      {mock ? (
        <p
          role="status"
          className="rounded-xl border-2 border-fox bg-[#fff4e0] px-3 py-2 text-center font-display text-xs font-extrabold uppercase tracking-cta text-fox"
        >
          Dev wallet — mock Nimiq provider active
        </p>
      ) : null}

      {authError ? (
        <div role="alert" className="surface border-cardinal bg-cardinal-soft p-4 text-sm">
          <p className="font-bold text-navy">{authError}</p>
          <Button variant="ghost" className="mt-3" onClick={clearError}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <section className="space-y-3">
        {status !== 'authenticated' ? (
          <Button
            full
            onClick={() => {
              void api.track('wallet_auth_started');
              void signIn();
            }}
            disabled={status === 'authenticating' || status === 'loading'}
          >
            {status === 'authenticating' ? 'Check your wallet…' : 'Connect Nimiq wallet'}
          </Button>
        ) : challengeOver ? (
          <StatusMessage
            title="Today’s run is closed"
            description="Prizes are being settled. Come back at 00:00 UTC for a fresh challenge."
            action={<Button variant="secondary" onClick={() => navigate({ name: 'leaderboard' })}>See leaderboard</Button>}
          />
        ) : rankedDone ? (
          <StatusMessage
            tone="success"
            title="Ranked run complete"
            description={`You scored ${formatNumber(rankedAttempt?.totalScore ?? 0)} points today.`}
            action={
              <Button variant="secondary" onClick={() => navigate({ name: 'leaderboard' })}>
                See where you landed
              </Button>
            }
          />
        ) : (
          <Button
            full
            onClick={() => navigate({ name: 'play', mode: 'ranked' })}
          >
            {rankedInProgress ? 'Resume today’s challenge' : 'Play today’s challenge'}
          </Button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => navigate({ name: 'play', mode: 'practice' })}>
            Practice
          </Button>
          <Button variant="ghost" onClick={() => navigate({ name: 'leaderboard' })}>
            Leaderboard
          </Button>
        </div>
        <Button variant="secondary" full onClick={() => navigate({ name: 'invite' })}>
          Invite a friend
        </Button>
      </section>

      <section className="surface p-5">
        <h2 className="font-display text-base font-extrabold text-navy">How scoring works</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {today.scoringRules.map((rule) => (
            <li key={rule}>• {rule}</li>
          ))}
        </ul>
        <h3 className="mt-4 font-display text-sm font-extrabold uppercase tracking-cta text-navy">Prizes</h3>
        <ul className="mt-1 space-y-1 text-sm text-muted">
          {today.prizeTiers.map((tier) => (
            <li key={`${tier.fromRank}-${tier.toRank}`}>
              • {tier.fromRank === tier.toRank ? `Rank ${tier.fromRank}` : `Ranks ${tier.fromRank}–${tier.toRank}`}:{' '}
              <span className="font-bold text-owl">{tier.amountNim} NIM</span>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        className="mx-auto block min-h-[44px] text-sm font-bold text-macaw underline"
        onClick={() => navigate({ name: 'privacy' })}
      >
        Privacy & data
      </button>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border-2 border-hairline p-3">
      <dt className="text-[11px] font-bold uppercase tracking-cta text-muted">{label}</dt>
      <dd className={`font-display text-lg font-black ${accent}`}>{value}</dd>
    </div>
  );
}
