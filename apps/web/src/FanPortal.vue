<script setup lang="ts">
import {computed,defineAsyncComponent,nextTick,onMounted,onUnmounted,ref,watch} from 'vue';
import {knockoutRoundName,type PlannedRound} from '@torneos/shared/competition';
import Icon from './Icon.vue';
import PublicImage from './PublicImage.vue';
import SportTabs from './SportTabs.vue';
import PublicFlyers from './PublicFlyers.vue';
import TeamCrest from './TeamCrest.vue';
import PublicTeamRoster from './PublicTeamRoster.vue';
import PublicScoreGoals from './PublicScoreGoals.vue';
import AnnouncedFixtureMatches from './AnnouncedFixtureMatches.vue';
import {closePublicDetail,pushPublicNavigation,readPublicNavigation,publicSectionHref} from './public-navigation.ts';
import {trackPublicListScroll} from './match-list-navigation.ts';
import {recordFanView} from './public-visits.ts';
import {createPublicReads,type PublicFixtureDay,type PublicFixtureMatchSummary,type PublicPortalTournament} from './public-reads.ts';

const BracketView=defineAsyncComponent(()=>import('./BracketView.vue'));
const PublicMatchTimeline=defineAsyncComponent(()=>import('./PublicMatchTimeline.vue'));

type FanEvent={id:string;kind:string;side:'home'|'away'|'unknown';period:string|null;minute:number|null;cardLabel:string|null;cardColor:string|null;name:string;relatedName:string|null};
type FanMatch=PublicFixtureMatchSummary;
type FanDay=PublicFixtureDay;
type FanMatchDetail={id:string;venue_name:string|null;result:{events:FanEvent[]}|null};
type FanTeam={id:string;entry_id:string;name:string;color:string;has_shield:boolean;category_id:string};
type FanBracket={phase_id:string;category_id:string;repechage?:boolean;slots:Array<{stage:number;slot:number;home:string;away:string;twoLegs?:boolean;homeScore?:number|null;awayScore?:number|null;scoreLabel?:string|null;winnerSide?:'home'|'away'|null;resolution?:'aggregate'|'match_points_penalties'|'match_points_third';matchId?:string|null;matchIds?:{first:string|null;second:string|null;third:string|null};legs?:Array<{label:string;home:number;away:number;matchId?:string|null}>;shootout?:{home:number;away:number}|null}>};
type FanStats={available:boolean;phaseMode?:string|null;tables?:Array<{groupNo:number|null;rows:Array<{position:number;unresolved:boolean;teamName:string;played:number;wins:number;draws:number;losses:number;points:number;goalsFor:number;goalsAgainst:number;goalDifference:number}>}>;scorers?:Array<{name:string;teamName:string;goals:number}>;defense?:Array<{teamName:string;played:number;goalsAgainst:number}>;rosters?:Array<{entryId:string;players:Array<{name:string;goals:number;yellowCards:number;redCards:number}>}>};
type CatalogItem={id:string;name:string;organization_id:string;organization_name:string};
type FanTournament=PublicPortalTournament;
type AnnouncedFixture={revision:number;rounds:Array<{ordinal:number;matches:Array<{homeEntryId:string;awayEntryId:string}>}>;qualificationCount:number;quarterPairing:'in_person_draw';semifinalPairing:'pending'|'in_person_draw'|'bracket';finalPairing:'winners';teams:Array<{entry_id:string;team_id:string;name:string;color:string;has_shield:boolean}>};
const props=defineProps<{catalog:CatalogItem[];organization:{id:string;name:string;logo_id?:string|null}|null;selectedTournamentId:string;tournaments:FanTournament[];fixture:FanDay[];announcedFixtures:Record<string,AnnouncedFixture>;teams:FanTeam[];resultsRevision:number;loading:boolean;error:string}>();
const emit=defineEmits<{navigate:[path:string]}>();
const tabToView:Record<string,string>={matches:'partidos',announced:'fixture',standings:'clasificacion',scorers:'goleadores',defense:'valla',teams:'equipos'};
const viewToTab=Object.fromEntries(Object.entries(tabToView).map(([key,value])=>[value,key]));
let restoringNavigation=false,restoreEpoch=0;
onMounted(()=>{document.documentElement.classList.add('fan-scroll');restorePublicLocation();window.addEventListener('popstate',restorePublicLocation);});
onUnmounted(()=>{document.documentElement.classList.remove('fan-scroll');window.removeEventListener('popstate',restorePublicLocation);});
const tab=ref(viewToTab[readPublicNavigation(location.search).view]||'matches'),matchesView=ref<'days'|'bracket'>('days'),standingsView=ref<'league'|'bracket'>('league'),categoryId=ref(''),announcedRound=ref(1),announcedView=ref<'rounds'|'finals'>('rounds'),selectedMatch=ref<FanMatch|null>(null),selectedAnnouncedMatch=ref<{ordinal:number;homeEntryId:string;awayEntryId:string}|null>(null),selectedTeam=ref<FanTeam|null>(null),selectorOpen=ref(!props.selectedTournamentId),tournamentSearch=ref('');
const currentTournament=computed(()=>props.tournaments.find(item=>item.id===props.selectedTournamentId)||null);
const categories=computed(()=>props.tournaments.filter(item=>item.id===props.selectedTournamentId));
const category=computed(()=>categories.value.find(item=>item.category_id===categoryId.value)||categories.value[0]||null);
const currentCategoryId=computed(()=>category.value?.category_id||'');
const announced=computed(()=>props.announcedFixtures[currentCategoryId.value]);
const announcedMode=computed(()=>!!announced.value&&!props.fixture.some(day=>day.matches.some(match=>match.category_id===currentCategoryId.value)));
const announcedStandings=computed(()=>[...(announced.value?.teams||[])].sort((a,b)=>a.name.localeCompare(b.name,'es')));
const announcedHome=computed(()=>announced.value?.teams.find(team=>team.entry_id===selectedAnnouncedMatch.value?.homeEntryId));
const announcedAway=computed(()=>announced.value?.teams.find(team=>team.entry_id===selectedAnnouncedMatch.value?.awayEntryId));
const announcedFinals=computed<PlannedRound[]>(()=>{
  const rounds:PlannedRound[]=[];
  const qualifiers=announced.value?.qualificationCount||0;
  for(let size=qualifiers;size>=2;size/=2){
    const pairing=size===2?'positions':size===4?announced.value?.semifinalPairing==='in_person_draw'?'draw':'positions':size===qualifiers&&announced.value?.quarterPairing==='in_person_draw'?'draw':'positions';
    const previous=rounds.length;
    rounds.push({size,name:knockoutRoundName(size),pairing,legs:1,ties:Array.from({length:size/2},(_,index)=>({slot:index+1,
      home:previous&&pairing!=='draw'?`Ganador de llave ${previous}.${index*2+1}`:'Por definir',
      away:previous&&pairing!=='draw'?`Ganador de llave ${previous}.${index*2+2}`:'Por definir'}))});
  }
  return rounds;
});
const normalizeSearch=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es');
const menuItems=computed(()=>props.catalog.filter(item=>(!props.organization||item.organization_id===props.organization.id)&&normalizeSearch(item.name).includes(normalizeSearch(tournamentSearch.value.trim()))));
const hasEmblem=(id:string)=>props.tournaments.some(item=>item.id===id&&item.has_emblem);
const emblemUrl=(organizationId:string,tournamentId:string)=>`/api/v1/public/organizations/${organizationId}/tournaments/${tournamentId}/emblem`;
const tabs=computed(()=>[
  ...(announced.value?[{key:'matches',label:'Partidos',icon:'ball'},{key:'announced',label:'Fixture',icon:'calendar'},{key:'standings',label:'Clasificación',icon:'chart'},{key:'scorers',label:'Goleadores',icon:'trophy'},{key:'defense',label:'Valla menos vencida',icon:'shield'}]:[]),
  ...(currentTournament.value?.presentation_only||announced.value?[]:[
  {key:'matches',label:'Partidos',icon:'ball'},
  ...(category.value?.rules?.initialPhase?.mode==='knockout'?[]:[{key:'standings',label:'Clasificación',icon:'chart'}]),
  {key:'scorers',label:'Goleadores',icon:'trophy'},
  {key:'defense',label:'Valla menos vencida',icon:'shield'},
  ]),
  {key:'teams',label:'Equipos',icon:'users'},
]);
const readPublic = createPublicReads();
const matchDetail = ref<FanMatchDetail|null>(null);
const matchLoading = ref(false), matchError = ref(false), matchRetry = ref(0);
watch([() => props.organization?.id, () => selectedMatch.value?.id, () => props.resultsRevision, matchRetry],
  async ([org,id,revision,attempt], _previous, onCleanup) => {
    matchDetail.value = null;
    matchError.value = false;
    matchLoading.value = !!org && !!id;
    if (!org || !id) return;
    let active = true;
    onCleanup(() => { active = false; });
    try {
      const days = await readPublic<{matches:FanMatchDetail[]}[]>(`/organizations/${org}/fixture?partido=${id}`, `${revision}:${attempt}`);
      if (active) matchDetail.value = days[0]?.matches.find(match=>match.id===id) || null;
    } catch {
      if (active) matchError.value = true;
    } finally {
      if (active) matchLoading.value = false;
    }
  });
