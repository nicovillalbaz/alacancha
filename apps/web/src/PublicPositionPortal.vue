<script setup lang="ts">
import {computed,defineAsyncComponent,nextTick,onMounted,onUnmounted,ref,shallowRef,watch} from 'vue';
import type {PositionCompetition,PositionResult} from '@torneos/shared';
import SportTabs from './SportTabs.vue';
import Icon from './Icon.vue';
import PublicImage from './PublicImage.vue';
import PublicTeamRoster from './PublicTeamRoster.vue';
import PublicTeamTabs from './PublicTeamTabs.vue';
import PublicTeamStats from './PublicTeamStats.vue';
import PublicTeamMatches from './PublicTeamMatches.vue';
import PublicTeamLink from './PublicTeamLink.vue';
import PublicScoreGoals from './PublicScoreGoals.vue';
import TeamCrest from './TeamCrest.vue';
import {closePublicDetail,pushPublicNavigation,readPublicNavigation,publicSectionHref,matchRowClicked,type TeamMatch} from './public-navigation.ts';
import {trackPublicListScroll} from './match-list-navigation.ts';
import {recordFanView} from './public-visits.ts';
import {createPublicReads,publicPositionView,type PublicPositionView} from './public-reads.ts';

const PublicMatchTimeline=defineAsyncComponent(()=>import('./PublicMatchTimeline.vue'));

type Slot={slot_code:string;entry_id:string|null;team_id:string|null;team_name:string|null;color:string|null;has_shield:boolean};
type Team={entry_id:string;team_id:string;team_name:string;color:string|null;has_shield:boolean};
type Game={code:string;stage:'groups'|'quarterfinal'|'quadrangular';sporting_round:string;jornada_no:number|null;planned_date:string|null;home_ref:string;away_ref:string};
export type PublicDraw={tournament_id:string;tournament_name:string;public_slug:string|null;has_emblem:boolean;category_id:string;category_name:string;revision:number;snapshot:{blueprint:{name:string;opening_first_date:string;opening_second_date:string};slots:Slot[];teams?:Team[];games:Game[]}};
export type PublicDrawLink=Omit<PublicDraw,'snapshot'>;
type Competition={available:boolean;competition?:PositionCompetition;results?:PositionResult[];matches?:Array<{code:string;match_id:string}>;players?:Array<{registrationId:string;entryId:string;goals:number;name:string}>;defense?:Array<{entryId:string;played:number;goalsAgainst:number}>;titleExtra?:{decision:'no_extra'|'extra';matchId:string|null;homeEntryId:string|null;awayEntryId:string|null;date:string|null;score:{home:number;away:number;homePenalties:number;awayPenalties:number}|null;winnerEntryId:string|null}|null};
export type PublicPositionStart={categoryId:string;drawRevision:number;resultsRevision:number;section:{view:PublicPositionView;data:Competition}};
type MatchDetail={id:string;home_name:string;away_name:string;match_date:string;match_time:string;result:{status:'official'|'provisional';score:{home:number;away:number};shootout:{home:number;away:number};events:Array<{id:string;kind:string;period:string|null;minute:number|null;name:string;cardLabel:string|null;cardColor:string|null;relatedName:string|null;side:string}>}|null};
type FixtureDay={matches:MatchDetail[]};
const readPublic = createPublicReads();
const props=defineProps<{organization:{id:string;name:string;logo_id?:string|null}|null;draws:PublicDraw[];menu:PublicDrawLink[];startup:PublicPositionStart|null;selectedTournamentId:string;resultsRevision:number}>();
const emit=defineEmits<{navigate:[path:string]}>();
const current=computed(()=>props.draws.find(item=>item.tournament_id===props.selectedTournamentId)||props.draws[0]);
const tabToView:Record<string,string>={matches:'partidos',fixture:'fixture',classification:'clasificacion',scorers:'goleadores',defense:'valla',teams:'equipos'};
const publicTabs = [
  {key:'matches',label:'Partidos',icon:'ball'},{key:'fixture',label:'Fixture',icon:'calendar'},
  {key:'classification',label:'Clasificación',icon:'chart'},{key:'scorers',label:'Goleadores',icon:'ball'},
  {key:'defense',label:'Valla',icon:'shield'},{key:'teams',label:'Equipos',icon:'users'},
];
const viewToTab=Object.fromEntries(Object.entries(tabToView).map(([key,value])=>[value,key]));
let restoringNavigation=false;
const tab=ref(viewToTab[readPublicNavigation(location.search).view]||'matches'),fixtureTab=ref('dates'),classificationTab=ref('groups'),groupTab=ref<'A'|'B'>('A');
const selectedRound=ref('F1'),selectedDay=ref(0),selectorOpen=ref(!props.selectedTournamentId);
const competitionLoading=ref(false),error=ref(''),competitionRetry=ref(0);
const selectedMatch=ref<MatchDetail|null>(null),selectedGame=ref<Game|null>(null);
const selectedTeam=ref<Team|null>(null);
const teamTab=ref('players');
const extraCode='extra';
const selectedExtra=computed(()=>selectedGame.value?.code===extraCode);
trackPublicListScroll(()=>selectedGame.value?.code||selectedTeam.value?.entry_id||'');
type LoadedSection={revision:number;loadedAt:number;data:Competition};
const sections=shallowRef<Partial<Record<PublicPositionView,LoadedSection>>>({});
const scope=computed(()=>`${props.organization?.id}:${current.value?.category_id}:${current.value?.revision}`);
const view=computed(()=>{
  if(selectorOpen.value)return null;
  if(selectedTeam.value)return teamTab.value==='statistics'?'clasificacion':teamTab.value==='matches'?'resumen':null;
  if(selectedGame.value)return 'resumen';
  return publicPositionView(tabToView[tab.value]);
});
const activeSection=computed(()=>view.value?sections.value[view.value]:undefined);
const competition=computed(()=>activeSection.value?.data||null);
const scoreSection=computed(()=>view.value==='clasificacion'?sections.value.clasificacion:sections.value.resumen);
const scoreData=computed(()=>scoreSection.value?.data);
const titleExtra=computed(()=>scoreData.value?.titleExtra??sections.value.clasificacion?.data.titleExtra);
const requestedSections=computed<PublicPositionView[]>(()=>{
  if(!view.value||view.value==='equipos')return [];
  return selectedTeam.value&&teamTab.value==='statistics'?[view.value,'goleadores']:[view.value];
});
let displayedScope='';
watch([scope,requestedSections,()=>props.resultsRevision,competitionRetry,()=>props.startup],async([key,resources,revision,attempt,startup],_previous,onCleanup)=>{
  if(displayedScope!==key){
    displayedScope=key;
    sections.value={};
  }
  const category=current.value;
  const org=props.organization?.id;
  error.value='';
  competitionLoading.value=false;
  if(!org||!category||!resources.length)return;
  if(startup&&resources.includes(startup.section.view)&&!sections.value[startup.section.view]&&
    startup.categoryId===category.category_id&&startup.drawRevision===category.revision&&startup.resultsRevision===revision){
    sections.value={...sections.value,[startup.section.view]:{revision,loadedAt:Date.now(),data:startup.section.data}};
  }
  const stale=resources.filter(resource=>{
    const previous=sections.value[resource];
    return previous?.revision!==revision||Date.now()-previous.loadedAt>=15_000;
  });
  competitionLoading.value=stale.some(resource=>!sections.value[resource]);
  if(!stale.length)return;
  let active=true;
  onCleanup(()=>{active=false;});
  const loaded=await Promise.allSettled(stale.map(async resource=>{
    const query=resource==='resumen'?'resumen=1':`vista=${resource}`;
    const data=await readPublic<Competition>(`/organizations/${org}/draws/${category.category_id}/competition?${query}`,`${key}:${revision}:${attempt}`);
    return {resource,data};
  }));
  if(!active)return;
  const updated={...sections.value};
  for(const result of loaded){
    if(result.status==='rejected')error.value='No se pudo cargar esta sección.';
    else updated[result.value.resource]={revision,loadedAt:Date.now(),data:result.value.data};
  }
  sections.value=updated;
  competitionLoading.value=false;
},{immediate:true});
watch(()=>current.value?.tournament_id,()=>{
  selectedRound.value='F1';selectedDay.value=days.value[0]??0;restorePublicLocation();
});
const slots=computed(()=>new Map((current.value?.snapshot.slots||[]).map(slot=>[slot.slot_code,slot])));
const teams=computed<Team[]>(()=>current.value?.snapshot.teams||current.value?.snapshot.slots.filter(slot=>slot.entry_id&&slot.team_id&&slot.team_name).map(slot=>({entry_id:slot.entry_id!,team_id:slot.team_id!,team_name:slot.team_name!,color:slot.color,has_shield:slot.has_shield}))||[]);
const byEntry=computed(()=>new Map(teams.value.map(team=>[team.entry_id,team])));
const allGames=computed(()=>(current.value?.snapshot.games||[]).map((game,index)=>({...game,index})));
const rounds=computed(()=>[...new Set(allGames.value.map(game=>game.sporting_round))]);
const roundGames=computed(()=>allGames.value.filter(game=>game.sporting_round===selectedRound.value));
const pendingOpening=computed(()=>allGames.value.filter(game=>game.jornada_no===null));
const days=computed(()=>[...(pendingOpening.value.length?[0]:[]),...[...new Set(allGames.value.map(game=>game.jornada_no).filter((day):day is number=>day!==null))].sort((a,b)=>a-b)]);
watch(days,available=>{if(!available.includes(selectedDay.value))selectedDay.value=available[0]??0;},{immediate:true});
const dayGames=computed(()=>allGames.value.filter(game=>selectedDay.value===0?game.jornada_no===null:game.jornada_no===selectedDay.value));
const nearbyDays=computed(()=>{if(selectedDay.value<3||!dayGames.value.length)return [];const following=days.value.filter(day=>day>selectedDay.value&&allGames.value.some(game=>game.jornada_no===day)).slice(0,selectedDay.value>=10?2:1);return following.length?following:days.value.filter(day=>day===selectedDay.value-1&&allGames.value.some(game=>game.jornada_no===day));});
const matchSections=computed(()=>days.value.map(day=>({day,games:allGames.value.filter(game=>day===0?game.jornada_no===null:game.jornada_no===day)})).filter(section=>section.games.length));
const extraGame=computed<Game|undefined>(()=>titleExtra.value?.decision==='extra'&&titleExtra.value.matchId?{
  code:extraCode,stage:'quadrangular',sporting_round:'Partido extra',jornada_no:null,planned_date:titleExtra.value.date,
  home_ref:'Por definir',away_ref:'Por definir',
}:undefined);
const results=computed(()=>new Map((scoreData.value?.results||[]).map(result=>[result.code,result])));
const matches=computed(()=>{
  const published=new Map((scoreData.value?.matches||[]).map(match=>[match.code,match.match_id]));
  if(extraGame.value&&titleExtra.value?.matchId)published.set(extraCode,titleExtra.value.matchId);
  return published;
});
const scorers=computed(()=>[...(competition.value?.players||[])].filter(player=>player.goals>0).sort((a,b)=>b.goals-a.goals||a.name.localeCompare(b.name)));
const defense=computed(()=>[...(competition.value?.defense||[])].filter(team=>team.played>0).sort((a,b)=>a.goalsAgainst-b.goalsAgainst||b.played-a.played));
function crest(team:Team|Slot|undefined){return team?.has_shield&&team.team_id?`/api/v1/public/organizations/${props.organization?.id}/draws/teams/${team.team_id}/shield`:null;}
function refName(code:string){const assigned=slots.value.get(code)?.team_name;if(assigned)return assigned;if(/^[1-4][AB]$/.test(code))return `${code[0]}.º Grupo ${code[1]}`;if(/^S[1-4]$/.test(code))return `${code[1]}.º entre ganadores`;return code;}
const teamTopScorers=computed(()=>(sections.value.goleadores?.data.players||[])
  .filter(player=>player.entryId===selectedTeam.value?.entry_id&&player.goals>0)
  .sort((a,b)=>b.goals-a.goals||a.name.localeCompare(b.name)).slice(0,3));
