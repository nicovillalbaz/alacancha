<script setup lang="ts">
import type { AnnouncedFixture } from './announced-fixture.ts';
import { moveWithinApp, restoreAppEntry, skipDiscardedEntry } from './navigation-entry.ts';
import {computed,onMounted,onUnmounted,ref,watch} from 'vue';
import PublicDirectory from './PublicDirectory.vue';
import InstallButton from './InstallButton.vue';
import type {PublicDraw,PublicDrawLink,PublicPositionStart} from './PublicPositionPortal.vue';
import {routeFromUrl} from './client-route.ts';
import {lazyScreen} from './lazy-screen.ts';
import {measurePublicNavigation,readPublicNavigation,setPublicSectionBase} from './public-navigation.ts';
import {recordFanView} from './public-visits.ts';
import {publicPositionView,type PublicFixtureDay,type PublicPortalTournament} from './public-reads.ts';
import {publicCatalogReads} from './view-reads.ts';

const loadFanPortal = () => import('./FanPortal.vue');
const FanPortal = lazyScreen(loadFanPortal);
const loadPositionPortal = () => import('./PublicPositionPortal.vue');
const PublicPositionPortal = lazyScreen(loadPositionPortal);

interface PublicCatalogItem {id:string;name:string;public_slug:string|null;organization_id:string;organization_name:string;organization_slug:string}
interface PublicOrganizationItem {id:string;name:string;public_slug:string;has_logo:boolean;tournament_count:number;single_tournament_id:string|null;single_tournament_slug:string|null;single_tournament_position?:boolean}
interface PublicOrganization {id:string;name:string;accent:string;logo_id:string|null;public_slug:string}

class RequestError extends Error { constructor(message: string, public code = '', public status = 0) { super(message); } }
function routeFromLocation(){
  return routeFromUrl(location.pathname,location.hash,document.getElementById('app')?.dataset);
}
function setPublicPageMeta(title:string,description:string,canonical:string,image='',cup=''){
  document.title=title;
  const meta=(key:string,value:string,property=false)=>{const attribute=property?'property':'name';let element=document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);if(!element){element=document.createElement('meta');element.setAttribute(attribute,key);document.head.append(element);}element.content=value;};
  meta('description',description);meta('og:type','website',true);meta('og:title',title,true);meta('og:description',description,true);meta('og:url',canonical,true);
  let link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.append(link);}link.href=canonical;
  document.head.querySelector('meta[property="og:image"]')?.remove();
  if(image)meta('og:image',image,true);
  meta('twitter:card',image?'summary_large_image':'summary');
  setPublicSectionBase(title,description,canonical,cup);
  measurePublicNavigation();
}
const initialRoute=routeFromLocation();
const route = ref(initialRoute);
const cleanRouteCache = new Map<string,string>();
if(!location.hash.startsWith('#/'))cleanRouteCache.set(location.pathname,initialRoute);
const parts=computed(()=>route.value.split('/'));
const loading=ref(true),error=ref('');
let routeEpoch=0;
let closePublicResults:(()=>void)|null=null;
const publicTournaments = ref<PublicPortalTournament[]>([]);
const publicCatalog=ref<PublicCatalogItem[]>([]);
const publicOrganizations=ref<PublicOrganizationItem[]>([]);
const publicDraws=ref<PublicDraw[]>([]);
const publicAnnouncedFixtures=ref<Record<string,AnnouncedFixture>>({});
const publicDrawMenu=ref<PublicDrawLink[]>([]);
const publicPositionStart=ref<PublicPositionStart|null>(null);
const publicResultsRevision=ref(0);
const publicTournament=computed(()=>publicTournaments.value.find(item=>item.id===parts.value[2])||null);
const publicFixture = ref<PublicFixtureDay[]>([]);
const publicOrganization = ref<PublicOrganization | null>(null);
const publicTeams = ref<Array<{ id: string; entry_id:string; name: string; color: string; has_shield: boolean; category_id: string }>>([]);

function focusContent(){document.querySelector<HTMLElement>('#contenido')?.focus();}

