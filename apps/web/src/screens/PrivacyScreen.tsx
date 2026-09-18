import { Button } from '../components/Button.js';
import type { Route } from '../routes.js';

export function PrivacyScreen({ navigate }: { navigate: (route: Route) => void }) {
  return (
    <article className="space-y-4">
      <section className="surface p-5">
        <h1 className="font-display text-2xl font-black text-navy">Privacy & data</h1>
        <p className="mt-2 text-sm text-ink">
          Nimoto keeps the minimum needed to run a fair daily competition.
        </p>
        <h2 className="mt-4 font-display text-base font-extrabold text-navy">What we store</h2>
        <ul className="mt-1 space-y-1 text-sm text-muted">
          <li>• Your Nimiq address, so scores and prizes reach the right wallet.</li>
          <li>• Your answers, timings and scores for each run.</li>
          <li>• Your streak, referral code and optional display name.</li>
          <li>• Coarse product events (for example "ranked run completed"), without IPs or device fingerprints.</li>
        </ul>
        <h2 className="mt-4 font-display text-base font-extrabold text-navy">What we never do</h2>
        <ul className="mt-1 space-y-1 text-sm text-muted">
          <li>• We never ask for your private key or seed phrase.</li>
          <li>• Signing in is a signature only — it costs nothing and moves no NIM.</li>
          <li>• We do not sell data or run third-party ad trackers.</li>
        </ul>
        <h2 className="mt-4 font-display text-base font-extrabold text-navy">Prizes</h2>
        <p className="mt-1 text-sm text-muted">
          Prizes are fixed per rank and published before you play. There is no wagering, no random payout and
          no purchase of any kind.
        </p>
      </section>
      <Button variant="ghost" full onClick={() => navigate({ name: 'home' })}>
        Back home
      </Button>
    </article>
  );
}