const teamStanding=computed(()=>{
  const competition=sections.value.clasificacion?.data.competition;
  const id=selectedTeam.value?.entry_id;
  if(!id||!competition?.official.groups)return undefined;
  const rank=(table:PositionCompetition['groupA'])=>table.groups.find(row=>row.teamIds.includes(id));
  const final=competition.official.quadrangular&&competition.final?rank(competition.final):undefined;
  if(final)return {row:final,phase:'quadrangular',group:undefined,label:'Finales'} as const;
  const groupA=rank(competition.groupA),groupB=rank(competition.groupB);
  if(groupA)return {row:groupA,phase:'groups',group:'A',label:'Grupo A'} as const;
  if(groupB)return {row:groupB,phase:'groups',group:'B',label:'Grupo B'} as const;
  const general=rank(competition.general);
  if(general)return {row:general,phase:'general',group:undefined,label:'Tabla general'} as const;
});
const teamPosition=computed(()=>{
  const position=teamStanding.value;
  if(position)return `${position.row.position}.º${position.row.unresolved?' (empate)':''} · ${position.label}`;
});
const teamGoals=computed(()=>{
  const id=selectedTeam.value?.entry_id, data=sections.value.clasificacion?.data;
  if(!id||!data)return undefined;
  const total={goalsFor:0,goalsAgainst:0};
  function count(homeId:string|null,awayId:string|null,home:number,away:number){
    if(homeId===id){total.goalsFor+=home;total.goalsAgainst+=away;}
    if(awayId===id){total.goalsFor+=away;total.goalsAgainst+=home;}
  }
  for(const match of data.results||[])count(match.homeEntryId,match.awayEntryId,match.homeGoals,match.awayGoals);
  const extra=data.titleExtra;
  if(extra?.score)count(extra.homeEntryId,extra.awayEntryId,extra.score.home,extra.score.away);
  return total;
});
function openStatsSection(section:'clasificacion'|'goleadores'){
  if(section==='clasificacion'){
    classificationTab.value=teamStanding.value?.phase||'groups';
    const group=teamStanding.value?.group||current.value?.snapshot.slots.find(slot=>slot.entry_id===selectedTeam.value?.entry_id)?.slot_code[0];
    if(group==='A'||group==='B')groupTab.value=group;
  }
  pushPublicNavigation(section,null,false,()=>{
    restorePublicLocation();
    void nextTick(()=>window.scrollTo(0,0));
  });
}
function gameTeam(game:Game,side:'home'|'away'){
  const field=side==='home'?'homeEntryId':'awayEntryId';
  const participants=game.code===extraCode?titleExtra.value:scoreData.value?.competition?.participants[game.code];
  const id=participants?.[field];
  return id?byEntry.value.get(id):slots.value.get(side==='home'?game.home_ref:game.away_ref);
}
function gameName(game:Game,side:'home'|'away'){return gameTeam(game,side)?.team_name||refName(side==='home'?game.home_ref:game.away_ref);}
function gameScore(game:Game){
  if(game.code===extraCode){const score=titleExtra.value?.score;return score?`${score.home} : ${score.away}`:undefined;}
  const score=results.value.get(game.code);
  return score?`${score.homeGoals} : ${score.awayGoals}`:undefined;
}
function result(game:Game){return gameScore(game)||'–';}
const teamMatches=computed<TeamMatch[]>(()=>{
  const entryId=selectedTeam.value?.entry_id;
  if(!entryId)return [];
  const games=extraGame.value?[...allGames.value,extraGame.value]:allGames.value;
  return games.filter(game=>gameTeam(game,'home')?.entry_id===entryId||gameTeam(game,'away')?.entry_id===entryId).map(game=>{
    const score=gameScore(game);
    return {
      kind:'partido',id:game.code,home:gameName(game,'home'),away:gameName(game,'away'),
      homeEntryId:gameTeam(game,'home')?.entry_id,awayEntryId:gameTeam(game,'away')?.entry_id,
      date:game.planned_date,round:game.jornada_no?dayTitle(game.jornada_no):roundTitle(game.sporting_round),
      status:score?'official':undefined,score,
    };
  });
});
function date(value:string|null){if(!value)return 'Por definir';const [year,month,day]=value.slice(0,10).split('-');return `${day}/${month}/${year}`;}
function gameDate(game:Game){return game.planned_date?date(game.planned_date):game.sporting_round==='F1'?`${date(current.value?.snapshot.blueprint.opening_first_date||null)} / ${date(current.value?.snapshot.blueprint.opening_second_date||null)}`:'Por definir';}
function roundLabel(value:string){return /^F\d+$/.test(value)?`F${value.slice(1)}`:value==='Cuartos'?'Cuartos':value.replace('Cuadrangular ','Final ');}
function roundTitle(value:string){return /^F\d+$/.test(value)?`Fecha ${value.slice(1)}`:value.replace('Cuadrangular ','Final ');}
function dayTitle(value:number){return value===0?'J1/J2 por definir':`Jornada ${value}`;}
function dayDate(value:number){if(value===0)return `${date(current.value?.snapshot.blueprint.opening_first_date||null)} / ${date(current.value?.snapshot.blueprint.opening_second_date||null)}`;if(value===1)return date(current.value?.snapshot.blueprint.opening_first_date||null);if(value===2)return date(current.value?.snapshot.blueprint.opening_second_date||null);return date(allGames.value.find(game=>game.jornada_no===value)?.planned_date||null);}
function rows(table:NonNullable<PositionCompetition['final']>){return table.groups.flatMap(group=>group.teamIds.map(id=>({position:group.position,id,unresolved:group.unresolved,stats:table.totals.find(item=>item.teamId===id)})));}
function chooseTournament(id:string){selectorOpen.value=false;if(id!==current.value?.tournament_id)emit('navigate',`publico/${props.organization?.id}/${id}`);}
const matchLoading=ref(false),matchFailed=ref(false),matchRetry=ref(0);
function openMatch(code:string){
  const game=code===extraCode?extraGame.value:allGames.value.find(item=>item.code===code);
  if(!game)return;
  if(selectedGame.value?.code!==code)selectedMatch.value=null;
  selectedTeam.value=null;
  selectedGame.value=game;
  if(!restoringNavigation)pushPublicNavigation('partidos',{kind:'partido',id:code});
}
watch([()=>selectedGame.value?.code,()=>scoreSection.value?.revision,()=>selectedGame.value&&matches.value.get(selectedGame.value.code),scope,matchRetry],
  async([code,revision,id,key,attempt],_previous,onCleanup)=>{
    matchLoading.value=false;
    matchFailed.value=false;
    if(!code||revision!==props.resultsRevision)return;
    if(!id||!props.organization?.id){selectedMatch.value=null;return;}
    matchLoading.value=true;
    let active=true;
    onCleanup(()=>{active=false;});
    try{
      const days=await readPublic<FixtureDay[]>(`/organizations/${props.organization.id}/fixture?partido=${id}`,`${key}:${revision}:${attempt}`);
      if(active)selectedMatch.value=days.flatMap(day=>day.matches).find(match=>match.id===id)||null;
    }catch{
      if(active)matchFailed.value=true;
    }finally{
      if(active)matchLoading.value=false;
    }
  });
