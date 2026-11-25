type Area = 'panel' | 'public';
type Detail = { area: Area; origin: string; discardedTo?: string };
type Entry = { appDetail?: Detail; matchList?: { choices?: Record<string, unknown> } };

let afterBack: (() => void) | undefined;
let nextBase: { target: string; area: Area } | undefined;

export function currentAddress() {
  return location.pathname + location.search + location.hash;
}

export function detailOrigin(area: Area) {
  const detail = (history.state as Entry | null)?.appDetail;
  return detail?.area === area && !detail.discardedTo ? detail.origin : undefined;
}

function replaceBase(target: string, area: Area) {
  const sameTournament = area === 'public' && target.split(/[?#]/,1)[0] === location.pathname &&
    !history.state?.appDetail;
  const choices = (history.state as Entry | null)?.matchList?.choices;
  history.replaceState(sameTournament && choices ? { matchList: { choices } } : null, '', target);
}

function resolveBack() {
  window.removeEventListener('popstate', resolveBack, true);
  const destination = nextBase, callback = afterBack;
  afterBack = undefined;
  nextBase = undefined;
  if (destination && destination.target !== currentAddress()) replaceBase(destination.target, destination.area);
  callback?.();
}

export function moveWithinApp(
  area: Area, target: string, detail: boolean,
  options: { replaceDetail?: boolean; beforeOpen?: () => void; afterMove?: () => void } = {},
) {
  if (nextBase) {
    nextBase = { area, target };
    afterBack = options.afterMove;
    return;
  }
  if (target === currentAddress()) return;
  const origin = detailOrigin(area);
  if (detail) {
    if (origin || options.replaceDetail) history.replaceState(history.state, '', target);
    else {
      options.beforeOpen?.();
      history.pushState({ appDetail: { area, origin: currentAddress() } }, '', target);
    }
  } else if (origin) {
    history.replaceState({ ...history.state, appDetail: { area, origin, discardedTo: target } }, '');
    nextBase = { target, area };
    afterBack = options.afterMove;
    window.addEventListener('popstate', resolveBack, { capture: true, once: true });
    history.back();
    return;
  } else {
    replaceBase(target, area);
  }
  options.afterMove?.();
}

export function closeOwnDetail(area: Area) {
  if (!detailOrigin(area)) return false;
  history.back();
  return true;
}

export function restoreAppEntry(area: Area) {
  const detail = (history.state as Entry | null)?.appDetail;
  if (detail?.area === area && detail.discardedTo) replaceBase(detail.discardedTo, area);
}

export function skipDiscardedEntry(event: PopStateEvent) {
  const detail = (event.state as Entry | null)?.appDetail;
  if (!detail?.discardedTo) return;
  event.stopImmediatePropagation();
  history.back();
}

const panelDetails = new Set([
  'acceso-administrador', 'acta-equipo', 'administrador', 'disciplina', 'equipo',
  'estado-organizacion', 'fixture', 'flyer-settings', 'flyers', 'invitar', 'jugador',
  'nueva-organizacion', 'nueva-categoria', 'nuevo-equipo', 'nuevo-jugador', 'nuevo-torneo', 'organizacion',
  'partido', 'planilla', 'programar', 'categoria', 'recuperar',
]);

export function isPanelDetail(path: string) {
  const [area, , tab, detail] = path.split('/');
  return panelDetails.has(area) || (area === 'torneo' && !!detail && ['fixture', 'pagos'].includes(tab));
}
