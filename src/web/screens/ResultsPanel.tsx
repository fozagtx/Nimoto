import { useEffect, useRef, useState } from 'react';
import type { AttemptResultResponse } from '@/shared';
import { api } from '../lib/api.js';
import { formatDuration, formatNumber, ordinal } from '../lib/format.js';
import { shareOrCopy } from '../lib/referral.js';
import {
  drawShareCard,
  renderShareCard,
  shareCardCaption,
  shareCardImage,
  tweetIntentUrl,
} from '../lib/share-card.js';
import { Button } from '../components/Button.js';
import { Mascot } from '../components/Mascot.js';
import type { Route } from '../routes.js';

const HANDLE = import.meta.env.VITE_SOCIAL_HANDLE ?? '@nimoto';

export function ResultsPanel({
  result,
  navigate,
}: {
  result: AttemptResultResponse;
  navigate: (route: Route) => void;
}) {
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'downloaded' | 'copied' | 'failed'>('idle');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ranked = result.mode === 'ranked';
  // The server-issued invite link carries the player's referral code; the
  // bare origin would hand out shares that credit nobody.
  const referralUrl = result.referralUrl || window.location.origin;
  const caption = shareCardCaption(result);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      drawShareCard(canvas, { result, referralUrl, handle: HANDLE });
    } catch {
      // Canvas-less environments simply show no preview; text sharing still works.
    }
  }, [result, referralUrl]);

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
            On track for {result.prizeNim} NIM if this rank holds at 00:00 UTC. Prizes are sent by hand — we
            reach out to winners at their wallet address.
          </p>
        ) : null}
      </section>

      <section className="surface p-4">
        <p className="mb-3 font-display text-xs font-extrabold uppercase tracking-cta text-muted">
          Your shareable card
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={caption}
          className="w-full rounded-xl border-2 border-hairline"
        />
      </section>

      <div className="space-y-3">
        <Button
          full
          onClick={async () => {
            void api.track('share_clicked');
            try {
              const blob = await renderShareCard({ result, referralUrl, handle: HANDLE });
              setShareState(await shareCardImage(blob, caption, referralUrl));
            } catch {
              setShareState(await shareOrCopy(result.shareText, referralUrl));
            }
          }}
        >
          Share your card
        </Button>
        <Button
          full
          variant="ghost"
          onClick={() => {
            void api.track('share_clicked');
            window.open(tweetIntentUrl(caption, referralUrl, HANDLE), '_blank', 'noopener');
          }}
        >
          Post on X
        </Button>
        {shareState !== 'idle' ? (
          <p role="status" className="text-center text-sm font-bold text-muted">
            {shareState === 'shared'
              ? 'Shared.'
              : shareState === 'downloaded'
                ? 'Image saved — attach it to your post.'
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