watch(()=>current.value?.revision,()=>{
  if(!selectedGame.value||selectedExtra.value)return;
  selectedMatch.value=null;
  selectedGame.value=allGames.value.find(item=>item.code===selectedGame.value?.code)||null;
  if(!selectedGame.value)pushPublicNavigation(tabToView[tab.value]||'partidos',null,true);
});
function openTeam(team:Team) {
  selectedMatch.value=null;
  selectedGame.value=null;
  selectedTeam.value=team;
  teamTab.value='players';
  if (!restoringNavigation) pushPublicNavigation('equipos',{kind:'equipo',id:team.entry_id});
}
function openTeamEntry(entryId:string){const team=byEntry.value.get(entryId);if(team&&selectedTeam.value?.entry_id!==entryId)openTeam(team);}
function closeDetail(){if(!closePublicDetail(readPublicNavigation(location.search).view))restorePublicLocation();}
watch(extraGame,game=>{
  const detail=readPublicNavigation(location.search).detail;
  if(game&&detail?.kind==='partido'&&detail.id===extraCode)selectedGame.value=game;
});
function restorePublicLocation(){
  const state=readPublicNavigation(location.search);
  restoringNavigation=true;
  tab.value=viewToTab[state.view]||'matches';
  selectedMatch.value=null;selectedGame.value=null;selectedTeam.value=null;
  if(state.detail?.kind==='partido')void openMatch(state.detail.id);
  else if(state.detail?.kind==='equipo'){const team=teams.value.find(item=>item.entry_id===state.detail?.id);if(team)void openTeam(team);}
  void nextTick(()=>{restoringNavigation=false;});
}
watch(tab,value=>{if(!restoringNavigation){pushPublicNavigation(tabToView[value]||'partidos');void nextTick(()=>window.scrollTo(0,0));}},{flush:'sync'});
watch(() => [props.selectedTournamentId, current.value?.tournament_id, tab.value, competitionLoading.value] as const, ([selectedId, id, value, loading]) => {
  if (id && selectedId === id && !loading) recordFanView({id, section: tabToView[value]});
}, { immediate: true, flush: 'post' });
onMounted(()=>{restorePublicLocation();window.addEventListener('popstate',restorePublicLocation);});
onUnmounted(()=>window.removeEventListener('popstate',restorePublicLocation));
</script>

