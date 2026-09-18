import { useCallback, useEffect, useState } from 'react';
import { hashToRoute, routeToHash, type Route } from './routes.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';
import { InviteScreen } from './screens/InviteScreen.js';
import { PrivacyScreen } from './screens/PrivacyScreen.js';
import { StatusMessage } from './components/StatusMessage.js';
import { Button } from './components/Button.js';
import { ConnectWallet } from './components/ConnectWallet.js';
import { GlassTabs } from './components/GlassTabs.js';
import { SessionProvider, useSession } from './state/session.js';
import { api } from './lib/api.js';

function Shell() {
  const { status, user, signOut } = useSession();
  const [route, setRoute] = useState<Route>(() => hashToRoute(window.location.hash));
  const [online, setOnline] = useState(() => window.navigator.onLine);

  const navigate = useCallback((next: Route) => {
    window.location.hash = routeToHash(next);
    setRoute(next);
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(hashToRoute(window.location.hash));
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void api.track('app_opened');
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const needsAuth = route.name === 'play' && status !== 'authenticated';
  const navTabs = [
    { key: 'home', label: 'Play' },
    { key: 'leaderboard', label: 'Ranks' },
    { key: 'invite', label: 'Invite' },
  ] as const;
  const navKey = route.name === 'leaderboard' || route.name === 'invite' ? route.name : 'home';
  const showNav = route.name !== 'play' && status !== 'loading';

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 pb-10 pt-5">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:mb-2 focus:block focus:rounded-xl focus:border-2 focus:border-macaw focus:p-2"
      >
        Skip to content
      </a>

      <header className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="font-display text-lg font-black tracking-cta text-navy"
          onClick={() => navigate({ name: 'home' })}
        >
          NIMOTO
        </button>
        <ConnectWallet compact />
      </header>

      {!online ? (
        <p role="alert" className="rounded-xl border-2 border-fox bg-[#fff4e0] p-3 text-sm font-bold text-navy">
          You are offline. Your run will resume when the connection returns.
        </p>
      ) : null}

      {showNav ? (
        <GlassTabs
          tabs={navTabs}
          value={navKey}
          label="Sections"
          onChange={(key) => navigate({ name: key })}
        />
      ) : null}

      <main id="main" className="flex-1">
        {status === 'loading' ? (
          <StatusMessage title="Loading Nimoto…" />
        ) : needsAuth ? (
          <div className="space-y-3">
            <ConnectWallet />
            <Button variant="ghost" full onClick={() => navigate({ name: 'home' })}>
              Back home
            </Button>
          </div>
        ) : route.name === 'home' ? (
          <HomeScreen navigate={navigate} />
        ) : route.name === 'play' ? (
          <PlayScreen key={route.mode} mode={route.mode} navigate={navigate} />
        ) : route.name === 'leaderboard' ? (
          <LeaderboardScreen navigate={navigate} />
        ) : route.name === 'invite' ? (
          <InviteScreen navigate={navigate} />
        ) : (
          <PrivacyScreen navigate={navigate} />
        )}
      </main>

      <footer className="flex items-center justify-between border-t-2 border-hairline pt-3 text-xs text-muted">
        <span>Nimoto · Daily Brain Sprint</span>
        {user ? (
          <button type="button" className="min-h-[44px] font-bold text-macaw underline" onClick={() => void signOut()}>
            Sign out
          </button>
        ) : null}
      </footer>
    </div>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
