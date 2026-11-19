import { isPublicSection, publicSectionMetadata } from '@torneos/shared';

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
export function publicSectionHref(view: string) {
  return publicNavigationUrl(location.pathname, '', view);
}

export function publicMeasurementUrl(canonical: string, current: URL) {
  const page = new URL(canonical);
  if (page.origin !== current.origin || current.hash.startsWith('#/') ||
      /^\/(?:acceso|panel)(?:\/|$)/.test(current.pathname) ||
      (page.pathname !== current.pathname && !(page.pathname === '/' && current.pathname === '/index.html'))) return null;

  const { view, detail } = readPublicNavigation(current.search);
  page.search = '';
  page.hash = '';
  if (page.pathname !== '/') {
    page.searchParams.set('vista', isPublicSection(view) ? view : 'partidos');
    if (detail) page.searchParams.set('detalle', detail.kind);
  }
  return page.href;
}

let lastMeasuredPage = '';
let baseMetadata: { title: string; description: string; canonical: string; cup: string } | undefined;

export function setPublicSectionBase(title: string, description: string, canonical: string, cup: string) {
  baseMetadata = { title, description, canonical, cup };
}

function updatePublicSection(current: URL) {
  if (!baseMetadata || !publicMeasurementUrl(baseMetadata.canonical, current)) return;
  const section = current.searchParams.get('vista') || '';
  const meta = publicSectionMetadata(baseMetadata.canonical, baseMetadata.cup, section) || baseMetadata;
  document.title = meta.title;
  for (const [selector, content] of [
    ['meta[name="description"]', meta.description],
    ['meta[property="og:title"]', meta.title],
    ['meta[property="og:description"]', meta.description],
    ['meta[property="og:url"]', meta.canonical],
  ]) {
    const tag = document.head.querySelector<HTMLMetaElement>(selector);
    if (tag) tag.content = content;
  }
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical) canonical.href = meta.canonical;
}

export function measurePublicNavigation() {
  if (typeof window === 'undefined') return;
  const current = new URL(location.href);
  updatePublicSection(current);
  const track = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (!track) return;
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (!canonical) return;
  const page = publicMeasurementUrl(canonical, current);
  if (!page || page === lastMeasuredPage) return;
  lastMeasuredPage = page;
  track('event', 'page_view', {page_location: page, page_title: document.title});
}

export function pushPublicNavigation(view: string, detail: PublicDetail = null, replace = false) {
  const target = publicNavigationUrl(location.pathname, location.search, view, detail);
  if (target === `${location.pathname}${location.search}`) return;
  const fromList=!!detail&&(!replace||history.state?.alacanchaPublicDetail===true);
  history[replace ? 'replaceState' : 'pushState']({alacanchaPublicDetail:fromList}, '', target);
  if (!replace) measurePublicNavigation();
}

export function closePublicDetail(view: string) {
  if (history.state?.alacanchaPublicDetail) history.back();
  else {
    pushPublicNavigation(view,null,true);
    measurePublicNavigation();
  }
}