<template>
  <div class="position-public">
    <header v-if="!selectedMatch&&!selectedGame&&!selectedTeam" class="public-header"><div class="public-header-top"><button type="button" class="public-back" aria-label="Volver a organizaciones" @click="emit('navigate','publico')"><Icon name="back" /></button><PublicImage v-if="organization?.logo_id" :src="`/api/v1/public/organizations/${organization.id}/logo`" class="public-org-logo" /><small>{{ organization?.name }}</small></div><button type="button" :aria-expanded="selectorOpen" @click="selectorOpen=!selectorOpen"><PublicImage v-if="current?.has_emblem && organization" :src="`/api/v1/public/organizations/${organization.id}/tournaments/${current.tournament_id}/emblem`" class="public-cup-logo" /><Icon v-else name="trophy"/><strong>{{ current?.tournament_name||'Elegí un torneo' }}</strong><Icon name="chevron"/></button></header>
    <div v-if="!selectedMatch&&!selectedGame&&!selectedTeam&&selectorOpen" class="public-selector"><button v-for="draw in menu" :key="draw.tournament_id" type="button" @click="chooseTournament(draw.tournament_id)">{{ draw.tournament_name }}<Icon name="arrow"/></button></div>
    <template v-else-if="current&&!selectedMatch&&!selectedGame&&!selectedTeam">
      <SportTabs v-model="tab" :tabs="publicTabs.map(item=>({...item,href:publicSectionHref(tabToView[item.key])}))" id="public-position" />
      <main class="public-body">
        <div v-if="error" class="public-error" role="alert">{{ error }} <button type="button" @click="competitionRetry++">Reintentar</button></div>
        <div v-if="competitionLoading&&!competition" class="public-hint" role="status">Cargando esta sección…</div>
        <section v-else-if="tab==='matches'" id="public-position-matches-panel" role="tabpanel" aria-labelledby="public-position-matches-tab">
          <div v-for="section in matchSections" :key="section.day" class="public-match-section"><h2>{{ dayTitle(section.day) }} <small>{{ dayDate(section.day) }}</small></h2><div v-for="game in section.games" :key="game.code" class="public-game" :class="{'has-result':results.has(game.code)}" @click="matchRowClicked($event)&&openMatch(game.code)"><small>{{ roundTitle(game.sporting_round) }}</small><div class="public-game-sides"><PublicTeamLink :name="gameName(game,'home')" :entry-id="gameTeam(game,'home')?.entry_id" @open="openTeamEntry"><PublicImage loading="lazy" v-if="crest(gameTeam(game,'home'))" :src="crest(gameTeam(game,'home'))!" /><b v-else>{{ game.home_ref[0] }}</b><PublicTeamLink class="fixture-team" :name="gameName(game,'home')" :entry-id="gameTeam(game,'home')?.entry_id" @open="openTeamEntry"><strong>{{ gameName(game,'home') }}</strong></PublicTeamLink></PublicTeamLink><button type="button" class="public-match-action" :data-match-list-id="game.code" :aria-label="`Abrir partido: ${gameName(game,'home')} contra ${gameName(game,'away')}`" @click="openMatch(game.code)"><em>{{ result(game) }}</em></button><PublicTeamLink class="away" :name="gameName(game,'away')" :entry-id="gameTeam(game,'away')?.entry_id" @open="openTeamEntry"><PublicImage loading="lazy" v-if="crest(gameTeam(game,'away'))" :src="crest(gameTeam(game,'away'))!" /><b v-else>{{ game.away_ref[0] }}</b><PublicTeamLink class="fixture-team" :name="gameName(game,'away')" :entry-id="gameTeam(game,'away')?.entry_id" @open="openTeamEntry"><strong>{{ gameName(game,'away') }}</strong></PublicTeamLink></PublicTeamLink></div></div></div>
        </section>
        <section v-else-if="tab==='fixture'" id="public-position-fixture-panel" role="tabpanel" aria-labelledby="public-position-fixture-tab">
          <div class="public-subtabs" role="group" aria-label="Vista de fixture"><button type="button" :aria-pressed="fixtureTab==='dates'" @click="fixtureTab='dates'">Fechas</button><button type="button" :aria-pressed="fixtureTab==='days'" @click="fixtureTab='days'">Jornadas</button></div>
          <template v-if="fixtureTab==='dates'"><div class="public-pills" role="group" aria-label="Fecha deportiva"><button v-for="round in rounds" :key="round" type="button" :aria-pressed="selectedRound===round" @click="selectedRound=round;($event.currentTarget as HTMLElement).scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'})">{{ roundLabel(round) }}</button></div><h2>{{ roundTitle(selectedRound) }}</h2><div v-for="game in roundGames" :key="game.code" class="public-fixture-row is-date" @click="matchRowClicked($event)&&openMatch(game.code)"><small>{{ game.jornada_no?`J${game.jornada_no}`:'J1/J2' }}<span>{{ gameDate(game) }}</span></small><PublicTeamLink class="fixture-team" :name="gameName(game,'home')" :entry-id="gameTeam(game,'home')?.entry_id" @open="openTeamEntry"><strong>{{ gameName(game,'home') }}</strong></PublicTeamLink><button type="button" class="public-match-action" :data-match-list-id="game.code" :aria-label="`Abrir partido: ${gameName(game,'home')} contra ${gameName(game,'away')}`" @click="openMatch(game.code)"><em>{{ result(game) }}</em></button><PublicTeamLink class="fixture-team" :name="gameName(game,'away')" :entry-id="gameTeam(game,'away')?.entry_id" @open="openTeamEntry"><strong>{{ gameName(game,'away') }}</strong></PublicTeamLink></div></template>
          <template v-else><div class="public-pills" role="group" aria-label="Jornada"><button v-for="day in days" :key="day" type="button" :aria-pressed="selectedDay===day" @click="selectedDay=day;($event.currentTarget as HTMLElement).scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'})">{{ day===0?'J1/J2':`J${day}` }}</button></div><h2>{{ dayTitle(selectedDay) }} <small>{{ dayDate(selectedDay) }}</small></h2><div v-if="!dayGames.length" class="public-hint">Aún sin partidos asignados.</div><div v-for="game in dayGames" :key="game.code" class="public-fixture-row" @click="matchRowClicked($event)&&openMatch(game.code)"><small>{{ roundTitle(game.sporting_round) }}</small><PublicTeamLink class="fixture-team" :name="gameName(game,'home')" :entry-id="gameTeam(game,'home')?.entry_id" @open="openTeamEntry"><strong>{{ gameName(game,'home') }}</strong></PublicTeamLink><button type="button" class="public-match-action" :data-match-list-id="game.code" :aria-label="`Abrir partido: ${gameName(game,'home')} contra ${gameName(game,'away')}`" @click="openMatch(game.code)"><em>{{ result(game) }}</em></button><PublicTeamLink class="fixture-team" :name="gameName(game,'away')" :entry-id="gameTeam(game,'away')?.entry_id" @open="openTeamEntry"><strong>{{ gameName(game,'away') }}</strong></PublicTeamLink></div><div v-for="nearby in nearbyDays" :key="nearby" class="public-adjacent"><button type="button" class="adjacent-day" @click="selectedDay=nearby">J{{ nearby }} · {{ dayDate(nearby) }} <Icon name="arrow" /></button><div v-for="game in allGames.filter(item=>item.jornada_no===nearby)" :key="game.code" class="adjacent-match" @click="matchRowClicked($event)&&openMatch(game.code)"><PublicTeamLink :entry-id="gameTeam(game,'home')?.entry_id" :name="gameName(game,'home')" @open="openTeamEntry">{{ gameName(game,'home') }}</PublicTeamLink><button type="button" :data-match-list-id="game.code" :aria-label="`Abrir partido: ${gameName(game,'home')} contra ${gameName(game,'away')}`" @click="openMatch(game.code)">–</button><PublicTeamLink :entry-id="gameTeam(game,'away')?.entry_id" :name="gameName(game,'away')" @open="openTeamEntry">{{ gameName(game,'away') }}</PublicTeamLink></div></div></template>
        </section>
        <section v-else-if="tab==='classification'" id="public-position-classification-panel" role="tabpanel" aria-labelledby="public-position-classification-tab">
          <div class="public-subtabs" role="group" aria-label="Etapa de clasificación"><button v-for="item in [{key:'groups',label:'Grupos'},{key:'quarterfinals',label:'Cuartos'},{key:'quadrangular',label:'Finales'},{key:'general',label:'Tabla general'}]" :key="item.key" type="button" :aria-pressed="classificationTab===item.key" @click="classificationTab=item.key">{{ item.label }}</button></div>
          <template v-if="classificationTab==='groups'"><div class="public-subtabs minor" role="group" aria-label="Elegir grupo"><button v-for="group in ['A','B'] as const" :key="group" type="button" :aria-pressed="groupTab===group" @click="groupTab=group">Grupo {{ group }}</button></div><template v-if="competition?.competition?.official.groups"><PublicTeamLink v-for="row in rows(groupTab==='A'?competition.competition.groupA:competition.competition.groupB)" :key="row.id" class="public-table-row" :entry-id="row.id" :name="byEntry.get(row.id)?.team_name||'Por definir'" content-label @open="openTeamEntry"><b>{{ row.unresolved?'=':row.position }}</b><PublicImage loading="lazy" v-if="crest(byEntry.get(row.id))" :src="crest(byEntry.get(row.id))!" /><span v-else class="public-mark">{{ groupTab }}</span><strong>{{ byEntry.get(row.id)?.team_name||'Por definir' }}</strong><small>{{ row.stats?.played }} PJ</small><b>{{ row.stats?.points }}</b></PublicTeamLink></template><template v-else><PublicTeamLink v-for="slot in current.snapshot.slots.filter(item=>item.slot_code.startsWith(groupTab))" :key="slot.slot_code" class="public-table-row" :entry-id="slot.entry_id" :name="slot.team_name||'Por sortear'" content-label @open="openTeamEntry"><b>{{ slot.slot_code }}</b><PublicImage v-if="crest(slot)" :src="crest(slot)!" /><span v-else class="public-mark">{{ groupTab }}</span><strong>{{ slot.team_name||'Por sortear' }}</strong><small>— PJ</small><b>—</b></PublicTeamLink></template></template>
          <template v-else-if="classificationTab==='general'"><template v-if="competition?.competition?.official.groups"><PublicTeamLink v-for="row in rows(competition.competition.general)" :key="row.id" class="public-table-row" :entry-id="row.id" :name="byEntry.get(row.id)?.team_name||'Por definir'" content-label @open="openTeamEntry"><b>{{ row.unresolved?'=':row.position }}</b><PublicImage loading="lazy" v-if="crest(byEntry.get(row.id))" :src="crest(byEntry.get(row.id))!" /><span v-else class="public-mark">•</span><strong>{{ byEntry.get(row.id)?.team_name||'Por definir' }}</strong><small>{{ row.stats?.played }} PJ</small><b>{{ row.stats?.points }}</b></PublicTeamLink></template><template v-else><PublicTeamLink v-for="slot in current.snapshot.slots" :key="slot.slot_code" class="public-table-row" :entry-id="slot.entry_id" :name="slot.team_name||'Por sortear'" content-label @open="openTeamEntry"><b>—</b><PublicImage v-if="crest(slot)" :src="crest(slot)!" /><span v-else class="public-mark">{{ slot.slot_code[0] }}</span><strong>{{ slot.team_name||slot.slot_code+' · Por sortear' }}</strong><small>— PJ</small><b>—</b></PublicTeamLink></template></template>
          <template v-else-if="classificationTab==='quarterfinals'"><div v-for="game in allGames.filter(item=>item.stage==='quarterfinal')" :key="game.code" class="public-stage"><small>Llave {{ game.code.slice(2) }} · J{{ game.jornada_no }}</small><strong><PublicTeamLink :entry-id="gameTeam(game,'home')?.entry_id" :name="gameName(game,'home')" @open="openTeamEntry">{{ gameName(game,'home') }}</PublicTeamLink> <em>{{ result(game) }}</em> <PublicTeamLink :entry-id="gameTeam(game,'away')?.entry_id" :name="gameName(game,'away')" @open="openTeamEntry">{{ gameName(game,'away') }}</PublicTeamLink></strong><small v-if="results.get(game.code)?.homeGoals===results.get(game.code)?.awayGoals&&results.get(game.code)?.homePenalties!==results.get(game.code)?.awayPenalties">Penales {{ results.get(game.code)?.homePenalties }} : {{ results.get(game.code)?.awayPenalties }}</small><button v-if="matches.has(game.code)" type="button" :data-match-list-id="game.code" @click="openMatch(game.code)">Ver partido ›</button></div></template>
          <template v-else><div v-if="competition?.competition?.final&&competition.competition.official.quadrangular"><PublicTeamLink v-for="row in rows(competition.competition.final)" :key="row.id" class="public-table-row" :entry-id="row.id" :name="byEntry.get(row.id)?.team_name||'Por definir'" content-label @open="openTeamEntry"><b>{{ row.unresolved?'=':row.position }}</b><PublicImage loading="lazy" v-if="crest(byEntry.get(row.id))" :src="crest(byEntry.get(row.id))!" /><span v-else class="public-mark">•</span><strong>{{ byEntry.get(row.id)?.team_name||'Por definir' }}</strong><small>{{ row.stats?.played }} PJ</small><b>{{ row.stats?.points }}</b></PublicTeamLink></div><div v-else><div v-for="seed in [1,2,3,4]" :key="seed" class="public-table-row"><b>{{ seed }}</b><span class="public-mark">•</span><strong>Por definir</strong><small>— PJ</small><b>—</b></div></div><div v-for="game in allGames.filter(item=>item.stage==='quadrangular')" :key="game.code" class="public-stage"><small>{{ roundTitle(game.sporting_round) }} · J{{ game.jornada_no }}</small><strong><PublicTeamLink :entry-id="gameTeam(game,'home')?.entry_id" :name="gameName(game,'home')" @open="openTeamEntry">{{ gameName(game,'home') }}</PublicTeamLink> <em>{{ result(game) }}</em> <PublicTeamLink :entry-id="gameTeam(game,'away')?.entry_id" :name="gameName(game,'away')" @open="openTeamEntry">{{ gameName(game,'away') }}</PublicTeamLink></strong><button v-if="matches.has(game.code)" type="button" :data-match-list-id="game.code" @click="openMatch(game.code)">Ver partido ›</button></div><div v-if="competition?.titleExtra?.decision==='extra'" class="public-stage"><small>Partido extra</small><button v-if="competition.titleExtra.matchId" type="button" @click="openMatch(extraCode)">Ver partido ›</button><strong><PublicTeamLink :entry-id="competition.titleExtra.homeEntryId" :name="byEntry.get(competition.titleExtra.homeEntryId||'')?.team_name||'Equipo'" @open="openTeamEntry">{{ byEntry.get(competition.titleExtra.homeEntryId||'')?.team_name }}</PublicTeamLink> <em>{{ competition.titleExtra.score?`${competition.titleExtra.score.home} : ${competition.titleExtra.score.away}`:'–' }}</em> <PublicTeamLink :entry-id="competition.titleExtra.awayEntryId" :name="byEntry.get(competition.titleExtra.awayEntryId||'')?.team_name||'Equipo'" @open="openTeamEntry">{{ byEntry.get(competition.titleExtra.awayEntryId||'')?.team_name }}</PublicTeamLink></strong><small v-if="competition.titleExtra.score?.home===competition.titleExtra.score?.away&&competition.titleExtra.score?.homePenalties!==competition.titleExtra.score?.awayPenalties">Penales {{ competition.titleExtra.score?.homePenalties }} : {{ competition.titleExtra.score?.awayPenalties }}</small><strong v-if="competition?.titleExtra?.winnerEntryId">🏆 Campeón: {{ byEntry.get(competition.titleExtra.winnerEntryId)?.team_name }}</strong></div></template>
        </section>
        <section v-else-if="tab==='scorers'" id="public-position-scorers-panel" role="tabpanel" aria-labelledby="public-position-scorers-tab">
          <div v-if="!scorers.length" class="public-hint">Aún sin goles registrados.</div>
          <PublicTeamLink v-for="(player,index) in scorers" :key="player.registrationId" class="public-stat-row" :entry-id="player.entryId" :name="byEntry.get(player.entryId)?.team_name||'Equipo'" content-label @open="openTeamEntry">
            <b>{{ index+1 }}</b>
            <TeamCrest size="sm" public-draw :name="byEntry.get(player.entryId)?.team_name||'Equipo'" :team-id="byEntry.get(player.entryId)?.team_id" :organization-id="organization?.id" :color="byEntry.get(player.entryId)?.color||undefined" :has-shield="byEntry.get(player.entryId)?.has_shield" />
            <strong>{{ player.name }}<small>{{ byEntry.get(player.entryId)?.team_name }}</small></strong>
            <b>⚽ {{ player.goals }}</b>
          </PublicTeamLink>
        </section>
        <section v-else-if="tab==='defense'" id="public-position-defense-panel" role="tabpanel" aria-labelledby="public-position-defense-tab">
          <div v-if="!defense.length" class="public-hint">Aún sin partidos oficiales.</div>
          <PublicTeamLink v-for="(team,index) in defense" :key="team.entryId" class="public-stat-row" :entry-id="team.entryId" :name="byEntry.get(team.entryId)?.team_name||'Equipo'" content-label @open="openTeamEntry">
            <b>{{ index+1 }}</b>
            <TeamCrest size="sm" public-draw :name="byEntry.get(team.entryId)?.team_name||'Equipo'" :team-id="byEntry.get(team.entryId)?.team_id" :organization-id="organization?.id" :color="byEntry.get(team.entryId)?.color||undefined" :has-shield="byEntry.get(team.entryId)?.has_shield" />
            <strong>{{ byEntry.get(team.entryId)?.team_name }}<small>{{ team.played }} PJ</small></strong>
            <b>{{ team.goalsAgainst }} GC</b>
          </PublicTeamLink>
        </section>
        <section v-else id="public-position-teams-panel" class="public-team-list" role="tabpanel" aria-labelledby="public-position-teams-tab"><button v-for="team in teams" :key="team.entry_id" type="button" class="public-team" :data-match-list-id="team.entry_id" @click="openTeam(team)"><PublicImage loading="lazy" v-if="crest(team)" :src="crest(team)!" /><span v-else class="public-mark">{{ team.team_name.slice(0,2).toUpperCase() }}</span><strong>{{ team.team_name }}</strong><Icon name="arrow" /></button></section>
      </main>
    </template>
    <section v-if="selectedMatch" class="public-detail"><button type="button" class="public-detail-close" @click="closeDetail">‹ Volver</button><div class="public-score with-logos"><small>{{ selectedMatch.result?.status==='official'?'RESULTADO OFICIAL':selectedMatch.result?'PROVISIONAL':'PARTIDO' }}</small><div><PublicTeamLink class="public-score-team" :name="selectedMatch.home_name" :entry-id="selectedGame&&gameTeam(selectedGame,'home')?.entry_id" @open="openTeamEntry"><PublicImage v-if="selectedGame && crest(gameTeam(selectedGame,'home'))" :src="crest(gameTeam(selectedGame,'home'))!" /><span>{{ selectedMatch.home_name }}</span></PublicTeamLink><b>{{ selectedMatch.result?.score.home ?? '–' }}<span class="score-separator"> : </span>{{ selectedMatch.result?.score.away ?? '–' }}</b><PublicTeamLink class="public-score-team" :name="selectedMatch.away_name" :entry-id="selectedGame&&gameTeam(selectedGame,'away')?.entry_id" @open="openTeamEntry"><PublicImage v-if="selectedGame && crest(gameTeam(selectedGame,'away'))" :src="crest(gameTeam(selectedGame,'away'))!" /><span>{{ selectedMatch.away_name }}</span></PublicTeamLink></div><p v-if="selectedMatch.result&&(selectedMatch.result.shootout.home||selectedMatch.result.shootout.away)">Penales {{ selectedMatch.result.shootout.home }} : {{ selectedMatch.result.shootout.away }}</p><PublicScoreGoals v-if="selectedMatch.result" :events="selectedMatch.result.events" :home-name="selectedMatch.home_name" :away-name="selectedMatch.away_name" /></div><div class="public-events"><h2>Eventos</h2><p v-if="matchFailed" class="public-error" role="alert">No se pudo actualizar la ficha. <button type="button" @click="matchRetry++">Reintentar</button></p><PublicMatchTimeline :events="selectedMatch.result?.events || []" :home-name="selectedMatch.home_name" :away-name="selectedMatch.away_name" /></div></section>
    <section v-else-if="selectedGame" class="public-detail"><button type="button" class="public-detail-close" @click="closeDetail">‹ Volver</button><div class="public-score"><small>{{ roundTitle(selectedGame.sporting_round) }} · {{ selectedGame.jornada_no?`J${selectedGame.jornada_no}`:selectedExtra?gameDate(selectedGame):'J1/J2 por definir' }}</small><div><PublicTeamLink class="public-score-team" :name="gameName(selectedGame,'home')" :entry-id="selectedGame&&gameTeam(selectedGame,'home')?.entry_id" @open="openTeamEntry"><PublicImage loading="lazy" v-if="crest(gameTeam(selectedGame,'home'))" :src="crest(gameTeam(selectedGame,'home'))!" />{{ gameName(selectedGame,'home') }}</PublicTeamLink><b>{{ result(selectedGame) }}</b><PublicTeamLink class="public-score-team" :name="gameName(selectedGame,'away')" :entry-id="selectedGame&&gameTeam(selectedGame,'away')?.entry_id" @open="openTeamEntry"><PublicImage loading="lazy" v-if="crest(gameTeam(selectedGame,'away'))" :src="crest(gameTeam(selectedGame,'away'))!" />{{ gameName(selectedGame,'away') }}</PublicTeamLink></div><p>{{ gameDate(selectedGame) }}</p></div><div class="public-events">
      <p v-if="error" class="public-error" role="alert">{{ error }} <button type="button" @click="competitionRetry++">Reintentar</button></p>
      <p v-else-if="matchFailed" class="public-error" role="alert">No se pudo cargar la ficha. <button type="button" @click="matchRetry++">Reintentar</button></p>
      <p v-else-if="matchLoading||(competitionLoading&&!competition)" class="public-hint" role="status">Cargando ficha…</p>
      <h2 v-else>Partido por programar</h2>
    </div></section>
    <section v-else-if="selectedTeam" class="public-detail"><button type="button" class="public-detail-close" @click="closeDetail">‹ Volver</button><div class="public-team-hero"><PublicImage v-if="crest(selectedTeam)" :src="crest(selectedTeam)!" /><span v-else class="public-mark">{{ selectedTeam.team_name.slice(0,2).toUpperCase() }}</span><h1>{{ selectedTeam.team_name }}</h1></div><PublicTeamTabs v-model="teamTab"><template #players><PublicTeamRoster v-if="organization&&current" :path="`/organizations/${organization.id}/draws/${current.category_id}/teams/${selectedTeam.entry_id}/players`" :revision="`${scope}:${resultsRevision}`" /></template><template #matches><PublicTeamMatches :matches="teamMatches" :loading="competitionLoading" :error="error" @open="openMatch($event.id)" @open-team="openTeamEntry" @retry="competitionRetry++" /></template><template #statistics><PublicTeamStats :position="teamPosition" :goals="teamGoals" :scorers="teamTopScorers" :standings-href="publicSectionHref('clasificacion')" has-scorers-table :loading="competitionLoading" :error="error" @navigate="openStatsSection" @retry="competitionRetry++" /></template></PublicTeamTabs></section>
  </div>
