import { useEffect, useState } from 'react';
import type { LeaderboardEntry, LeaderboardResponse } from '@nimoto/shared';
import { api, ApiRequestError } from '../lib/api.js';
import { formatCountdown, formatDuration, formatNumber } from '../lib/format.js';
import { Button } from '../components/Button.js';
import { StatusMessage } from '../components/StatusMessage.js';
import type { Route } from '../routes.js';

export function LeaderboardScreen({ navigate }: { navigate: (route: Route) => void }) {
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.track('leaderboard_viewed');
    api
      .leaderboard()
      .then(setBoard)
      .catch((caught: unknown) =>
        setError(caught instanceof ApiRequestError ? caught.message : 'Could not load the leaderboard.'),
      );
  }, []);

  if (error) {
    return (
      <StatusMessage
        tone="error"
        title="Leaderboard unavailable"
        description={error}
        action={<Button onClick={() => navigate({ name: 'home' })}>Back home</Button>}
      />
    );
  }
  if (!board) return <StatusMessage title="Loading today’s standings…" />;

  const outsideTop = board.me && !board.entries.some((entry) => entry.isMe) ? board.me : null;

  return (
    <div className="space-y-4">
      <header className="surface p-5">
        <h1 className="font-display text-2xl font-black text-navy">Leaderboard</h1>
        <p className="text-sm text-muted">
          {board.challengeDate} · {formatNumber(board.playersToday)} players · {board.prizePoolNim} NIM pool
        </p>
        <p className="mt-2 stat-chip border-beetle text-beetle">Resets in {formatCountdown(board.msRemaining)}</p>
      </header>

      {board.entries.length === 0 ? (
        <StatusMessage
          title="Nobody has finished yet"
          description="Be the first to complete today’s ranked run."
          action={<Button onClick={() => navigate({ name: 'play', mode: 'ranked' })}>Play now</Button>}
        />
      ) : (
        <ol className="space-y-2">
          {board.entries.map((entry) => (
            <Row key={entry.userId} entry={entry} />
          ))}
        </ol>
      )}

      {outsideTop ? (
        <>
          <p className="text-center text-sm font-bold text-muted">Your position</p>
          <Row entry={outsideTop} />
        </>
      ) : null}

      <Button variant="ghost" full onClick={() => navigate({ name: 'home' })}>
        Back home
      </Button>
    </div>
  );
}

function Row({ entry }: { entry: LeaderboardEntry }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
        entry.isMe ? 'border-macaw bg-macaw-soft' : 'border-hairline bg-white'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-hairline font-display text-sm font-black text-navy">
        {entry.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-navy">
          {entry.displayName ?? entry.walletAddressAbbreviated}
          {entry.isMe ? <span className="ml-2 text-xs uppercase tracking-cta text-macaw">You</span> : null}
        </p>
        <p className="text-xs text-muted">{formatDuration(entry.totalDurationMs)}</p>
      </div>
      <div className="text-right">
        <p className="font-display text-base font-black text-navy">{formatNumber(entry.totalScore)}</p>
        {entry.prizeNim ? <p className="text-xs font-bold text-owl">{entry.prizeNim} NIM</p> : null}
      </div>
    </li>
  );
}
