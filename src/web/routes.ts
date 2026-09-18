export type Route =
  | { name: 'home' }
  | { name: 'play'; mode: 'ranked' | 'practice' }
  | { name: 'leaderboard' }
  | { name: 'invite' }
  | { name: 'privacy' };

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'play':
      return `#/play/${route.mode}`;
    case 'home':
      return '#/';
    default:
      return `#/${route.name}`;
  }
}

export function hashToRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('play/practice')) return { name: 'play', mode: 'practice' };
  if (path.startsWith('play')) return { name: 'play', mode: 'ranked' };
  if (path.startsWith('leaderboard')) return { name: 'leaderboard' };
  if (path.startsWith('invite')) return { name: 'invite' };
  if (path.startsWith('privacy')) return { name: 'privacy' };
  return { name: 'home' };
}