</template>

<style scoped>
.position-public{min-height:100svh;background:#fff;color:#10252b}.public-header{padding:12px 16px 15px;background:#10252b;color:#fff}.public-header small{display:block;margin-bottom:5px;color:#a3d7bd;font-size:.63rem;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.public-header button{display:flex;align-items:center;gap:9px;width:100%;min-height:38px;padding:0;border:0;background:transparent;color:inherit;text-align:left;font:inherit}.public-header button strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1rem}.public-header .icon{width:17px;height:17px;flex:none}.public-selector{padding:0 16px}.public-selector button{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:52px;border:0;border-bottom:1px solid #dce7e0;background:#fff;text-align:left;font:inherit;font-size:.78rem;font-weight:700}.public-selector .icon{width:15px}.public-body{max-width:880px;margin:auto;padding:8px 16px 40px}.public-body h2{margin:11px 0 7px;font-size:.8rem}.public-body h2 small{margin-left:6px;color:#6b8176;font-size:.67rem;font-weight:500}.public-subtabs,.public-pills{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid #dce7e0}.public-subtabs::-webkit-scrollbar,.public-pills::-webkit-scrollbar{display:none}.public-subtabs button,.public-pills button{flex:none;min-height:43px;padding:7px 12px;border:0;border-bottom:2px solid transparent;background:#fff;color:#5c7168;font:inherit;font-size:.73rem;font-weight:650}.public-subtabs button[aria-pressed=true],.public-pills button[aria-pressed=true]{border-bottom-color:#078454;color:#075e40;font-weight:800}.public-subtabs.minor{margin:6px 0 9px}.public-hint{padding:18px 1px;color:#708178;font-size:.76rem}.public-error{padding:8px;color:#a3352d;font-size:.76rem}.public-error button{min-height:42px;border:0;background:transparent;color:#08714c;font:inherit;font-weight:750}.public-match-section{margin:6px 0 18px}.public-match-section+.public-match-section{border-top:5px solid #f3f7f4}.public-game{padding:8px 0;border-top:1px solid #e5ede8}.public-game>small{display:block;color:#56796a;font-size:.64rem;font-weight:700}.public-game-sides{display:grid;grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr);gap:7px;align-items:center;min-height:45px}.public-game-sides :is(span,a){display:flex;align-items:center;gap:7px;min-width:0}.public-game-sides :is(span,a).away{flex-direction:row-reverse;text-align:right}.public-game-sides img,.public-game-sides :is(span,a)>b{display:grid;place-items:center;flex:none;width:27px;height:27px;object-fit:contain;border-radius:50%;background:#e6efe9;color:#075d3f;font-size:.58rem}.public-game-sides strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem}.public-game-sides em{font-style:normal;font-size:.76rem;font-weight:800;text-align:center;font-variant-numeric:tabular-nums}.public-game>button,.public-stage button{display:block;margin-left:auto;min-height:33px;border:0;background:#fff;color:#08714c;font:inherit;font-size:.7rem;font-weight:750}.public-fixture-row{display:grid;grid-template-columns:50px minmax(0,1fr) 28px minmax(0,1fr);gap:7px;align-items:center;min-height:55px;border-top:1px solid #e5ede8}.public-fixture-row small{color:#25714f;font-size:.66rem;font-weight:750}.public-fixture-row small span{display:block;color:#75877c;font-size:.6rem;font-weight:500}.public-fixture-row strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem}.public-fixture-row .fixture-team:last-child{text-align:right}.public-fixture-row em{font-style:normal;text-align:center;color:#60766c;font-size:.68rem}.public-table-row{display:grid;grid-template-columns:24px 27px minmax(0,1fr) 37px 25px;gap:6px;align-items:center;min-height:46px;border-top:1px solid #e5ede8;font-size:.73rem}.public-table-row>b{color:#086744}.public-table-row>b:last-child{text-align:right}.public-table-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.public-table-row small{color:#687c71;text-align:right;font-size:.63rem}.public-table-row img,.public-team img,.public-mark{display:grid;place-items:center;flex:none;width:27px;height:27px;object-fit:contain;border-radius:50%;background:#e6efe9;color:#075d3f;font-size:.59rem;font-weight:800}.public-stage{padding:12px 0;border-top:1px solid #e5ede8}.public-stage small{display:block;color:#23714e;font-size:.67rem;font-weight:750}.public-stage strong{display:block;margin-top:5px;font-size:.78rem}.public-stage em{margin:0 5px;color:#697e72;font-style:normal;font-size:.7rem}.public-stat-row{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;min-height:52px;border-top:1px solid #e5ede8;font-size:.77rem}.public-stat-row>b{color:#08714c}.public-stat-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.public-stat-row small{display:block;color:#698075;font-size:.65rem;font-weight:500}.public-team{display:flex;align-items:center;gap:9px;min-height:53px;border-bottom:1px solid #e5ede8}.public-team strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem}.public-detail-close{min-height:50px;padding:0 16px;border:0;background:#fff;color:#0b6246;font:inherit;font-weight:750}.public-score{padding:26px 16px;background:#10252b;color:#fff;text-align:center}.public-score>small{color:#a5ddbd;font-size:.68rem;font-weight:800}.public-score>div:first-of-type{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:center;margin-top:20px}.public-score .public-score-team{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:.76rem}.public-score b{font-size:1.4rem}.public-score.with-logos .public-score-team{display:flex;align-items:center;gap:7px;text-align:left}.public-score.with-logos .public-score-team:last-child{flex-direction:row-reverse;text-align:right}.public-score.with-logos .public-score-team img{flex:none;width:28px;height:28px;object-fit:contain;border-radius:50%;background:#fff}.public-score.with-logos .public-score-team span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.public-score p{margin:14px 0 0;color:#d4eadc;font-size:.73rem}.public-events{padding:14px 16px}.public-events h2{font-size:.85rem}.public-events>.public-player{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;min-height:50px;border-top:1px solid #e5ede8;font-size:.75rem}.public-events strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.public-events small{color:#688075}button:focus-visible{outline:3px solid #0cac70;outline-offset:1px}@media(max-width:350px){.public-fixture-row{grid-template-columns:42px minmax(0,1fr) 20px minmax(0,1fr);gap:4px}.public-game-sides{grid-template-columns:minmax(0,1fr) 30px minmax(0,1fr);gap:4px}}
.public-adjacent{position:relative;display:grid;gap:6px;width:100%;margin-top:15px;padding:10px 28px 10px 0;border:0;border-top:2px solid #dce7e0;background:#fff;color:#10252b;text-align:left;font:inherit}.public-adjacent span{color:#176b4b;font-size:.7rem;font-weight:800}.public-adjacent strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;font-weight:600}.public-adjacent .icon{position:absolute;right:2px;top:11px;width:16px;height:16px;color:#176b4b}.public-adjacent:focus-visible{outline:3px solid #078454;outline-offset:2px}
.public-fixture-row.is-date{grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr);row-gap:2px;padding:6px 0}.public-fixture-row.is-date small{grid-column:1/-1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.public-fixture-row.is-date small span{display:inline;margin-left:7px}
.public-header-top{display:flex;align-items:center;gap:7px;min-height:23px;margin-bottom:3px}.public-header-top small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0}.public-header .public-back{display:grid;place-items:center;flex:none;width:32px;min-height:32px;margin-left:-8px;border-radius:50%}.public-header .public-back .icon{width:17px;height:17px}.public-org-logo{flex:none;width:18px;height:18px;object-fit:contain;border-radius:50%;background:#fff}.public-cup-logo{flex:none;width:26px;height:26px;object-fit:contain;border-radius:5px;background:#fff}
.public-match-section+.public-match-section{border-top:1px solid #e5ede8;padding-top:8px}.public-game{display:block;width:100%;border:0;border-bottom:1px solid #e5ede8;background:#fff;color:inherit;text-align:left;font:inherit;cursor:pointer}.public-game:hover,.public-team:hover{background:#f6faf7}.public-team-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:22px}.public-team{width:100%;padding:0 8px 0 0;border:0;border-bottom:1px solid #e5ede8;background:#fff;text-align:left;font:inherit;color:inherit;cursor:pointer}.public-team>.icon{width:15px;height:15px;margin-left:auto;color:#688075}.public-score .public-score-team img{display:block;width:44px;height:44px;object-fit:contain;margin:0 auto 8px}.public-team-hero{display:grid;justify-items:center;gap:10px;padding:26px 16px;background:#10252b;color:#fff;text-align:center}.public-team-hero img,.public-team-hero .public-mark{width:58px;height:58px;object-fit:contain}.public-team-hero h1{max-width:100%;margin:0;font-size:1rem;overflow-wrap:anywhere}.public-player{display:flex!important;gap:10px!important}.public-player .icon{width:17px;height:17px;color:#08714c}@media(max-width:600px){.public-team-list{grid-template-columns:minmax(0,1fr)}}
/* Jerarquía de partido y tablas sin introducir tarjetas ni pasos nuevos. */
.public-body h2{font-size:.87rem;font-weight:820;color:#153b31}
.public-match-section{margin-bottom:15px}.public-match-section+.public-match-section{padding-top:11px}
.public-game{padding:10px 0 11px;transition:background-color .15s ease}.public-game:hover,.public-game:focus-visible{background:#f4f9f6}
.public-game>small{font-size:.66rem;color:#4b725e}
.public-game-sides{grid-template-columns:minmax(0,1fr) 50px minmax(0,1fr);min-height:49px;gap:8px}
.public-game-sides img,.public-game-sides :is(span,a)>b{width:32px;height:32px;background:#edf4ee}
.public-game-sides strong{font-size:.76rem;font-weight:760}
.public-game-sides em{display:grid;place-items:center;min-height:30px;padding:3px 4px;border-radius:6px;background:#eff3f0;color:#173d34;font-size:.92rem;font-weight:850;letter-spacing:-.03em}
.public-game.has-result .public-game-sides em{background:#102d29;color:#fff}
.public-table-row{min-height:51px;border-top-color:#e5ede8}.public-table-row strong{font-size:.77rem;font-weight:720}
.public-table-row>b:last-child{color:#0a6546;font-size:.91rem;font-weight:900}
.public-stat-row>b:last-child{font-size:.99rem;font-weight:900}
.public-stat-row{grid-template-columns:24px 27px minmax(0,1fr) auto}
.public-score{position:relative;overflow:hidden;isolation:isolate;background:radial-gradient(circle at 50% 120%,#214c3c 0,#102d29 64%)}
.public-score::before{content:"";position:absolute;inset:auto -14% -82% -14%;height:145%;border:1px solid #ffffff19;border-radius:50%;z-index:-1;pointer-events:none}
.public-score b{font-size:clamp(1.9rem,8vw,2.6rem);font-weight:900;letter-spacing:-.06em}
@media(max-width:350px){.public-game-sides{grid-template-columns:minmax(0,1fr) 42px minmax(0,1fr);gap:4px}.public-game-sides img,.public-game-sides :is(span,a)>b{width:28px;height:28px}}

.public-score.with-logos{max-width:880px;margin:auto;background:#102d29}
.public-score.with-logos::before{display:none}
.public-score.with-logos>div:first-of-type{align-items:center;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}
.public-score.with-logos .public-score-team,.public-score.with-logos .public-score-team:last-child{display:grid;justify-items:center;align-content:center;text-align:center;gap:6px;overflow-wrap:anywhere}
.public-score.with-logos .public-score-team img{width:clamp(42px,13vw,64px);height:clamp(42px,13vw,64px);margin:0;padding:4px}
.public-score.with-logos .public-score-team span{white-space:normal;font-size:.84rem}
.public-score.with-logos b{white-space:nowrap;font-size:clamp(2.2rem,10vw,3.5rem);line-height:1}
.score-separator{color:#81cca0}
.public-match-action{border:0;background:transparent;padding:0;min-height:44px;color:inherit;cursor:pointer}
.public-fixture-row:hover{background:#f4f9f6;cursor:pointer}
.public-adjacent button{display:block;border:0;background:transparent;padding:5px 0;min-height:36px;color:inherit;font:inherit;text-align:left;cursor:pointer}
.public-adjacent button:hover{text-decoration:underline}
.public-adjacent .adjacent-day{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;color:#25714f;font-weight:750}
.adjacent-match{display:grid;grid-template-columns:minmax(0,1fr) 36px minmax(0,1fr);gap:6px;align-items:center;font-size:.74rem;cursor:pointer}
.adjacent-match>a:last-child{text-align:right}
.adjacent-match button{text-align:center}
</style>
