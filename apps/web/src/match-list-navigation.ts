import { nextTick, ref, watch, type Ref } from 'vue';

type Choice = string | number;
type Scroll = { top: number; matchId?: string; offset?: number };
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

export function rememberListScroll(matchId?: string) {
  const offset = matchId ? matchRow(matchId)?.getBoundingClientRect().top : undefined;
  updateList({ ...listState(), scroll: { top: window.scrollY, matchId, offset } });
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
    const row = position.matchId ? matchRow(position.matchId) : null;
    const top = row ? window.scrollY + row.getBoundingClientRect().top - (position.offset ?? 140) : position.top;
    if (row || (!position.matchId && last >= top) || performance.now() >= deadline) {
      window.scrollTo({ top, behavior: 'instant' });
    } else {
      window.requestAnimationFrame(restore);
    }
  };
  window.requestAnimationFrame(restore);
}

export function trackPublicListScroll(detailOpen: () => boolean) {
  watch(detailOpen, open => {
    const url = location.href;
    void restoreListScroll(open ? { top: 0 } : savedListScroll(), () => detailOpen() === open && location.href === url);
  });
}