const stats = ref<FanStats|null>(null), statsLoading = ref(false), statsError = ref(false);
const usesStats = computed(() => !selectedTeam.value && ['standings','scorers','defense'].includes(tab.value));
const statsRetry = ref(0);
let shownStats = '';
watch(() => [props.organization?.id, currentCategoryId.value, props.resultsRevision, usesStats.value, props.loading, category.value?.presentation_only, statsRetry.value] as const,
  async ([org, id, revision, needed, loading, preview, attempt], _previous, onCleanup) => {
    const key = `${org}:${id}:${revision}:${attempt}`;
    if (shownStats !== key) stats.value = null;
    statsError.value = false;
    statsLoading.value = !!(org && id && needed && !loading && !preview && (!stats.value || shownStats !== key));
    if (!org || !statsLoading.value) return;
    let current = true;
    onCleanup(() => { current = false; });
    try {
      const data = await readPublic<FanStats>(`/organizations/${org}/categories/${id}/statistics`, `${revision}:${attempt}`);
      if (current) {
        stats.value = data;
        shownStats = key;
      }
    } catch {
      if (current) statsError.value = true;
    } finally {
      if (current) statsLoading.value = false;
    }
  }, { immediate: true });
const days=computed(()=>props.fixture.map(day=>({...day,matches:day.matches.filter(match=>match.category_id===currentCategoryId.value)})).filter(day=>day.matches.length));
const publishedAnnouncedMatches=computed(()=>{
  const result:Record<string,FanMatch>={};
  if(!days.value.length)return result;
  for(const round of announced.value?.rounds||[])for(const pair of round.matches){
    const home=announced.value?.teams.find(team=>team.entry_id===pair.homeEntryId)?.team_id;
    const away=announced.value?.teams.find(team=>team.entry_id===pair.awayEntryId)?.team_id;
    const match=days.value.find(day=>day.ordinal===round.ordinal)?.matches.find(item=>home&&away&&[item.home_team_id,item.away_team_id].sort().join(':')===[home,away].sort().join(':'));
    if(match)result[`${pair.homeEntryId}:${pair.awayEntryId}`]=match;
  }
  return result;
});
const announcedStatuses=computed(()=>Object.fromEntries(Object.entries(publishedAnnouncedMatches.value).map(([key,match])=>{
  const homeEntryId=key.split(':')[0],homeTeamId=announced.value?.teams.find(team=>team.entry_id===homeEntryId)?.team_id;
  const reversed=match.home_team_id!==homeTeamId;
  const score=match.result?`${reversed?match.result.score.away:match.result.score.home} : ${reversed?match.result.score.home:match.result.score.away}`:null;
  const label=match.result?.status==='official'?'Final':match.result?.status==='provisional'?'Provisional':match.match_date?shortDate(match.match_date):'Publicado · fecha pendiente';
  return [key,{score,label}];
})));
const pendingAnnouncedRounds=computed(()=>announced.value?.rounds.map(round=>({...round,matches:round.matches.filter(pair=>!publishedAnnouncedMatches.value[`${pair.homeEntryId}:${pair.awayEntryId}`])})).filter(round=>round.matches.length)||[]);
function openAnnouncedMatch(ordinal:number,pair:{homeEntryId:string;awayEntryId:string}){const published=publishedAnnouncedMatches.value[`${pair.homeEntryId}:${pair.awayEntryId}`];if(published)openMatch(published);else{selectedAnnouncedMatch.value={ordinal,...pair};const index=announced.value?.rounds.find(item=>item.ordinal===ordinal)?.matches.findIndex(item=>item.homeEntryId===pair.homeEntryId&&item.awayEntryId===pair.awayEntryId)??-1;if(!restoringNavigation&&index>=0)pushPublicNavigation(tabToView[tab.value]||'partidos',{kind:'cruce',id:`${ordinal}-${index+1}`});}}
const bracketRows=ref<FanBracket[]>([]);
const bracketLoading=ref(false),bracketFailed=ref(false),bracketRetry=ref(0);
const bracket=computed(()=>bracketRows.value.find(item=>item.category_id===currentCategoryId.value));
const canOpenBracket=computed(()=>!!category.value?.has_public_bracket||!!bracket.value||category.value?.rules?.initialPhase?.mode==='knockout');
const leagueBracket=computed(()=>category.value?.rules?.initialPhase?.mode==='league'&&canOpenBracket.value);
const needsBracket=computed(()=>!selectorOpen.value&&!selectedMatch.value&&!selectedAnnouncedMatch.value&&!selectedTeam.value&&(
  (tab.value==='announced'&&announcedView.value==='finals')||
  (tab.value==='matches'&&matchesView.value==='bracket')||
  (tab.value==='standings'&&standingsView.value==='bracket')
));
watch(() => [props.organization?.id,currentTournament.value?.id,props.resultsRevision,needsBracket.value,bracketRetry.value] as const,
  async ([org,tournament,revision,needed,attempt],previous,onCleanup)=>{
    if(org!==previous?.[0]||tournament!==previous?.[1])bracketRows.value=[];
    bracketLoading.value=!!(org&&tournament&&needed);
    bracketFailed.value=false;
    if(!org||!tournament||!needed)return;
    let current=true;
    onCleanup(()=>{current=false;});
    try {
      const rows=await readPublic<FanBracket[]>(`/organizations/${org}/brackets?torneo=${tournament}`,`${revision}:${attempt}`);
      if(current)bracketRows.value=rows;
    } catch {
      if(current)bracketFailed.value=true;
    } finally {
      if(current)bracketLoading.value=false;
    }
  },{immediate:true});