function go(path: string, preferredAlias = '') {
  const target=path==='publico'?'/':(()=>{const [,organizationId,tournamentId]=path.split('/');const alias=preferredAlias||publicCatalog.value.find(item=>item.id===tournamentId)?.public_slug||publicOrganizations.value.find(item=>item.id===organizationId&&item.single_tournament_id===tournamentId)?.single_tournament_slug;if(alias)return `/${alias}`;const slug=publicOrganization.value?.id===organizationId?publicOrganization.value.public_slug:publicOrganizations.value.find(item=>item.id===organizationId)?.public_slug||publicCatalog.value.find(item=>item.organization_id===organizationId)?.organization_slug;return slug?`/${slug}${tournamentId?`/${tournamentId}`:''}`:`/#/${path}`;})();
  if(target===location.pathname+location.search+location.hash&&route.value===path){window.scrollTo(0,0);return;}
  if(!target.includes('#/'))cleanRouteCache.set(target,path);
  moveWithinApp('public', target, false, { afterMove: () => { route.value=path; window.scrollTo(0,0); } });
}
function openPublicOrganization(id:string){const item=publicOrganizations.value.find(row=>row.id===id);go(item?.tournament_count===1&&item.single_tournament_id?`publico/${id}/${item.single_tournament_id}`:`publico/${id}`,item?.single_tournament_slug||'');}

async function api<T>(path:string):Promise<T>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(`/api/v1${path}`,{credentials:'omit',signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw new RequestError(data.message||'No se pudo abrir esta pantalla.',data.code,response.status);
    return data;
  }catch(cause){
    if(cause instanceof RequestError)throw cause;
    throw new RequestError('No hay respuesta del servidor. Podés volver a intentar.','NETWORK_ERROR');
  }finally{clearTimeout(timeout);}
}
function publicCatalogRead<T>(group: string,path: string) {
  return publicCatalogReads.read<T>(group,path,()=>api<T>(path));
}

