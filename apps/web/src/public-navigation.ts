import { isPublicSection, publicSectionMetadata } from '@torneos/shared/public-sections';
import { rememberListScroll } from './match-list-navigation.ts';
import { closeOwnDetail, moveWithinApp } from './navigation-entry.ts';

export type PublicDetail = { kind: 'partido' | 'equipo' | 'cruce'; id: string } | null;
export type TeamMatch = {
  kind: 'partido' | 'cruce'; id: string; home: string; away: string;
  homeEntryId?: string|null; awayEntryId?: string|null;
  date?: string | null; time?: string | null; round: string;
  status?: 'official' | 'provisional'; score?: string;
};

export function plainPublicClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

export function matchRowClicked(event: MouseEvent) {
  return plainPublicClick(event) && event.target instanceof Element && !event.target.closest('button, a');
}

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
  moveWithinApp('public', target, !!detail, {
    replaceDetail: replace || !!readPublicNavigation(location.search).detail,
    beforeOpen: () => rememberListScroll(detail?.kind === 'cruce' ? undefined : detail?.id),
    afterMove: measurePublicNavigation,
  });
}

export function closePublicDetail(view: string) {
  if (closeOwnDetail('public')) return true;
  pushPublicNavigation(view,null,true);
  return false;
}
