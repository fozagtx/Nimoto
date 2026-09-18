import { useState } from 'react';
import type { AttemptResultResponse } from '@nimoto/shared';
import { api } from '../lib/api.js';
import { formatDuration, formatNumber, ordinal } from '../lib/format.js';
import { shareOrCopy } from '../lib/referral.js';
import { Button } from '../components/Button.js';
import { Mascot } from '../components/Mascot.js';
import type { Route } from '../routes.js';

export function ResultsPanel({
  result,
  navigate,
}: {
  result: AttemptResultResponse;
  navigate: (route: Route) => void;
}) {
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle');
  const ranked = result.mode === 'ranked';

  return (
    <div className="space-y-4">
      <section className="surface p-6 text-center">
        <div className="flex justify-center">
          <Mascot mood={result.correctCount >= 3 ? 'cheer' : 'thinking'} size={96} />
        </div>
        <p className="mt-2 font-display text-xs font-extrabold uppercase tracking-cta text-owl">
          {ranked ? 'Ranked run complete' : 'Practice run complete'}
        </p>
        <p className="font-display text-5xl font-black text-navy">{formatNumber(result.totalScore)}</p>
        <p className="mt-1 text-sm text-muted">
          {result.correctCount}/{result.questionCount} correct in {formatDuration(result.totalDurationMs)}
        </p>

        {ranked ? (
          <dl className="mt-5 grid grid-cols-3 gap-2">
            <Cell label="Rank" value={result.rank ? ordinal(result.rank) : '—'} />
            <Cell label="Players" value={formatNumber(result.playersToday)} />
            <Cell label="Streak" value={`${result.currentStreak} 🔥`} />
          </dl>
        ) : (
          <p className="mt-4 rounded-xl border-2 border-hairline p-3 text-sm text-muted">
            Practice runs never affect your rank, streak or prizes.
          </p>
        )}

        {ranked && result.prizeNim ? (
          <p className="mt-4 rounded-xl border-2 border-owl bg-owl-soft p-3 font-bold text-navy">
            On track for {result.prizeNim} NIM if this rank holds at 00:00 UTC.
          </p>
        ) : null}
      </section>

      <div className="space-y-3">
        <Button
          full
          onClick={async () => {
            void api.track('share_clicked');
            const outcome = await shareOrCopy(result.shareText, window.location.origin);
            setShareState(outcome);
          }}
        >
          Share your score
        </Button>
        {shareState !== 'idle' ? (
          <p role="status" className="text-center text-sm font-bold text-muted">
            {shareState === 'shared'
              ? 'Shared.'
              : shareState === 'copied'
                ? 'Copied to your clipboard.'
                : 'Sharing is unavailable — copy the text manually.'}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={() => navigate({ name: 'leaderboard' })}>
            Leaderboard
          </Button>
          <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-hairline p-3">
      <dt className="text-[11px] font-bold uppercase tracking-cta text-muted">{label}</dt>
      <dd className="font-display text-lg font-black text-navy">{value}</dd>
    </div>
  );
}
