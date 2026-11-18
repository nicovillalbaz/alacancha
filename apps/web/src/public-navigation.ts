export type PublicDetail = { kind: 'partido' | 'equipo' | 'cruce'; id: string } | null;

export function readPublicNavigation(search: string) {
  const query = new URLSearchParams(search);
  const detail = (['partido', 'equipo', 'cruce'] as const)
    .map(kind => ({ kind, id: query.get(kind) || '' }))
    .find(item => item.id) || null;
  return { view: query.get('vista') || 'partidos', detail };
}

export function publicNavigationUrl(pathname: string, search: string, view: string, detail: PublicDetail = null) {
  const query = new URLSearchParams(search);
  for (const key of ['vista', 'partido', 'equipo', 'cruce']) query.delete(key);
  if (view !== 'partidos') query.set('vista', view);
  if (detail) query.set(detail.kind, detail.id);
  const suffix = query.toString();
  return `${pathname}${suffix ? `?${suffix}` : ''}`;
}

export function pushPublicNavigation(view: string, detail: PublicDetail = null, replace = false) {
  const target = publicNavigationUrl(location.pathname, location.search, view, detail);
  if (target !== `${location.pathname}${location.search}`) history[replace ? 'replaceState' : 'pushState']({alacanchaPublicDetail:!!detail}, '', target);
}

export function closePublicDetail(view: string) {
  if (history.state?.alacanchaPublicDetail) history.back();
  else pushPublicNavigation(view,null,true);
}
