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

const publicViews = new Set(['partidos', 'fixture', 'clasificacion', 'goleadores', 'valla', 'equipos']);

export function publicMeasurementUrl(canonical: string, current: URL) {
  const page = new URL(canonical);
  if (page.origin !== current.origin || current.hash.startsWith('#/') ||
      /^\/(?:acceso|panel)(?:\/|$)/.test(current.pathname) ||
      (page.pathname !== current.pathname && !(page.pathname === '/' && current.pathname === '/index.html'))) return null;

  const { view, detail } = readPublicNavigation(current.search);
  page.search = '';
  page.hash = '';
  if (page.pathname !== '/') {
    page.searchParams.set('vista', publicViews.has(view) ? view : 'partidos');
    if (detail) page.searchParams.set('detalle', detail.kind);
  }
  return page.href;
}

let lastMeasuredPage = '';

export function measurePublicNavigation() {
  if (typeof window === 'undefined') return;
  const track = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (!track) return;
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (!canonical) return;
  const page = publicMeasurementUrl(canonical, new URL(location.href));
  if (!page || page === lastMeasuredPage) return;
  lastMeasuredPage = page;
  track('event', 'page_view', {page_location: page, page_title: document.title});
}

export function pushPublicNavigation(view: string, detail: PublicDetail = null, replace = false) {
  const target = publicNavigationUrl(location.pathname, location.search, view, detail);
  if (target === `${location.pathname}${location.search}`) return;
  history[replace ? 'replaceState' : 'pushState']({alacanchaPublicDetail:!!detail}, '', target);
  if (!replace) measurePublicNavigation();
}

export function closePublicDetail(view: string) {
  if (history.state?.alacanchaPublicDetail) history.back();
  else {
    pushPublicNavigation(view,null,true);
    measurePublicNavigation();
  }
}