const bracketRounds=computed<PlannedRound[]>(()=>[...new Set((bracket.value?.slots||[]).map(slot=>slot.stage))].map(stage=>{const ties=(bracket.value?.slots||[]).filter(slot=>slot.stage===stage).sort((a,b)=>a.slot-b.slot);const size=ties.length*2;return {size,name:stage===1&&bracket.value?.repechage?'Repechaje':knockoutRoundName(size),pairing:'positions' as const,legs:ties.some(tie=>tie.twoLegs)?2 as const:1 as const,ties};}));
const categoryTeams=computed(()=>props.teams.filter(team=>team.category_id===currentCategoryId.value));
const defense=computed(()=>(stats.value?.defense||[]).filter(row=>row.played>0).sort((a,b)=>a.goalsAgainst-b.goalsAgainst||a.teamName.localeCompare(b.teamName,'es')));
const sectionFlyerSources=computed(():Record<string,string[]>|null=>{
  if(needsBracket.value)return {bracket:bracket.value?[bracket.value.phase_id]:[]};
  if(tab.value==='matches')return {matchday:days.value.map(day=>day.id)};
  if(['standings','scorers','defense'].includes(tab.value))return {[tab.value]:[currentCategoryId.value]};
  return null;
});

watch(()=>props.selectedTournamentId,id=>{restoringNavigation=true;matchesView.value='days';standingsView.value='league';categoryId.value='';announcedRound.value=1;announcedView.value='rounds';selectedMatch.value=null;selectedAnnouncedMatch.value=null;selectedTeam.value=null;selectorOpen.value=!id;tournamentSearch.value='';restorePublicLocation();});
watch([currentTournament,announcedMode],([item,hasPlan])=>{if(!tabs.value.some(entry=>entry.key===tab.value))tab.value=hasPlan?'matches':item?.presentation_only?'teams':'matches';},{immediate:true});
watch(currentCategoryId,()=>{selectedMatch.value=null;selectedAnnouncedMatch.value=null;selectedTeam.value=null;standingsView.value='league';announcedRound.value=1;announcedView.value='rounds';if(!tabs.value.some(item=>item.key===tab.value))tab.value=currentTournament.value?.presentation_only?(announcedMode.value?'matches':'teams'):'matches';});
watch(()=>props.fixture,days=>{
  if(selectedAnnouncedMatch.value){
    const {homeEntryId,awayEntryId}=selectedAnnouncedMatch.value;
    const published=publishedAnnouncedMatches.value[`${homeEntryId}:${awayEntryId}`];
    if(published){
      selectedAnnouncedMatch.value=null;
      selectedMatch.value=published;
      pushPublicNavigation(tabToView[tab.value]||'partidos',{kind:'partido',id:published.id},true);
    }
    return;
  }
  if(!selectedMatch.value)return;
  const latest=days.flatMap(day=>day.matches).find(item=>item.id===selectedMatch.value?.id);
  if(latest)selectedMatch.value=latest;
  else if(!props.loading){selectedMatch.value=null;pushPublicNavigation(tabToView[tab.value]||'partidos',null,true);}
});
trackPublicListScroll(()=>!!(selectedMatch.value||selectedAnnouncedMatch.value||selectedTeam.value));
function chooseTournament(item:CatalogItem){selectorOpen.value=false;tournamentSearch.value='';if(item.id!==props.selectedTournamentId)emit('navigate',`publico/${item.organization_id}/${item.id}`);}
async function toggleSelector(){selectorOpen.value=!selectorOpen.value;if(selectorOpen.value){await nextTick();document.getElementById('fan-tournament-search')?.focus();}}
function team(id:string){return props.teams.find(item=>item.id===id&&item.category_id===currentCategoryId.value);}
function byName(name:string){return categoryTeams.value.find(item=>item.name===name);}
function shortDate(value:string){const [y,m,d]=value.split('-');return `${d}/${m}/${y}`;}
function dayTitle(day:FanDay){const names=[...new Set(day.matches.map(match=>match.bracket_round))];if(names.length===1&&names[0]){const legs=[...new Set(day.matches.map(match=>match.tie_leg))];return legs.length===1&&legs[0]?`${names[0]} · ${legs[0]}`:names[0];}return names.length>1&&names.every(Boolean)?'Eliminación':`Fecha ${day.ordinal}`;}
function matchTitle(match:FanMatch){const day=days.value.find(item=>item.matches.some(entry=>entry.id===match.id));return `${match.bracket_round||`Fecha ${day?.ordinal||''}`}${match.tie_leg?` · ${match.tie_leg}`:''}`;}
function openMatch(match:FanMatch){selectedMatch.value=match;if(!restoringNavigation)pushPublicNavigation(tabToView[tab.value]||'partidos',{kind:'partido',id:match.id});}
function openTeam(item:FanTeam){selectedTeam.value=item;if(!restoringNavigation)pushPublicNavigation('equipos',{kind:'equipo',id:item.entry_id});}
function openBracketMatch(id:string){const match=days.value.flatMap(day=>day.matches).find(item=>item.id===id);if(match)openMatch(match);}
function closeDetail(){
  if(closePublicDetail(tabToView[tab.value]||'partidos'))return;
  selectedMatch.value=null;selectedAnnouncedMatch.value=null;selectedTeam.value=null;
}
function restorePublicLocation(){
  const epoch=++restoreEpoch;
  const state=readPublicNavigation(location.search),requested=viewToTab[state.view]||'matches';
  restoringNavigation=true;
  const match=state.detail?.kind==='partido'?props.fixture.flatMap(day=>day.matches).find(item=>item.id===state.detail?.id):undefined;
  const team=state.detail?.kind==='equipo'?props.teams.find(item=>item.entry_id===state.detail?.id):undefined;
  if(match||team)categoryId.value=(match||team)!.category_id;
  tab.value=tabs.value.some(item=>item.key===requested)?requested:tabs.value[0]?.key||'matches';
  selectedMatch.value=null;selectedAnnouncedMatch.value=null;selectedTeam.value=null;
  void nextTick(()=>{
    if(epoch!==restoreEpoch)return;
    if(match)openMatch(match);
    else if(team)openTeam(team);
    else if(state.detail?.kind==='cruce'){const [ordinal,index]=state.detail.id.split('-').map(Number),pair=announced.value?.rounds.find(item=>item.ordinal===ordinal)?.matches[index-1];if(pair)openAnnouncedMatch(ordinal,pair);}
    restoringNavigation=false;
  });
}
watch(tab,value=>{if(!restoringNavigation&&!props.loading){pushPublicNavigation(tabToView[value]||'partidos');void nextTick(()=>window.scrollTo(0,0));}},{flush:'sync'});
watch(() => [currentTournament.value?.id, tab.value, props.loading, props.error] as const, ([id, value, loading, error]) => {
  if (id && !loading && !error && tabs.value.some(item => item.key === value)) recordFanView({id, section: tabToView[value]});
}, { immediate: true, flush: 'post' });
</script>