async function loadView(){
  const epoch=++routeEpoch;
  const viewParts=[...parts.value];
  error.value='';
  loading.value=true;
  closePublicResults?.();
  closePublicResults=null;
  try{
    if (parts.value[0] === 'portal') {
      const selected=await publicCatalogRead<{kind:'organization'|'tournament';organization_id:string;tournament_id?:string;tournament_count?:number;single_tournament_id?:string|null;single_tournament_slug?:string|null}>('resolve',`/public/resolve/${encodeURIComponent(viewParts[1]||'')}`);
      if(epoch!==routeEpoch)return;
      const tournamentId=selected.kind==='tournament'?selected.tournament_id||'':viewParts[2]||(selected.tournament_count===1?selected.single_tournament_id||'':'');
      if(selected.kind==='organization'&&!viewParts[2]&&tournamentId&&selected.single_tournament_slug)history.replaceState(null,'',`/${selected.single_tournament_slug}`);
      const resolvedRoute=`publico/${selected.organization_id}${tournamentId?`/${tournamentId}`:''}`;
      cleanRouteCache.set(location.pathname,resolvedRoute);
      route.value=resolvedRoute;
      return;
    }
    if (parts.value[0] === 'publico') {
      const samePositionOrganization=publicOrganization.value?.id===viewParts[1];
      const knownDraw=samePositionOrganization&&publicDrawMenu.value.some(item=>item.tournament_id===viewParts[2]);
      publicOrganization.value = null; publicTournaments.value = []; publicTeams.value = []; publicFixture.value = []; publicDraws.value=[];publicDrawMenu.value=[];publicPositionStart.value=null;publicAnnouncedFixtures.value={};
      if(!viewParts[1]){publicOrganizations.value=[];const organizations=await publicCatalogRead<PublicOrganizationItem[]>('catalog','/public/organizations');if(epoch!==routeEpoch)return;publicOrganizations.value=organizations;setPublicPageMeta('A la cancha · Torneos','Encontrá organizaciones, torneos, partidos, resultados y estadísticas.',`${location.origin}/`);recordFanView();return;}
      const organizationId=viewParts[1];
      const tournamentId=viewParts[2];
      const fixturePath = `/public/organizations/${organizationId}/fixture?resumen=1${tournamentId ? `&torneo=${tournamentId}` : ''}`;
      const announcedPath = (category: string) => `/public/organizations/${organizationId}/categories/${category}/fixture/announced`;
      const mount = document.getElementById('app')?.dataset;
      const canUseHints = !!tournamentId && mount?.publicPath === location.pathname &&
        mount.publicOrganizationId === organizationId && mount.publicTournamentId === tournamentId;
      const fixtureRequest = canUseHints && mount?.publicFixture === '1'
        ? api<PublicFixtureDay[]>(fixturePath).catch(() => null) : null;
      const announcedRequests = new Map((canUseHints ? mount?.publicAnnouncedCategories?.split(',') || [] : []).map(id =>
        [id, api<AnnouncedFixture>(announcedPath(id)).catch(() => null)]));
      const drawPath = `/public/organizations/${organizationId}/draws`;
      const drawGroup = `draws/${organizationId}`;
      const needsDraws = !canUseHints || mount?.publicDraws !== '0';
      if (!needsDraws) void loadFanPortal().catch(() => {});
      type PositionPage={organization:PublicOrganization;draw:PublicDraw;menu:PublicDrawLink[];section:PublicPositionStart['section']|null};
      let positionPage:PositionPage|null=null;
      const directoryDraw=publicOrganizations.value.some(item=>item.id===organizationId&&item.single_tournament_id===tournamentId&&item.single_tournament_position);
      if(tournamentId&&(knownDraw||directoryDraw||(canUseHints&&mount?.publicPosition==='1'))){
        void loadPositionPortal().catch(()=>{});
        const navigation=readPublicNavigation(location.search);
        const view=publicPositionView(navigation.view,navigation.detail?.kind==='partido');
        try{
          const data=await api<PositionPage>(`${drawPath}?torneo=${tournamentId}&vista=${view}`);
          if(data.draw)positionPage=data;
        }catch(cause){
          if(!(cause instanceof RequestError)||cause.status!==404)throw cause;
        }
      }
      if(epoch!==routeEpoch)return;
      const [result,draws]:[{organization:PublicOrganization;tournaments:PublicPortalTournament[];teams:typeof publicTeams.value},PublicDraw[]]=positionPage
        ? [{organization:positionPage.organization,tournaments:[],teams:[]},[positionPage.draw]]
        : await Promise.all([
          publicCatalogRead<{ organization: PublicOrganization; tournaments: PublicPortalTournament[]; teams: typeof publicTeams.value }>('catalog',`/public/organizations/${organizationId}/tournaments?portal=1&resumen=1`),
          needsDraws ? publicCatalogRead<PublicDraw[]>(drawGroup,drawPath) : Promise.resolve([]),
        ]);
      if(epoch!==routeEpoch)return;
      publicDraws.value=draws;
      const drawMenu=positionPage?.menu||draws;
      publicDrawMenu.value=drawMenu;
      if(positionPage?.section)publicPositionStart.value={
        categoryId:positionPage.draw.category_id,drawRevision:positionPage.draw.revision,resultsRevision:publicResultsRevision.value,section:positionPage.section,
      };
      publicCatalog.value=[...new Map([...result.tournaments.map(item=>[item.id,{id:item.id,name:item.name,public_slug:item.public_slug||null,organization_id:organizationId,organization_name:result.organization.name,organization_slug:result.organization.public_slug}] as const),...drawMenu.map(item=>[item.tournament_id,{id:item.tournament_id,name:item.tournament_name,public_slug:item.public_slug||null,organization_id:organizationId,organization_name:result.organization.name,organization_slug:result.organization.public_slug}] as const)].map(item=>[item[0],item[1]])).values()];
      if(tournamentId&&!result.tournaments.some(item=>item.id===tournamentId)&&!draws.some(item=>item.tournament_id===tournamentId))throw new RequestError('Este torneo todavía no está publicado.','NOT_FOUND',404);
      const positionPortal=draws.length>0&&(tournamentId?draws.some(item=>item.tournament_id===tournamentId):!result.tournaments.length);
      const visibleRows=result.tournaments.filter(item=>!tournamentId||item.id===tournamentId);
      const previewOnly=!positionPortal&&visibleRows.length>0&&visibleRows.every(item=>item.presentation_only);
      const announcedCandidates=positionPortal?[]:visibleRows.filter(item=>item.has_announced_fixture);
      const [published,announced]=await Promise.all([
        positionPortal||previewOnly?Promise.resolve([]):(async()=>(await fixtureRequest)??api<PublicFixtureDay[]>(fixturePath))(),
        Promise.allSettled(announcedCandidates.map(async item=>(await announcedRequests.get(item.category_id))??api<AnnouncedFixture>(announcedPath(item.category_id)))),
      ]);
      if(epoch!==routeEpoch)return;
      publicOrganization.value = result.organization; publicTournaments.value = tournamentId?result.tournaments.filter(item=>item.id===tournamentId):result.tournaments; publicTeams.value = result.teams.filter(team=>publicTournaments.value.some(item=>item.category_id===team.category_id));
      publicFixture.value = published;
      publicAnnouncedFixtures.value=Object.fromEntries(announcedCandidates.flatMap((item,index)=>announced[index].status==='fulfilled'?[[item.category_id,announced[index].value]]:[]));
      const publicName=tournamentId?(publicTournament.value?.name||draws.find(item=>item.tournament_id===tournamentId)?.tournament_name):(result.organization as unknown as {name:string}|null)?.name||'Torneos';
      const title=tournamentId?`${publicName} · ${result.organization.name}`:`${publicName} · Torneos`;
      const description=tournamentId&&previewOnly?`Conocé los equipos y la información publicada de ${publicName}.`:tournamentId?`Partidos, fixture, clasificación y goleadores de ${publicName}.`:`Torneos, partidos, resultados y estadísticas de ${publicName}.`;
      const alias=tournamentId?publicCatalog.value.find(item=>item.id===tournamentId)?.public_slug:null;
      const canonical=`${location.origin}${alias?`/${alias}`:`/${result.organization.public_slug}${tournamentId?`/${tournamentId}`:''}`}`;
      const hasEmblem=publicTournament.value?.has_emblem&&(publicTournament.value.status==='published'||publicTournament.value.presentation_only)||draws.some(item=>item.tournament_id===tournamentId&&item.has_emblem);
      const image=hasEmblem?`${location.origin}/api/v1/public/organizations/${result.organization.id}/tournaments/${tournamentId}/emblem`:result.organization.logo_id?`${location.origin}/api/v1/public/organizations/${result.organization.id}/logo`:'';
      setPublicPageMeta(title,description,canonical,image,tournamentId ? publicName || '' : '');
      if(location.hash.startsWith('#/publico/')){history.replaceState(null,'',canonical);cleanRouteCache.set(new URL(canonical).pathname,route.value);measurePublicNavigation();}
      if(!tournamentId)recordFanView();
      const currentPublicView=()=>epoch===routeEpoch&&parts.value[0]==='publico'&&parts.value[1]===organizationId&&parts.value[2]===tournamentId;
      let updatingResults = false, refreshAgain = false;
      async function refreshResults() {
        if (!currentPublicView()) return;
        if (updatingResults) { refreshAgain = true; return; }
        updatingResults = true;
        try {
          do {
            refreshAgain = false;
            const days = await api<PublicFixtureDay[]>(fixturePath);
            if (currentPublicView()) publicFixture.value = days;
          } while (refreshAgain && currentPublicView());
        } catch { /* Una desconexión posterior volverá a pedir el calendario. */ }
        finally { updatingResults = false; }
      }
      const refreshDraws=()=>{
        publicCatalogReads.invalidate(drawGroup);
        void publicCatalogRead<PublicDraw[]>(drawGroup,drawPath).then(latest=>{
        if(!currentPublicView())return;
        if(latest.some(item=>(publicDraws.value.find(current=>current.category_id===item.category_id)?.revision||0)>item.revision))return;
        publicDraws.value=latest;
        publicDrawMenu.value=latest;
      }).catch(()=>{});};
      let streamReady=false,streamInterrupted=false;
      if(!previewOnly){
        let stream:EventSource|null=null;
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const queueRefresh = () => {
          if (refreshTimer) return;
          refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            if (!currentPublicView()) return;
            publicResultsRevision.value++;
            if (!positionPortal) void refreshResults();
          }, 60);
        };
        const relevant = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            return !tournamentId || !data.tournamentId || data.tournamentId === tournamentId;
          } catch { return true; }
        };
        const syncPublicStream = () => {
          if (document.hidden || !navigator.onLine) {
            if (stream) {
              stream.close();
              stream = null;
              streamInterrupted = true;
            }
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = undefined;
            return;
          }
          if (stream || !currentPublicView()) return;
          const source = new EventSource(`/api/v1/public/organizations/${organizationId}/results/stream`);
          stream = source;
          source.addEventListener('result',event=>{if(stream===source && relevant(event))queueRefresh();});
          source.addEventListener('fixture',event=>{if(stream===source && relevant(event))queueRefresh();});
          source.addEventListener('draw',()=>{if(stream===source)refreshDraws();});
          source.addEventListener('error',()=>{if(stream===source)streamInterrupted=true;});
          source.addEventListener('ready',event=>{
            if (stream !== source) return;
            if (streamReady || streamInterrupted) {
              queueRefresh();
              refreshDraws();
            } else {
              try {
                const revisions = JSON.parse(event.data).draws as {categoryId:string;revision:number}[] | undefined;
                if (revisions && (revisions.length!==publicDrawMenu.value.length || revisions.some(row => (publicDrawMenu.value.find(item=>item.category_id===row.categoryId)?.revision||0)<row.revision))) refreshDraws();
              } catch { /* Las publicaciones nuevas llegan por el evento draw. */ }
            }
            streamReady=true;streamInterrupted=false;
          });
        };
        document.addEventListener('visibilitychange',syncPublicStream);
        window.addEventListener('online',syncPublicStream);
        window.addEventListener('offline',syncPublicStream);
        closePublicResults = () => {
          document.removeEventListener('visibilitychange',syncPublicStream);
          window.removeEventListener('online',syncPublicStream);
          window.removeEventListener('offline',syncPublicStream);
          stream?.close();
          stream = null;
          if (refreshTimer) clearTimeout(refreshTimer);
        };
        syncPublicStream();
      }
      return;
    }
  }catch(cause){
    if(epoch===routeEpoch)error.value=cause instanceof Error?cause.message:'No se pudo abrir esta pantalla.';
  }finally{
    if(epoch===routeEpoch)loading.value=false;
  }
}

