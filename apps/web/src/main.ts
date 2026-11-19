import { isFixtureOverview,isPublicRoute,routeFromUrl } from './client-route.ts';
import { startFixtureReads, type FixtureStart } from './fixture-start.ts';
import '../../../packages/ui/src/styles.css';

const root = document.getElementById('app')!;
// Distinct import sites keep Vite's preload list scoped to each area.
const loadArea = {
  public: () => import('./public-entry.ts'),
  panel: () => import('./panel-entry.ts'),
};
let currentArea: 'public'|'panel'|undefined;
let areaEpoch=0;
let unmount: (() => void)|undefined;
let startingFixture: FixtureStart | undefined;

const worker = import.meta.env.PROD && 'serviceWorker' in navigator
  ? new Promise<ServiceWorkerRegistration|null>(resolve => {
      const register = () => {
        void navigator.serviceWorker.register('/sw.js')
          .then(() => navigator.serviceWorker.ready)
          .then(resolve, () => resolve(null));
      };
      if (document.readyState === 'complete') register();
      else window.addEventListener('load',register,{once:true});
    })
  : Promise.resolve(null);

function cacheVisitedAssets() {
  void worker.then(registration => {
    if (!registration?.active) return;
    const assets = new Set<string>();
    for (const entry of performance.getEntriesByType('resource')) {
      const url = new URL(entry.name);
      if (url.origin === location.origin && url.pathname.startsWith('/assets/')) assets.add(url.pathname);
    }
    registration.active.postMessage({kind:'cache-visited-assets',assets:[...assets]});
  });
}

function showCurrentArea() {
  const route = routeFromUrl(location.pathname,location.hash,root.dataset);
  const area = isPublicRoute(route) ? 'public' : 'panel';
  if (startingFixture && startingFixture.route !== route) {
    startingFixture.cancel();
    startingFixture = undefined;
  }
  if (area === currentArea) return;
  currentArea = area;
  const epoch=++areaEpoch;
  unmount?.();
  unmount = undefined;

  const wait = document.createElement('p');
  wait.className = 'small muted pad';
  wait.setAttribute('role','status');
  wait.textContent = 'Cargando…';
  root.replaceChildren(wait);

  // The browser can read the direct fixture while the organizer entry downloads.
  startingFixture = isFixtureOverview(route) ? startFixtureReads(route) : undefined;
  void loadArea[area]().then(({mount}) => {
    if (epoch !== areaEpoch) return;
    const fixture = startingFixture;
    startingFixture = undefined;
    unmount = mount(root, fixture);
    cacheVisitedAssets();
  }).catch(() => {
    if (epoch !== areaEpoch) return;
    startingFixture?.cancel();
    startingFixture = undefined;
    wait.setAttribute('role','alert');
    wait.textContent = 'No se pudo abrir esta vista. ';
    const retry = document.createElement('button');
    retry.className = 'btn';
    retry.type = 'button';
    retry.textContent = 'Reintentar';
    retry.addEventListener('click',() => location.reload());
    wait.append(retry);
    root.replaceChildren(wait);
  });
}

window.addEventListener('hashchange',showCurrentArea);
window.addEventListener('popstate',showCurrentArea);
showCurrentArea();
