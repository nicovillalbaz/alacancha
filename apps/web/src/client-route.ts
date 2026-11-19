type PublicMount = { publicOrganizationId?: string; publicPath?: string; publicTournamentId?: string };

export function routeFromUrl(pathname: string, hash: string, mount?: PublicMount) {
  if (hash.startsWith('#/')) return hash.slice(2);
  const segments=pathname.split('/').filter(Boolean);
  if (!segments.length) return 'publico';
  if (segments.length===1 && ['acceso','panel'].includes(segments[0])) return segments[0];
  if (segments[0]==='panel') return segments.slice(1).join('/');
  if (mount?.publicOrganizationId && mount.publicPath===pathname && segments.length<=2)
    return `publico/${mount.publicOrganizationId}${mount.publicTournamentId?`/${mount.publicTournamentId}`:''}`;
  if (segments.length<=2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[0]) && (!segments[1] || /^[0-9a-f-]{36}$/i.test(segments[1])))
    return `portal/${segments.join('/')}`;
  return 'publico';
}

export function cleanLegacyHash(hash: string) {
  if (!hash.startsWith('#/')) return null;
  const path=hash.slice(2),section=path.split('/')[0];
  if (path==='publico') return '/';
  if (['acceso','panel'].includes(path)) return `/${path}`;
  if (['invitacion','recuperacion','publico'].includes(section)) return null;
  return `/panel/${path}`;
}

export function isPublicRoute(route: string) {
  const area = route.split('/',1)[0];
  return area === 'publico' || area === 'portal';
}

export function isFixtureOverview(route: string) {
  return /^torneo\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\/fixture$/i.test(route);
}