const routeChanged = () => {
  restoreAppEntry('public');
  if(location.hash==='#/publico')history.replaceState(null,'','/');
  const nextRoute = location.hash.startsWith('#/')?routeFromLocation():cleanRouteCache.get(location.pathname)||routeFromLocation();
  if(nextRoute===route.value && nextRoute.startsWith('publico'))measurePublicNavigation();
  route.value = nextRoute;
};
watch(route,()=>{void loadView();window.scrollTo(0,0);});
onMounted(()=>{
  window.addEventListener('hashchange',routeChanged);
  window.addEventListener('popstate',routeChanged);
  window.addEventListener('popstate',skipDiscardedEntry,true);
  window.addEventListener('pageshow',routeChanged);
  const mountedRoute=route.value;
  routeChanged();
  if(route.value===mountedRoute)void loadView();
});
onUnmounted(()=>{
  routeEpoch++;
  closePublicResults?.();
  window.removeEventListener('hashchange',routeChanged);
  window.removeEventListener('popstate',routeChanged);
  window.removeEventListener('popstate',skipDiscardedEntry,true);
  window.removeEventListener('pageshow',routeChanged);
});
</script>

<template>
  <a class="skip" href="#contenido" @click.prevent="focusContent">Ir al contenido</a>
  <main id="contenido" tabindex="-1" class="fan-main">
    <div class="fan-host">
      <template v-if="parts[0] === 'publico' && !parts[1]">
        <PublicDirectory :organizations="publicOrganizations" :loading="loading" :error="error" @select="openPublicOrganization" @select-tournament="(organizationId, tournamentId, slug) => go(`publico/${organizationId}/${tournamentId}`, slug || '')" />
      </template>
      <template v-else-if="parts[0] === 'publico'">
        <div v-if="!publicOrganization && !error" class="fan-status" role="status">Cargando torneo…</div>
        <PublicPositionPortal v-if="publicDraws.length && (parts[2] ? publicDraws.some(item=>item.tournament_id===parts[2]) : !publicTournaments.length)" :organization="publicOrganization" :draws="publicDraws" :menu="publicDrawMenu" :startup="publicPositionStart" :selected-tournament-id="parts[2]||''" :results-revision="publicResultsRevision" @navigate="go" />
        <FanPortal v-else-if="publicOrganization || error" :catalog="publicCatalog" :organization="publicOrganization" :selected-tournament-id="parts[2]||''" :tournaments="publicTournaments" :fixture="publicFixture" :announced-fixtures="publicAnnouncedFixtures" :teams="publicTeams" :results-revision="publicResultsRevision" :loading="loading" :error="error" @navigate="go" />
      </template>
      <template v-else><p v-if="error" role="alert">{{ error }} <a href="/">Organizaciones</a></p><p v-else role="status">Abriendo…</p></template>
    </div>
    <footer v-if="parts[0] === 'publico'" class="public-credit">Desarrollado por NAVZ <a href="tel:+595972995557">+595972995557</a></footer>
  </main>
  <InstallButton />
</template>