<template>
  <div class="fan-ui">
    <header v-if="!selectedMatch&&!selectedAnnouncedMatch&&!selectedTeam" class="fan-header"><div class="fan-header-inner"><div class="fan-header-top"><button type="button" class="fan-back" aria-label="Volver a organizaciones" @click="emit('navigate','publico')"><Icon name="back" /></button><span class="fan-overline"><PublicImage v-if="organization?.logo_id" class="fan-org-logo" :src="`/api/v1/public/organizations/${organization.id}/logo`" />{{ organization?.name||'Torneos' }}</span></div><button id="fan-tournament" type="button" class="fan-selector-button" :aria-expanded="selectorOpen" aria-controls="fan-tournament-list" @click="toggleSelector"><PublicImage v-if="currentTournament?.has_emblem && organization" class="fan-emblem" :src="emblemUrl(organization.id,currentTournament.id)" /><Icon v-else name="trophy" /><strong>{{ currentTournament?.name||'Elegí un torneo' }}</strong><Icon name="chevron" :class="{'is-open':selectorOpen}" /></button></div></header>
    <nav v-if="!selectedMatch&&!selectedAnnouncedMatch&&!selectedTeam" v-show="selectorOpen" id="fan-tournament-list" class="fan-tournament-list" aria-label="Torneos" @keydown.esc="selectorOpen=false"><label class="fan-tournament-search"><Icon name="search" /><input id="fan-tournament-search" v-model="tournamentSearch" type="search" placeholder="Buscar torneo" aria-label="Buscar torneo" autocomplete="off"></label><button v-for="item in menuItems" :key="`${item.organization_id}-${item.id}`" type="button" :aria-current="selectedTournamentId===item.id?'page':undefined" @click="chooseTournament(item)"><PublicImage v-if="hasEmblem(item.id)" class="fan-emblem" :src="emblemUrl(item.organization_id,item.id)" /><Icon v-else name="trophy" /><span><strong>{{ item.name }}</strong><small v-if="!organization">{{ item.organization_name }}</small></span><Icon :name="selectedTournamentId===item.id?'check':'arrow'" /></button><p v-if="!loading&&!menuItems.length" class="fan-empty">{{ tournamentSearch ? 'Sin resultados.' : 'Aún no hay torneos publicados.' }}</p></nav>
    <div v-if="loading" class="fan-status" role="status">Cargando…</div>
    <div v-if="error" class="fan-status error" role="alert">{{ error }}</div>
    <template v-if="currentTournament&&!loading&&!error">
      <div class="fan-category" v-if="categories.length>1" role="group" aria-label="Categoría"><button v-for="item in categories" :key="item.category_id" type="button" :aria-pressed="currentCategoryId===item.category_id" @click="categoryId=item.category_id">{{ item.category_name }}</button></div>
      <template v-if="selectedAnnouncedMatch">
        <div class="fan-detail-top"><button type="button" class="fan-close" aria-label="Volver a los partidos" @click="closeDetail"><Icon name="back" /></button><span>Jornada {{ selectedAnnouncedMatch.ordinal }}</span></div>
        <section class="fan-scoreboard" aria-label="Partido anunciado"><p class="fan-match-state">PENDIENTE DE FECHA</p><div class="fan-score-grid"><div class="fan-score-team"><TeamCrest size="lg" :name="announcedHome?.name||'Equipo'" :team-id="announcedHome?.team_id" :organization-id="organization?.id" :color="announcedHome?.color" :has-shield="announcedHome?.has_shield" /><strong>{{ announcedHome?.name }}</strong></div><div class="fan-score-number">vs</div><div class="fan-score-team"><TeamCrest size="lg" :name="announcedAway?.name||'Equipo'" :team-id="announcedAway?.team_id" :organization-id="organization?.id" :color="announcedAway?.color" :has-shield="announcedAway?.has_shield" /><strong>{{ announcedAway?.name }}</strong></div></div></section>
      </template>
      <template v-else-if="selectedMatch">
        <div class="fan-detail-top"><button type="button" class="fan-close" aria-label="Cerrar partido" @click="closeDetail"><Icon name="close" /></button><span>{{ matchTitle(selectedMatch) }}</span></div>
        <section class="fan-scoreboard" aria-label="Resultado del partido"><p class="fan-match-state">{{ selectedMatch.result?.status==='official'?'RESULTADO OFICIAL':selectedMatch.result?.status==='provisional'?'PROVISIONAL':selectedMatch.match_date?`${shortDate(selectedMatch.match_date)}${selectedMatch.match_time?` · ${selectedMatch.match_time}`:''}`:'FECHA PENDIENTE' }}</p><div class="fan-score-grid"><div class="fan-score-team"><TeamCrest size="lg" :name="selectedMatch.home_name" :team-id="selectedMatch.home_team_id" :organization-id="organization?.id" :color="team(selectedMatch.home_team_id)?.color" :has-shield="team(selectedMatch.home_team_id)?.has_shield" /><strong :title="selectedMatch.home_name">{{ selectedMatch.home_name }}</strong></div><div class="fan-score-number"><template v-if="selectedMatch.result">{{ selectedMatch.result.score.home }}<span class="score-separator"> : </span>{{ selectedMatch.result.score.away }}</template><template v-else>—</template></div><div class="fan-score-team"><TeamCrest size="lg" :name="selectedMatch.away_name" :team-id="selectedMatch.away_team_id" :organization-id="organization?.id" :color="team(selectedMatch.away_team_id)?.color" :has-shield="team(selectedMatch.away_team_id)?.has_shield" /><strong :title="selectedMatch.away_name">{{ selectedMatch.away_name }}</strong></div></div><p class="fan-score-meta">{{ selectedMatch.match_date?shortDate(selectedMatch.match_date):'Fecha pendiente' }}<template v-if="selectedMatch.match_time"> · {{ selectedMatch.match_time }}</template><template v-if="matchDetail?.venue_name"> · {{ matchDetail.venue_name }}</template></p><p v-if="selectedMatch.result&&(selectedMatch.result.shootout.home||selectedMatch.result.shootout.away)" class="fan-score-meta">Penales {{ selectedMatch.result.shootout.home }} : {{ selectedMatch.result.shootout.away }}</p><PublicScoreGoals v-if="matchDetail?.result" :events="matchDetail.result.events" :home-name="selectedMatch.home_name" :away-name="selectedMatch.away_name" /></section>
        <PublicFlyers v-if="organization" :key="selectedMatch.id" :organization-id="organization.id" :tournament-id="currentTournament.id" :revision="resultsRevision" :sources="{result:[selectedMatch.id],match:[selectedMatch.id]}" />
        <div class="fan-content"><h2 class="fan-section-label">Eventos</h2><p v-if="matchLoading && !matchDetail" class="fan-status" role="status">Cargando eventos…</p><p v-else-if="matchError" class="fan-status" role="alert">No se pudo cargar la ficha. <button type="button" class="text-action" @click="matchRetry++">Reintentar</button></p><PublicMatchTimeline v-else :events="matchDetail?.result?.events || []" :home-name="selectedMatch.home_name" :away-name="selectedMatch.away_name" /></div>
      </template>
      <template v-else-if="selectedTeam">
        <div class="fan-detail-top"><button type="button" class="fan-close" aria-label="Cerrar equipo" @click="closeDetail"><Icon name="close" /></button><span>Equipo</span></div><div class="fan-team-hero"><TeamCrest size="lg" :name="selectedTeam.name" :team-id="selectedTeam.id" :organization-id="organization?.id" :color="selectedTeam.color" :has-shield="selectedTeam.has_shield" /><h1 :title="selectedTeam.name">{{ selectedTeam.name }}</h1></div><PublicTeamRoster v-if="organization" :path="`/organizations/${organization.id}/categories/${selectedTeam.category_id}/teams/${selectedTeam.entry_id}/players`" :revision="resultsRevision" />
      </template>
      <template v-else>
        <div class="fan-tabs-wrap"><SportTabs v-model="tab" :tabs="tabs.map(item=>({...item,href:publicSectionHref(tabToView[item.key])}))" id="fan-sections" /></div>
        <PublicFlyers v-if="organization&&sectionFlyerSources&&!currentTournament.presentation_only" :key="`${currentCategoryId}:${tab}:${needsBracket}`" :organization-id="organization.id" :tournament-id="currentTournament.id" :revision="resultsRevision" :sources="sectionFlyerSources" />
        <p v-if="needsBracket&&bracketLoading&&!bracket" class="fan-status" role="status">Cargando cuadro…</p>
        <p v-if="needsBracket&&bracketFailed" class="fan-status" role="alert">No se pudo cargar el cuadro. <button type="button" class="text-action" @click="bracketRetry++">Reintentar</button></p>
        <p v-if="statsLoading" class="fan-status" role="status">Cargando estadísticas…</p>
        <div v-else-if="statsError" class="fan-status" role="alert">No se pudieron cargar las estadísticas. <button class="text-action" type="button" @click="statsRetry++">Reintentar</button></div>
        <section v-if="tab==='announced'&&announced" id="fan-sections-announced-panel" role="tabpanel" aria-labelledby="fan-sections-announced-tab" class="fan-content">
          <div class="fan-subtabs" role="group" aria-label="Vista del fixture"><button type="button" :aria-pressed="announcedView==='rounds'" @click="announcedView='rounds'">Jornadas</button><button type="button" :aria-pressed="announcedView==='finals'" @click="announcedView='finals'">Finales</button></div>
          <template v-if="announcedView==='rounds'">
          <div class="fan-plan-rounds" role="group" aria-label="Jornadas del fixture"><button v-for="round in announced.rounds" :key="round.ordinal" type="button" :aria-pressed="announcedRound===round.ordinal" @click="announcedRound=round.ordinal">J{{ round.ordinal }}</button></div>
          <AnnouncedFixtureMatches :rounds="announced.rounds.filter(item=>item.ordinal===announcedRound)" :teams="announced.teams" :organization-id="organization?.id" :status-by-pair="announcedStatuses" @open-match="openAnnouncedMatch" />
          </template>
          <template v-else>
            <BracketView v-if="bracket" :rounds="bracketRounds" :navigation-key="currentCategoryId" :teams="categoryTeams" :organization-id="organization?.id" @open-match="openBracketMatch" />
            <template v-else-if="!bracketLoading&&!bracketFailed"><p class="fan-plan-note">Cuartos: sorteo presencial · Semifinales: {{ announced.semifinalPairing==='in_person_draw'?'sorteo presencial':'cruces por confirmar' }}</p><BracketView :rounds="announcedFinals" planned /></template>
          </template>
        </section>
        <section v-if="tab==='matches'" id="fan-sections-matches-panel" role="tabpanel" aria-labelledby="fan-sections-matches-tab" class="fan-content">
          <template v-if="announcedMode&&announced"><p class="fan-plan-note">Partidos anunciados · horarios por confirmar.</p><AnnouncedFixtureMatches :rounds="announced.rounds" :teams="announced.teams" :organization-id="organization?.id" :status-by-pair="announcedStatuses" @open-match="openAnnouncedMatch" /></template>
          <template v-else>
          <div v-if="canOpenBracket" class="fan-subtabs" role="group" aria-label="Vista de partidos"><button type="button" :aria-pressed="matchesView==='days'" @click="matchesView='days'">Fechas</button><button type="button" :aria-pressed="matchesView==='bracket'" @click="matchesView='bracket'">Cuadro</button></div>
          <template v-if="matchesView==='days'">
            <p v-if="!days.length" class="fan-empty">Aún no hay partidos publicados.</p>
            <section v-for="day in days" :key="day.id" class="fan-day">
              <div class="fan-day-head"><h2>{{ dayTitle(day) }}</h2></div>
              <button v-for="match in day.matches" :key="match.id" type="button" class="fan-match-row" :data-match-list-id="match.id" :class="{'is-final':match.result?.status==='official'}" :aria-label="`${match.home_name} contra ${match.away_name}, ${match.result?`${match.result.score.home} a ${match.result.score.away}`:match.match_time}. Ver partido`" @click="openMatch(match)">
                <span class="fan-match-date">{{ match.result?.status==='official'?'Final':match.match_time||'Pendiente' }}<small v-if="match.tie_leg">{{ match.tie_leg }}</small></span>
                <span class="fan-match-team"><TeamCrest size="sm" :name="match.home_name" :team-id="match.home_team_id" :organization-id="organization?.id" :color="team(match.home_team_id)?.color" :has-shield="team(match.home_team_id)?.has_shield" /><strong :title="match.home_name">{{ match.home_name }}</strong></span>
                <span class="fan-match-result"><b>{{ match.result?`${match.result.score.home} : ${match.result.score.away}`:'vs' }}</b><small v-if="match.result&&(match.result.shootout.home||match.result.shootout.away)">Pen. {{ match.result.shootout.home }}:{{ match.result.shootout.away }}</small></span>
                <span class="fan-match-team"><TeamCrest size="sm" :name="match.away_name" :team-id="match.away_team_id" :organization-id="organization?.id" :color="team(match.away_team_id)?.color" :has-shield="team(match.away_team_id)?.has_shield" /><strong :title="match.away_name">{{ match.away_name }}</strong></span><Icon name="arrow" />
              </button>
            </section>
            <template v-if="announced&&pendingAnnouncedRounds.length"><p class="fan-plan-note fan-plan-after">Partidos pendientes de publicación</p><AnnouncedFixtureMatches :rounds="pendingAnnouncedRounds" :teams="announced.teams" :organization-id="organization?.id" @open-match="openAnnouncedMatch" /></template>
          </template>
          <template v-else>
            <BracketView v-if="bracket" :rounds="bracketRounds" :navigation-key="currentCategoryId" :teams="categoryTeams" :organization-id="organization?.id" @open-match="openBracketMatch" />
            <p v-else-if="!bracketLoading&&!bracketFailed" class="fan-empty">Aún no hay cruces publicados.</p>
          </template>
          </template>
        </section>

        <section v-if="tab==='standings'" id="fan-sections-standings-panel" role="tabpanel" aria-labelledby="fan-sections-standings-tab" class="fan-content">
          <div v-if="announcedMode&&announced" class="fan-table"><div class="fan-table-head"><span>Equipo</span><span>PJ</span><span>DG</span><span>Pts</span></div><div v-for="teamItem in announcedStandings" :key="teamItem.entry_id" class="fan-table-row"><span class="fan-rank">—</span><TeamCrest size="sm" :name="teamItem.name" :team-id="teamItem.team_id" :organization-id="organization?.id" :color="teamItem.color" :has-shield="teamItem.has_shield" /><strong :title="teamItem.name">{{ teamItem.name }}</strong><span>0</span><span>0</span><b>0</b></div></div>
          <template v-else>
          <div v-if="leagueBracket" class="fan-subtabs" role="group" aria-label="Fases de clasificación"><button type="button" :aria-pressed="standingsView==='league'" @click="standingsView='league'">Liguilla</button><button type="button" :aria-pressed="standingsView==='bracket'" @click="standingsView='bracket'">Eliminación</button></div>
          <template v-if="!leagueBracket||standingsView==='league'">
            <p v-if="!statsLoading && !statsError && !stats?.available" class="fan-empty">Aún sin clasificación publicada.</p>
            <div v-for="table in stats?.tables||[]" :key="String(table.groupNo)" class="fan-table"><h2 v-if="table.groupNo!==null">Grupo {{ table.groupNo }}</h2><div class="fan-table-head"><span>Equipo</span><span>PJ</span><span>DG</span><span>Pts</span></div><div v-for="row in table.rows" :key="row.teamName" class="fan-table-row"><span class="fan-rank">{{ row.unresolved?'—':row.position }}</span><TeamCrest size="sm" :name="row.teamName" :team-id="byName(row.teamName)?.id" :organization-id="organization?.id" :color="byName(row.teamName)?.color" :has-shield="byName(row.teamName)?.has_shield" /><strong :title="row.teamName">{{ row.teamName }}</strong><span>{{ row.played }}</span><span>{{ row.goalDifference }}</span><b>{{ row.points }}</b></div></div>
          </template>
          <BracketView v-else-if="bracket" :rounds="bracketRounds" :navigation-key="currentCategoryId" :teams="categoryTeams" :organization-id="organization?.id" @open-match="openBracketMatch" />
          <p v-else-if="!bracketLoading&&!bracketFailed" class="fan-empty">Aún no hay cruces publicados.</p>
          </template>
        </section>
        <section v-if="tab==='scorers'" id="fan-sections-scorers-panel" role="tabpanel" aria-labelledby="fan-sections-scorers-tab" class="fan-content"><p v-if="!statsLoading && !statsError && !stats?.scorers?.length" class="fan-empty">Aún no hay goleadores publicados.</p><div v-for="(player,index) in stats?.scorers||[]" :key="`${player.name}-${index}`" class="fan-scorer-row"><span class="fan-rank">{{ index+1 }}</span><TeamCrest size="sm" :name="player.teamName" :team-id="byName(player.teamName)?.id" :organization-id="organization?.id" :color="byName(player.teamName)?.color" :has-shield="byName(player.teamName)?.has_shield" /><span><strong :title="player.name">{{ player.name }}</strong><small :title="player.teamName">{{ player.teamName }}</small></span><b>{{ player.goals }}</b></div></section>
        <section v-if="tab==='defense'" id="fan-sections-defense-panel" role="tabpanel" aria-labelledby="fan-sections-defense-tab" class="fan-content"><p v-if="!statsLoading && !statsError && !defense.length" class="fan-empty">Aún no hay partidos oficiales.</p><div v-else class="fan-defense-head"><span>Equipo</span><span>PJ</span><span>GC</span></div><div v-for="(row,index) in defense" :key="row.teamName" class="fan-defense-row"><span class="fan-rank">{{ index+1 }}</span><TeamCrest size="sm" :name="row.teamName" :team-id="byName(row.teamName)?.id" :organization-id="organization?.id" :color="byName(row.teamName)?.color" :has-shield="byName(row.teamName)?.has_shield" /><strong :title="row.teamName">{{ row.teamName }}</strong><span>{{ row.played }}</span><b>{{ row.goalsAgainst }}</b></div></section>
        <section v-if="tab==='teams'" id="fan-sections-teams-panel" role="tabpanel" aria-labelledby="fan-sections-teams-tab" class="fan-content"><p v-if="!categoryTeams.length" class="fan-empty">Aún no hay equipos publicados.</p><button v-for="item in categoryTeams" :key="item.entry_id" type="button" class="fan-team-row" :data-match-list-id="item.entry_id" @click="openTeam(item)"><TeamCrest :name="item.name" :team-id="item.id" :organization-id="organization?.id" :color="item.color" :has-shield="item.has_shield" /><strong :title="item.name">{{ item.name }}</strong><Icon name="arrow" /></button></section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.fan-plan-note{margin:1px 0 15px;color:#425f53;font-size:.83rem;line-height:1.5}.fan-plan-after{margin-top:22px}.fan-plan-rounds{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;padding-bottom:8px;border-bottom:1px solid #e2eae5}.fan-plan-rounds::-webkit-scrollbar{display:none}.fan-plan-rounds button{flex:none;min-width:43px;min-height:42px;border:0;border-bottom:3px solid transparent;background:#fff;color:#526b61;font:inherit;font-size:.8rem;font-weight:750}.fan-plan-rounds button[aria-pressed=true]{border-bottom-color:#0c9c64;color:#075a3b}.fan-plan-rounds button:focus-visible{outline:3px solid #0cac70;outline-offset:-3px}
.fan-ui{min-height:100svh;background:#fff;color:#14242c}.fan-header{background:#102029;color:#fff}.fan-header-inner{max-width:880px;margin:auto;padding:19px 16px 22px}.fan-overline{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#a8c2ba;font-size:.7rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.fan-selector-wrap{display:flex;align-items:center;gap:9px;margin-top:8px}.fan-selector-wrap>.icon:first-child{width:22px;height:22px;color:#a6eb8c}.fan-selector-wrap>.icon:last-child{width:18px;height:18px;color:#a8c2ba}.fan-selector-wrap select{flex:1;min-width:0;max-width:100%;appearance:none;border:0;background:transparent;color:#fff;font:inherit;font-size:1.25rem;line-height:1.3;font-weight:850;outline-offset:5px;text-overflow:ellipsis}.fan-selector-wrap select option{color:#14242c;background:#fff}.fan-status,.fan-empty-home{max-width:880px;margin:auto;padding:28px 16px;color:#58706b}.fan-status.error{color:#a82c31}.fan-empty-home .icon{width:54px;height:54px;color:#cbdad5}.fan-category{display:flex;gap:8px;max-width:880px;margin:auto;padding:9px 16px 0;overflow-x:auto}.fan-category button{min-height:38px;flex:none;border:1px solid #cddbd6;border-radius:999px;background:#fff;padding:6px 12px;font:inherit;font-size:.75rem;font-weight:700;color:#48645a}.fan-category button[aria-pressed=true]{border-color:#0c6c49;background:#dcf3e7;color:#075a3b}.fan-tabs-wrap{position:sticky;top:0;z-index:5;background:#fff;box-shadow:0 1px 0 #d7e1de}.fan-tabs-wrap :deep(.sport-tabs){max-width:880px;margin:0 auto;border:0;padding-inline:8px}.fan-tabs-wrap :deep(.sport-tabs button){min-height:54px;padding-inline:12px}.fan-content{max-width:880px;margin:auto;padding:16px 16px 44px;background:#fff;min-height:60vh}.fan-empty{padding:26px 2px;color:#6b7c78;font-size:.84rem}.fan-subtabs{display:flex;gap:4px;border-bottom:1px solid #dce5e1;margin:-2px 0 10px}.fan-subtabs button{min-height:43px;border:0;border-bottom:3px solid transparent;background:transparent;padding:8px 14px;color:#657772;font:inherit;font-size:.8rem;font-weight:750}.fan-subtabs button[aria-pressed=true]{color:#0c704b;border-bottom-color:#0cac70}.fan-day{margin-top:4px}.fan-day h2{padding:15px 2px 7px;font-size:.8rem;color:#364d48}.fan-day+.fan-day{margin-top:12px;border-top:6px solid #f5f7f8}.fan-match-row{width:100%;display:grid;grid-template-columns:42px minmax(0,1fr) 48px minmax(0,1fr) 16px;align-items:center;gap:7px;min-height:73px;padding:9px 1px;border:0;border-bottom:1px solid #e1e8e5;background:#fff;color:#14242c;text-align:center;font:inherit;cursor:pointer}.fan-match-row>.icon{width:15px;height:15px;color:#8ba098}.fan-match-date{color:#667974;font-size:.64rem;text-align:left}.fan-match-team{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}.fan-match-team strong{min-width:0;max-width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:.72rem;line-height:1.16}.fan-match-result{font-size:1.12rem;font-weight:850;white-space:nowrap;font-variant-numeric:tabular-nums}.fan-match-row:hover{background:#f7fbf9}.fan-match-row:focus-visible,.fan-team-row:focus-visible,.fan-close:focus-visible{outline:3px solid #0cac70;outline-offset:-3px}.fan-detail-top{max-width:880px;margin:auto;display:flex;align-items:center;gap:12px;min-height:51px;padding:4px 16px;color:#49605a;font-size:.77rem;font-weight:700}.fan-close{display:grid;place-items:center;width:40px;height:40px;border:0;border-radius:50%;background:#e9efec;color:#27443b;cursor:pointer}.fan-close .icon{width:18px;height:18px}.fan-scoreboard{max-width:880px;margin:auto;padding:21px 14px 23px;background:#102029;color:#fff;text-align:center}.fan-match-state{margin:0 0 18px;color:#afe694;font-size:.68rem;font-weight:850;letter-spacing:.12em}.fan-score-grid{display:grid;grid-template-columns:minmax(0,1fr) 76px minmax(0,1fr);align-items:start;gap:5px}.fan-score-team{display:grid;justify-items:center;gap:11px;min-width:0}.fan-score-team strong{max-width:100%;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:.86rem;line-height:1.2}.fan-score-number{padding-top:10px;font-size:1.9rem;font-weight:900;white-space:nowrap;font-variant-numeric:tabular-nums}.fan-score-meta{margin:18px 0 0;color:#b8cbc4;font-size:.73rem}.fan-score-meta+.fan-score-meta{margin-top:4px}.fan-section-label{margin:0;padding:4px 0 13px;font-size:.95rem}.fan-period{border-top:1px solid #dce5e1}.fan-period h3{margin:0;padding:11px 0 5px;color:#60736d;font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.fan-event{display:grid;grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr);min-height:58px;align-items:center;border-bottom:1px solid #edf1ef}.fan-event-side{display:flex;align-items:center;gap:7px;min-width:0}.fan-event-side>span:last-child{min-width:0}.fan-event-side strong,.fan-event-side small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fan-event-side strong{font-size:.8rem}.fan-event-side small{font-size:.69rem;color:#63746e}.fan-event-minute{grid-column:2;text-align:center;font-size:.65rem;color:#788a84}.fan-event.is-home .fan-event-side{grid-column:1;grid-row:1}.fan-event.is-away .fan-event-side{grid-column:3;grid-row:1;flex-direction:row-reverse;text-align:right}.fan-event.is-unknown .fan-event-side{grid-column:1/4;grid-row:1}.fan-team-hero{display:flex;align-items:center;gap:17px;max-width:880px;margin:auto;padding:24px 16px;background:#102029;color:#fff}.fan-team-hero h1{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1.25rem}.fan-roster-head,.fan-defense-head,.fan-table-head{display:flex;justify-content:space-between;align-items:center;color:#61736d;font-size:.68rem;font-weight:750}.fan-roster-head h2{font-size:.98rem;color:#14242c}.fan-player-row{display:grid;grid-template-columns:minmax(0,1fr) 36px 36px 36px;gap:8px;align-items:center;min-height:54px;border-bottom:1px solid #e0e8e4}.fan-player-row>strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem}.fan-player-stat{display:flex;align-items:center;justify-content:center;gap:2px;color:#3e5d51;font-size:.74rem;font-variant-numeric:tabular-nums}.fan-player-stat .icon{width:13px;height:13px;color:#17975e}.fan-small-card{display:inline-block;width:9px;height:13px;border-radius:1px}.fan-small-card.yellow{background:#e6b328}.fan-small-card.red{background:#d63836}.fan-table{margin-bottom:23px}.fan-table h2{margin:4px 0 9px;color:#164c3d;font-size:.83rem}.fan-table-head{display:grid;grid-template-columns:minmax(0,1fr) 32px 34px 37px;padding:8px 0;border-bottom:1px solid #ccd9d4;text-align:right}.fan-table-head span:first-child{text-align:left}.fan-table-row{display:grid;grid-template-columns:23px 27px minmax(0,1fr) 32px 34px 37px;align-items:center;gap:5px;min-height:50px;border-bottom:1px solid #e1e8e5;text-align:right;font-size:.75rem;font-variant-numeric:tabular-nums}.fan-table-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-weight:700}.fan-table-row>b:last-child{color:#087a50;font-size:.88rem}.fan-rank{color:#657974;font-size:.72rem;text-align:center;font-weight:750}.fan-scorer-row{display:grid;grid-template-columns:23px 27px minmax(0,1fr) 27px;align-items:center;gap:9px;min-height:60px;border-bottom:1px solid #e1e8e5}.fan-scorer-row>span:nth-child(3){min-width:0}.fan-scorer-row strong,.fan-scorer-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fan-scorer-row strong{font-size:.81rem}.fan-scorer-row small{font-size:.7rem;color:#697c75}.fan-scorer-row>b{color:#0b8053;font-size:1rem;text-align:right}.fan-defense-head{display:grid;grid-template-columns:minmax(0,1fr) 31px 37px;text-align:right;padding:8px 0;border-bottom:1px solid #ccd9d4}.fan-defense-head span:first-child{text-align:left}.fan-defense-row{display:grid;grid-template-columns:23px 27px minmax(0,1fr) 31px 37px;align-items:center;gap:8px;min-height:54px;border-bottom:1px solid #e1e8e5;text-align:right;font-size:.77rem}.fan-defense-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.fan-defense-row>b{color:#087a50;font-size:.88rem}.fan-team-row{display:flex;align-items:center;gap:12px;width:100%;min-height:61px;padding:8px 2px;border:0;border-bottom:1px solid #e1e8e5;background:#fff;color:#14242c;text-align:left;font:inherit}.fan-team-row strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.83rem}.fan-team-row>.icon{width:17px;height:17px;color:#82968e}
.fan-selector-button{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;margin-top:3px;padding:0;border:0;background:transparent;color:#fff;text-align:left;font:inherit}.fan-selector-button>.icon:first-child{width:23px;height:23px;color:#a6eb8c}.fan-selector-button>.icon:last-child{width:19px;height:19px;margin-left:auto;color:#a8c2ba;transition:transform .18s}.fan-selector-button>.icon.is-open{transform:rotate(180deg)}.fan-selector-button strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1.18rem;font-weight:850}.fan-selector-button:focus-visible,.fan-tournament-list button:focus-visible{outline:3px solid #0cac70;outline-offset:-3px}.fan-tournament-list{max-width:880px;max-height:min(62svh,560px);margin:0 auto;padding:0 16px;overflow-y:auto;background:#fff;scrollbar-width:none}.fan-tournament-list::-webkit-scrollbar{display:none}.fan-tournament-list button{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 2px;border:0;border-bottom:1px solid #e1e9e5;background:#fff;color:#14242c;text-align:left;font:inherit}.fan-tournament-list button[aria-current=page]{color:#076f4b}.fan-tournament-list button>span{flex:1;min-width:0}.fan-tournament-list button strong,.fan-tournament-list button small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fan-tournament-list button strong{font-size:.84rem}.fan-tournament-list button small{color:#657a70;font-size:.7rem}.fan-tournament-list button>.icon{width:16px;height:16px;color:#789086}.fan-tournament-list button[aria-current=page]>.icon{color:#0a9a63}.fan-tabs-wrap :deep(.sport-tabs){scrollbar-width:none}.fan-tabs-wrap :deep(.sport-tabs::-webkit-scrollbar){display:none}.fan-day-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.fan-match-row{grid-template-columns:42px minmax(0,1fr) 56px minmax(0,1fr) 16px}.fan-match-date small,.fan-match-result small{display:block;margin-top:3px;font-size:.6rem;font-weight:700;line-height:1.1}.fan-match-result small{color:#0b8053}.fan-match-result b{display:block;font-size:1.08rem}.fan-match-date small{color:#0b8053}
.fan-header-inner{padding:10px 16px 11px}.fan-selector-button{min-height:38px;margin-top:1px}.fan-selector-button strong{font-size:1.06rem}.fan-tournament-list{max-height:none;overflow:visible;padding:0 16px 12px}.fan-tournament-list button{min-height:50px}.fan-tournament-search{display:flex;align-items:center;gap:9px;min-height:44px;margin:10px 0 4px;padding:0 11px;border:1px solid #cddbd6;border-radius:9px}.fan-tournament-search .icon{width:17px;height:17px;color:#627a72}.fan-tournament-search input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#14242c;font:inherit;font-size:1rem}.fan-tournament-search:focus-within{outline:3px solid #0cac70;outline-offset:2px}
.fan-emblem{width:30px;height:30px;flex:none;object-fit:contain;background:#fff;border-radius:5px}.fan-tournament-list .fan-emblem{width:32px;height:32px}
.fan-overline{display:flex;align-items:center;gap:6px}.fan-org-logo{width:18px;height:18px;object-fit:contain;background:#fff;border-radius:50%}
.fan-header-top{display:flex;align-items:center;gap:7px;min-height:32px}.fan-header-top .fan-overline{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fan-back{display:grid;place-items:center;flex:none;width:32px;height:32px;margin-left:-8px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}.fan-back .icon{width:17px;height:17px}.fan-back:focus-visible{outline:3px solid #0cac70;outline-offset:1px}
@media(max-width:359px){.fan-header-inner{padding-inline:12px}.fan-content{padding-inline:12px}.fan-match-row{grid-template-columns:39px minmax(0,1fr) 52px minmax(0,1fr) 14px;gap:4px}.fan-match-result{font-size:1rem}.fan-score-grid{grid-template-columns:minmax(0,1fr) 68px minmax(0,1fr)}.fan-score-number{font-size:1.7rem}.fan-player-row{grid-template-columns:minmax(0,1fr) 32px 32px 32px;gap:5px}}
/* Lectura deportiva: escudos, marcador y cifras antes que metadatos. */
.fan-match-row{min-height:82px;gap:8px;border-bottom-color:#e7eeea;transition:background-color .15s ease}
.fan-match-row .fan-match-team :deep(.team-crest){width:34px;height:34px}
.fan-match-team strong{font-size:.76rem;font-weight:760;line-height:1.18}
.fan-match-date{font-size:.66rem;font-weight:730;color:#536b60}
.fan-match-result{display:grid;place-items:center;min-height:31px;padding:3px 4px;border-radius:6px;background:#eff3f0;color:#173d34;font-size:1rem;letter-spacing:-.025em}
.fan-match-row.is-final .fan-match-result{background:#102d29;color:#fff}
.fan-match-row.is-final .fan-match-result small{color:#b9e5c9}
.fan-match-row:hover,.fan-match-row:focus-visible{background:#f4f9f6}
.fan-day h2{font-size:.85rem;font-weight:820;color:#153b31}
.fan-scoreboard{position:relative;overflow:hidden;padding:25px 16px 27px;background:radial-gradient(circle at 50% 120%,#214c3c 0,#102d29 64%);isolation:isolate}
.fan-scoreboard::before{content:"";position:absolute;inset:auto -14% -82% -14%;height:145%;border:1px solid #ffffff19;border-radius:50%;z-index:-1;pointer-events:none}
.fan-score-grid{grid-template-columns:minmax(0,1fr) minmax(78px,auto) minmax(0,1fr);align-items:center}
.fan-score-number{padding:0;font-size:clamp(2rem,8vw,2.8rem);line-height:1;font-weight:900;letter-spacing:-.06em}
.fan-score-team{gap:9px}.fan-score-team strong{font-size:.87rem;font-weight:800}
.fan-match-state{margin-bottom:20px}.fan-score-meta{margin-top:20px}
.fan-table-head,.fan-defense-head{color:#49685a;font-weight:800;text-transform:uppercase;letter-spacing:.025em}
.fan-table-row,.fan-defense-row{min-height:54px}.fan-table-row strong,.fan-defense-row strong{font-size:.78rem}
.fan-table-row>b:last-child,.fan-defense-row>b{color:#0a6546;font-size:.98rem;font-weight:900}
.fan-rank{color:#406653;font-weight:850}
.fan-scorer-row>b{font-size:1.1rem;font-weight:900}
.fan-team-row:hover,.fan-team-row:focus-visible{background:#f4f9f6}
@media(max-width:359px){.fan-match-row{gap:4px}.fan-score-grid{grid-template-columns:minmax(0,1fr) 70px minmax(0,1fr)}}
.fan-scoreboard{background:#102d29}.fan-scoreboard::before{display:none}.fan-score-number{font-size:clamp(2.2rem,10vw,3.5rem)}.score-separator{color:#81cca0}
</style>
