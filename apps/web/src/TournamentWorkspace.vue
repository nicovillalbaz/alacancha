<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { knockoutRoundName, previewCompetitionBracket, type FixtureOverview, type MatchdaySummary, type PlannedRound, type TeamSummary, type TournamentSummary } from '@torneos/shared';
import Icon from './Icon.vue';
import BracketView from './BracketView.vue';
import SportTabs from './SportTabs.vue';

interface CaseRow { id: string; entry_id: string; team_name: string; summary: string; fine_amount_guaranies: number | null }
interface StatsRow {
  officialMatches?: number;
  entries: Array<{ id: string; name: string }>;
  players: Array<{ registrationId: string; entryId: string; name: string; publicName: boolean; goals: number }>;
  defense: Array<{ entryId: string; played: number; goalsAgainst: number }>;
  tables: Array<{ groupNo: number | null; groups: Array<{ position: number; teamIds: string[]; unresolved: boolean }>; totals: Array<{ teamId: string; points: number; played: number; goalsFor: number; goalsAgainst: number }> }>;
}
const props = defineProps<{ tournament: TournamentSummary; categories: TournamentSummary[]; entries: TeamSummary[]; days: MatchdaySummary[]; officialMatchIds: string[]; scores:Record<string,{home:number;away:number}>; cases: Record<string, CaseRow[]>; stats: Record<string, StatsRow>; brackets: Record<string, FixtureOverview>; section: string; dayId?: string; canManage: boolean; organizationId: string; csrfToken:string }>();
const emit=defineEmits<{refresh:[]}>();
const statsCategoryId=ref(props.categories[0]?.category_id||'');
const statsTab=ref('classification');
const matchesTab=ref('dates');
const statsCategory=computed(()=>props.categories.find(item=>item.category_id===statsCategoryId.value)||props.categories[0]);
const statsTabs=computed(()=>[
  ...(statsCategory.value?.rules.initialPhase?.mode==='knockout'?[]:[{key:'classification',label:'Clasificación',icon:'chart'}]),
  {key:'scorers',label:'Goleadores',icon:'ball'},
  {key:'defense',label:'Valla',icon:'shield'},
  ...(statsCategory.value&&bracketRounds(statsCategory.value).length?[{key:'bracket',label:'Cuadro',icon:'trophy'}]:[]),
]);
watch(()=>props.tournament.id,()=>{statsCategoryId.value=props.categories[0]?.category_id||'';statsTab.value='classification';matchesTab.value='dates';});
watch(statsTabs,(tabs)=>{if(!tabs.some(tab=>tab.key===statsTab.value))statsTab.value=tabs[0]?.key||'scorers';},{immediate:true});
const drawOpen=ref(false),drawCategoryId=ref(''),drawLegs=ref<1|2>(1),drawBusy=ref(false),drawError=ref('');
const activeDays=computed(()=>props.days.filter(day=>!day.archivedAt));
const archivedDays=computed(()=>props.days.filter(day=>!!day.archivedAt));
const restoringDay=ref('');
async function restoreDay(dayId:string){if(restoringDay.value)return;restoringDay.value=dayId;drawError.value='';try{const response=await fetch(`/api/v1/organizations/${props.organizationId}/matchdays/${dayId}/restore`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':props.csrfToken}});const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo recuperar.');emit('refresh');}catch(cause){drawError.value=cause instanceof Error?cause.message:'No se pudo recuperar.';}finally{restoringDay.value='';}}
const drawable=computed(()=>props.categories.filter(category=>category.rule_status==='published'&&category.rules.competitionPlan?.rounds[0]?.pairing!=='positions'&&props.entries.filter(entry=>entry.category_id===category.category_id&&entry.status==='active').length>=2&&props.brackets[category.category_id]?.phase?.status!=='generated'&&!props.days.some(day=>day.matches.some(match=>match.category_id===category.category_id))));
const drawMode=computed(()=>props.categories.find(item=>item.category_id===drawCategoryId.value)?.rules.initialPhase?.mode);
function openDraw(){drawCategoryId.value=drawable.value[0]?.category_id||'';drawLegs.value=props.categories.find(item=>item.category_id===drawCategoryId.value)?.rules.initialPhase?.legs===2?2:1;drawError.value='';drawOpen.value=true;}
async function draw(){if(!drawCategoryId.value||drawBusy.value)return;drawBusy.value=true;drawError.value='';try{const root=`/api/v1/organizations/${props.organizationId}/categories/${drawCategoryId.value}/fixture`;const send=async(path:string,body:object)=>{const response=await fetch(root+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':props.csrfToken},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(value.message||'No se pudo sortear.');return value;};const phase=await send('/phase',{});await send('/generate',{expectedRevision:phase.revision,...(drawMode.value==='knockout'?{}:{legs:drawLegs.value}),createMatchdays:true});drawOpen.value=false;emit('refresh');}catch(cause){drawError.value=cause instanceof Error?cause.message:'No se pudo sortear.';}finally{drawBusy.value=false;}}
const fines = computed(() => Object.values(props.cases).flat().filter(item => item.fine_amount_guaranies !== null && item.fine_amount_guaranies > 0));
const categoryIds = computed(() => new Set(props.categories.map(item => item.category_id)));
function matches(day: MatchdaySummary) { return day.matches.filter(item => categoryIds.value.has(item.category_id)); }
function entryColor(entryId:string){return props.entries.find(entry=>entry.entry_id===entryId)?.color||'#165d46';}
function entryShield(entryId:string){const team=props.entries.find(entry=>entry.entry_id===entryId);return team?.has_shield?`/api/v1/organizations/${props.organizationId}/teams/${team.id}/shield`:null;}
function initials(name:string){return name.split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase();}
const visibleDays = computed(() => props.dayId ? activeDays.value.filter(day => day.id === props.dayId) : activeDays.value);
const roundByMatchId=computed(()=>{const result=new Map<string,string>();for(const category of props.categories){const slots=props.brackets[category.category_id]?.bracket||[];for(const stage of new Set(slots.map(slot=>slot.stage))){const name=stage===1&&category.rules.competitionPlan?.repechage?'Repechaje':knockoutRoundName(slots.filter(slot=>slot.stage===stage).length*2);for(const slot of slots.filter(slot=>slot.stage===stage))for(const id of [slot.match_id,slot.return_match_id,slot.decider_match_id])if(id)result.set(id,name);}}return result;});
const legByMatchId=computed(()=>{const result=new Map<string,string>();for(const fixture of Object.values(props.brackets))for(const slot of fixture.bracket){if(slot.match_id&&slot.return_match_id)result.set(slot.match_id,'Ida');if(slot.return_match_id)result.set(slot.return_match_id,'Vuelta');if(slot.decider_match_id)result.set(slot.decider_match_id,'Desempate');}return result;});
function dayTitle(day:MatchdaySummary){const own=matches(day),names=[...new Set(own.map(match=>roundByMatchId.value.get(match.id)))];if(names.length===1&&names[0]){const legs=[...new Set(own.map(match=>legByMatchId.value.get(match.id)))];return legs.length===1&&legs[0]?`${names[0]} · ${legs[0]}`:names[0];}return names.length>1&&names.every(Boolean)?'Eliminación':`Fecha ${day.ordinal}`;}
function matchFlyerKind(matchId:string){return props.officialMatchIds.includes(matchId)?'result':'match';}
function canFlyer(category: TournamentSummary) { const entries = props.entries.filter(entry => entry.category_id === category.category_id && entry.status === 'active'); return props.canManage && props.tournament.status === 'published' && category.rule_status === 'published' && entries.length > 0 && entries.every(entry => entry.public_visible); }
function standings(stats: StatsRow) {
  return stats.tables.flatMap(table => table.groups.flatMap(group => group.teamIds.map(teamId => {
    const total = table.totals.find(item => item.teamId === teamId);
    return { key: `${table.groupNo ?? 'all'}-${teamId}`, groupNo: table.groupNo, position: group.position, unresolved: group.unresolved, name: stats.entries.find(item => item.id === teamId)?.name || 'Equipo', color:props.entries.find(item=>item.entry_id===teamId)?.color||'#165d46', points: total?.points ?? 0, played: total?.played ?? 0, goalsFor: total?.goalsFor ?? 0, goalsAgainst: total?.goalsAgainst ?? 0 };
  })));
}
function standingsGroups(stats:StatsRow){return [...new Set(standings(stats).map(row=>row.groupNo))].map(groupNo=>({groupNo,rows:standings(stats).filter(row=>row.groupNo===groupNo)}));}
function defenses(stats: StatsRow) {
  return stats.defense.filter(item => item.played > 0).map(item => ({ id: item.entryId, name: stats.entries.find(entry => entry.id === item.entryId)?.name || 'Equipo', played: item.played, goalsAgainst: item.goalsAgainst })).sort((a,b) => a.goalsAgainst - b.goalsAgainst || b.played - a.played || a.name.localeCompare(b.name, 'es'));
}
function bracketRounds(category:TournamentSummary):PlannedRound[]{
  const slots=props.brackets[category.category_id]?.bracket||[];
  if(!slots.length)return category.rules.competitionPlan?previewCompetitionBracket(category.rules.competitionPlan,category.rules.initialPhase?.groupCount??null):[];
  function side(name:string|null,sourceId:string|null){if(name)return name;if(!sourceId)return 'Por definir';const source=slots.find(item=>item.id===sourceId);return source?`Ganador llave ${source.stage}.${source.slot}`:'Por definir';}
  return [...new Set(slots.map(item=>item.stage))].map(stage=>{const ties=slots.filter(item=>item.stage===stage).sort((a,b)=>a.slot-b.slot),size=ties.length*2;return{size,name:stage===1&&category.rules.competitionPlan?.repechage?'Repechaje':knockoutRoundName(size),pairing:'positions' as const,legs:ties.some(item=>item.return_match_id)?2 as const:1 as const,ties:ties.map(item=>({slot:item.slot,home:side(item.home_name,item.home_source_id),away:side(item.away_name,item.away_source_id),matchId:item.decider_match_id||item.return_match_id||item.match_id||null,homeScore:item.return_match_id?null:props.scores[item.match_id||'']?.home??null,awayScore:item.return_match_id?null:props.scores[item.match_id||'']?.away??null,twoLegs:!!item.return_match_id,legs:[item.match_id&&{label:'Ida',matchId:item.match_id},item.return_match_id&&{label:'Vuelta',matchId:item.return_match_id},item.decider_match_id&&{label:'Desempate',matchId:item.decider_match_id}].filter(Boolean)}))};});
}
function openBracketMatch(matchId:string){const day=props.days.find(item=>item.matches.some(match=>match.id===matchId));const category=props.categories.find(item=>item.category_id===day?.matches.find(match=>match.id===matchId)?.category_id);if(props.officialMatchIds.includes(matchId)&&category){location.hash=`#/partido/${category.category_id}/${matchId}`;return;}location.hash=day?`#/torneo/${props.tournament.id}/fixture/${day.id}/${matchId}`:category?`#/programar/${category.category_id}/${matchId}`:`#/torneo/${props.tournament.id}/fixture`;}
</script>

<template>
  <section class="tournament-workspace">
    <div v-if="section === 'equipos'">
      <div class="between"><h2>Equipos</h2><a v-if="canManage" class="btn primary" :href="`#/nuevo-equipo/${tournament.id}`"><Icon name="plus" />Agregar</a></div>
      <div v-if="!entries.length" class="empty-list">Todavía no hay equipos.</div>
      <div v-for="entry in entries" :key="entry.entry_id" class="workspace-team">
        <a :href="`#/equipo/${entry.id}`" class="workspace-team-name"><span class="team-mark" :style="{ background: entry.color }"><Icon name="shield" /></span><span><strong>{{ entry.name }}</strong><small>{{ entry.category_name }}</small></span><Icon name="arrow" /></a>
        <div class="workspace-actions"><a :href="`#/buena-fe/${entry.entry_id}`"><Icon name="users" />Jugadores</a><a v-if="canManage" :href="`#/torneo/${tournament.id}/pagos/${entry.entry_id}`"><Icon name="card" />Pagos</a></div>
      </div>
    </div>
    <div v-else-if="section === 'multas'">
      <h2>Multas</h2>
      <div v-if="!fines.length" class="empty-list">Sin multas registradas.</div>
      <a v-for="item in fines" :key="item.id" class="workspace-line" :href="`#/disciplina/${item.entry_id}`"><Icon name="card" /><span><strong>{{ item.team_name }}</strong><small>{{ item.summary }} · Gs. {{ item.fine_amount_guaranies?.toLocaleString('es-PY') }}</small></span><Icon name="arrow" /></a>
    </div>
    <div v-else-if="section === 'fixture'">
      <div class="between"><h2>Fixture</h2><div class="workspace-actions"><button v-if="canManage&&drawable.length" type="button" class="btn" @click="openDraw">Sortear</button><a v-if="canManage" class="btn primary" :href="`#/torneo/${tournament.id}/fixture/new`">Nueva fecha</a></div></div>
      <form v-if="drawOpen" class="fixture-edit stack" @submit.prevent="draw"><div class="between"><h3>Sortear fixture</h3><button type="button" class="btn" @click="drawOpen=false">Cerrar</button></div><div v-if="drawable.length>1" class="choices"><button v-for="category in drawable" :key="category.category_id" type="button" class="choice" :aria-pressed="drawCategoryId===category.category_id" @click="drawCategoryId=category.category_id">{{ category.category_name }}</button></div><div v-if="drawMode!=='knockout'" class="choices"><button type="button" class="choice" :aria-pressed="drawLegs===1" @click="drawLegs=1">Una rueda</button><button type="button" class="choice" :aria-pressed="drawLegs===2" @click="drawLegs=2">Dos ruedas</button></div><button class="btn primary full" :disabled="drawBusy">{{ drawMode==='knockout'?'Crear cuadro y primera fecha':'Crear fechas y partidos' }}</button><p v-if="drawError" role="alert" class="notice amber">{{ drawError }}</p></form>
      <h3 v-if="activeDays.length" class="section-gap">Fechas</h3>
      <div v-for="day in activeDays" :key="day.id" class="fixture-day"><div class="fixture-day-head"><a :href="`#/torneo/${tournament.id}/partidos/${day.id}`"><strong>{{ dayTitle(day) }}</strong><small>{{ day.status === 'published' ? 'Publicada' : 'Borrador' }} · {{ matches(day).length }} partidos</small></a><div class="fixture-day-actions"><a v-if="day.status === 'published' && canManage" :href="`#/flyers/${tournament.id}/matchday/${day.id}`"><Icon name="file" />Flyer</a><a v-if="canManage" :href="`#/torneo/${tournament.id}/fixture/${day.id}`"><Icon name="edit" />Editar</a></div></div><a v-for="match in matches(day)" :key="match.id" class="fixture-day-match" :href="`#/torneo/${tournament.id}/partidos/${day.id}`"><time>{{ match.match_time||'—' }}</time><span>{{ match.home_name }} <b>–</b> {{ match.away_name }}</span></a></div>
      <div v-if="archivedDays.length&&canManage" class="fixture-removed"><span>Fechas retiradas</span><button v-for="day in archivedDays" :key="day.id" type="button" class="text-action" :disabled="!!restoringDay" @click="restoreDay(day.id)">Recuperar Fecha {{ day.ordinal }}</button></div><p v-if="drawError&&!drawOpen" class="notice amber" role="alert">{{ drawError }}</p>
    </div>
    <div v-else-if="section === 'partidos'">
      <div class="between"><h2>{{ dayId && visibleDays[0] ? dayTitle(visibleDays[0]) : 'Partidos' }}</h2><a v-if="dayId" class="btn" :href="`#/torneo/${tournament.id}/partidos`">Todas las fechas</a></div>
      <SportTabs v-if="!dayId&&categories.some(category=>bracketRounds(category).length)" v-model="matchesTab" :tabs="[{key:'dates',label:'Fechas',icon:'ball'},{key:'bracket',label:'Cuadro',icon:'trophy'}]" id="partidos" />
      <div v-if="matchesTab==='bracket'&&!dayId" id="partidos-bracket-panel" role="tabpanel" aria-labelledby="partidos-bracket-tab"><div v-if="categories.length>1" class="sport-category-pills" role="group" aria-label="Categoría"><button v-for="category in categories" :key="category.category_id" type="button" :aria-pressed="statsCategory?.category_id===category.category_id" @click="statsCategoryId=category.category_id">{{ category.category_name }}</button></div><BracketView v-if="statsCategory&&bracketRounds(statsCategory).length" :rounds="bracketRounds(statsCategory)" :planned="!brackets[statsCategory.category_id]?.bracket.length" :teams="entries.map(entry=>({id:entry.id,name:entry.name,color:entry.color,has_shield:entry.has_shield}))" :organization-id="organizationId" @open-match="openBracketMatch" /><div v-else class="empty-list">Aún no hay cruces.</div></div>
      <div v-if="matchesTab==='dates'||dayId" id="partidos-dates-panel" role="tabpanel" aria-labelledby="partidos-dates-tab">
      <div v-if="!visibleDays.some(day => matches(day).length)" class="empty-list">Aún no hay partidos en esta fecha.</div>
      <section v-for="day in visibleDays.filter(item => matches(item).length)" :key="day.id" class="workspace-day"><div v-if="!dayId" class="matchday-heading"><h3>{{ dayTitle(day) }}</h3><a :href="`#/torneo/${tournament.id}/fixture/${day.id}`">Fixture <Icon name="arrow" /></a></div><div v-for="match in matches(day)" :key="match.id" class="match-strip"><a :href="`#/partido/${match.category_id}/${match.id}`" class="match-strip-main"><span class="match-strip-team"><img v-if="entryShield(match.home_entry_id)" class="match-strip-mark shield" :src="entryShield(match.home_entry_id)!" :alt="`Escudo de ${match.home_name}`"><span v-else class="match-strip-mark" :style="{background:entryColor(match.home_entry_id)}">{{ initials(match.home_name) }}</span><strong>{{ match.home_name }}</strong></span><span class="match-strip-time"><b :class="{result:!!scores[match.id]}">{{ scores[match.id]?`${scores[match.id].home} : ${scores[match.id].away}`:match.match_time||'—' }}</b><small>{{ scores[match.id]?'Final':match.match_date||'Sin fecha' }}</small></span><span class="match-strip-team away"><img v-if="entryShield(match.away_entry_id)" class="match-strip-mark shield" :src="entryShield(match.away_entry_id)!" :alt="`Escudo de ${match.away_name}`"><span v-else class="match-strip-mark" :style="{background:entryColor(match.away_entry_id)}">{{ initials(match.away_name) }}</span><strong>{{ match.away_name }}</strong></span></a><a v-if="canManage && day.status === 'published'" class="match-strip-flyer" :href="`#/flyers/${tournament.id}/${matchFlyerKind(match.id)}/${match.id}`"><Icon name="file" />Flyer</a></div></section>
      </div>
    </div>
    <div v-else-if="section === 'estadisticas'">
      <div v-if="categories.length>1" class="sport-category-pills" role="group" aria-label="Categoría"><button v-for="category in categories" :key="category.category_id" type="button" :aria-pressed="statsCategory?.category_id===category.category_id" @click="statsCategoryId=category.category_id">{{ category.category_name }}</button></div>
      <SportTabs v-if="statsCategory" v-model="statsTab" :tabs="statsTabs" id="estadisticas" />
      <section v-for="category in categories.filter(item=>item.category_id===statsCategory?.category_id)" :key="category.category_id" :id="`estadisticas-${statsTab}-panel`" role="tabpanel" :aria-labelledby="`estadisticas-${statsTab}-tab`" class="workspace-stats">
        <div v-if="stats[category.category_id]">
          <template v-if="statsTab==='classification' && category.rules.initialPhase?.mode!=='knockout'"><div v-if="canFlyer(category) && standings(stats[category.category_id]).length" class="stats-flyer-actions"><a class="btn" :href="`#/flyers/${tournament.id}/standings/${category.category_id}`"><Icon name="file" />Flyer</a></div><div v-if="!standings(stats[category.category_id]).length" class="empty-list">Aún sin clasificación.</div><section v-for="group in standingsGroups(stats[category.category_id])" :key="group.groupNo ?? 'general'" class="workspace-standing-group"><h4 v-if="group.groupNo!==null">Grupo {{ group.groupNo }}</h4><div class="workspace-stat-head"><span>Equipo</span><span>PJ</span><span>DG</span><span>PTS</span></div><div v-for="row in group.rows" :key="row.key" class="workspace-standing-row"><strong><span class="standing-position">{{ row.unresolved?'–':row.position }}</span><span class="standing-team-dot" :style="{background:row.color}"></span><span>{{ row.name }}</span></strong><span>{{ row.played }}</span><span>{{ row.goalsFor-row.goalsAgainst }}</span><b>{{ row.points }}</b></div></section></template>
          <template v-if="statsTab==='scorers'">
          <div v-if="canFlyer(category) && stats[category.category_id].players.some(item => item.goals > 0 && item.publicName)" class="stats-flyer-actions"><a class="btn" :href="`#/flyers/${tournament.id}/scorers/${category.category_id}`"><Icon name="file" />Flyer</a></div>
          <div v-if="!stats[category.category_id].players.some(item => item.goals > 0)" class="empty-list">Aún sin goles.</div>
          <div v-for="(player,index) in [...stats[category.category_id].players].filter(item => item.goals > 0).sort((a,b) => b.goals - a.goals)" :key="player.registrationId" class="workspace-stat-row scorer-row"><span class="scorer-rank">{{ index+1 }}</span><Icon name="ball" /><strong>{{ player.name }}</strong><span class="scorer-goals">{{ player.goals }} <small>{{ player.goals===1?'gol':'goles' }}</small></span></div>
          </template><template v-if="statsTab==='defense'">
          <div v-if="canFlyer(category) && defenses(stats[category.category_id]).length" class="stats-flyer-actions"><a class="btn" :href="`#/flyers/${tournament.id}/defense/${category.category_id}`"><Icon name="file" />Flyer</a></div>
          <div v-if="!defenses(stats[category.category_id]).length" class="empty-list">Aún sin partidos oficiales.</div>
          <div v-for="team in defenses(stats[category.category_id])" :key="team.id" class="workspace-stat-row"><strong>{{ team.name }}</strong><span>{{ team.goalsAgainst }} GC · {{ team.played }} PJ</span></div>
          </template><template v-if="statsTab==='bracket'">
          <div v-if="bracketRounds(category).length" class="stats-flyer-actions"><div v-if="canFlyer(category) && brackets[category.category_id]?.bracket.length && brackets[category.category_id]?.phase" class="workspace-actions"><a v-if="bracketRounds(category).length>1" class="btn" :href="`#/flyers/${tournament.id}/semifinal/${brackets[category.category_id].phase!.id}`">Flyer semis</a><a class="btn" :href="`#/flyers/${tournament.id}/final/${brackets[category.category_id].phase!.id}`">Flyer final</a></div></div>
          <BracketView v-if="bracketRounds(category).length" :rounds="bracketRounds(category)" :planned="!brackets[category.category_id]?.bracket.length" :teams="entries.map(entry=>({id:entry.id,name:entry.name,color:entry.color,has_shield:entry.has_shield}))" :organization-id="organizationId" @open-match="openBracketMatch" />
          </template>
        </div>
      </section>
    </div>
    <div v-else-if="section === 'ajustes'">
      <div class="between"><h2>Configuración</h2><a v-if="canManage" class="btn" :href="`#/nueva-categoria/${tournament.id}`">Categoría</a></div>
      <a v-if="canManage" :href="`#/torneo/${tournament.id}/pagos/tarifas`" class="workspace-line"><Icon name="card" /><span>Importes por tarjeta</span><Icon name="arrow" /></a>
      <div class="directory-list"><a v-for="category in categories" :key="category.category_id" :href="`#/categoria/${category.category_id}`"><Icon name="file" /><span><strong>{{ category.category_name }}</strong><small>Reglamento</small></span><Icon name="arrow" /></a></div>
      <a v-if="tournament.status === 'published'" class="workspace-line" :href="`#/publico/${organizationId}`"><Icon name="arrow" /><span>Vista pública</span></a>
    </div>
  </section>
</template>
