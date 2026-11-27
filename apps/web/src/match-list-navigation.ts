import { nextTick, ref, watch, type Ref } from 'vue';

type Choice = string | number;
type Scroll = { top: number; matchId?: string; href?: string; offset?: number; focus?: boolean };
type ListState = { scroll?: Scroll; choices?: Record<string, Choice> };

function listState(): ListState {
  return history.state?.matchList ?? {};
}

function updateList(state: ListState) {
  history.replaceState({ ...history.state, matchList: state }, '');
}

function matchRow(id: string) {
  return document.querySelector<HTMLElement>(`[data-match-list-id="${CSS.escape(id)}"]`);
}

function listAnchor(matchId?: string, href?: string) {
  return (matchId && matchRow(matchId)) || (href && document.querySelector<HTMLElement>(`a[href="${CSS.escape(href)}"]`)) || null;
}

export function rememberListScroll(matchId?: string, link?: HTMLAnchorElement) {
  const href = link?.getAttribute('href') || undefined;
  const row = listAnchor(matchId, href);
  const offset = row?.getBoundingClientRect().top;
  updateList({ ...listState(), scroll: { top: window.scrollY, matchId, href, offset, focus: !!row && row === document.activeElement } });
}

export function savedListScroll() {
  return listState().scroll;
}

export function useListChoice(key: string, fallback: string): Ref<string>;
export function useListChoice(key: string, fallback: number): Ref<number>;
export function useListChoice(key: string, fallback: Choice) {
  const saved = listState().choices?.[key];
  const chosen = ref(typeof saved === typeof fallback ? saved! : fallback);
  watch(chosen, value => {
    const current = listState();
    updateList({ ...current, choices: { ...current.choices, [key]: value } });
  }, { flush: 'sync' });
  return chosen;
}

export function isMatchListRoute(route: string) {
  return route === 'mis-partidos' || /^torneo\/[^/]+\/(partidos|fixture|estadisticas)(\/|$)/.test(route);
}

export async function restoreListScroll(position: Scroll | undefined, stillCurrent: () => boolean) {
  if (position === undefined) return;
  await nextTick();
  const deadline = performance.now() + 1500;
  const restore = () => {
    if (!stillCurrent()) return;
    const page = document.scrollingElement;
    const last = (page?.scrollHeight ?? 0) - (page?.clientHeight ?? 0);
    const row = listAnchor(position.matchId, position.href);
    const top = row ? window.scrollY + row.getBoundingClientRect().top - (position.offset ?? 140) : position.top;
    if (row || (!position.matchId && !position.href && last >= top) || performance.now() >= deadline) {
      window.scrollTo({ top, behavior: 'instant' });
      if (position.focus) row?.focus({ preventScroll: true });
    } else {
      window.requestAnimationFrame(restore);
    }
  };
  window.requestAnimationFrame(restore);
}

export function trackPublicListScroll(detailOpen: () => string) {
  watch(detailOpen, open => {
    const url = location.href;
    void restoreListScroll(open ? { top: 0 } : savedListScroll(), () => detailOpen() === open && location.href === url);
  });
}
