<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {PositionBlueprintView,PositionCompetitionView,TeamSummary} from '@torneos/shared';
import SportTabs from './SportTabs.vue';

const props=defineProps<{view:PositionBlueprintView;competition:PositionCompetitionView|null;entries:TeamSummary[];organizationId:string;categoryId:string;tournamentId:string}>();
type Game=PositionBlueprintView['games'][number];
const tab=ref('days'),day=ref(0),round=ref('F1'),selectedCode=ref('');
const slots=computed(()=>new Map(props.view.slots.map(slot=>[slot.slot_code,slot])));
const entries=computed(()=>new Map(props.entries.filter(entry=>entry.category_id===props.categoryId).map(entry=>[entry.entry_id,entry])));
const matches=computed(()=>new Map((props.competition?.matches||[]).map(match=>[match.code,match.match_id])));
const results=computed(()=>new Map((props.competition?.results||[]).map(result=>[result.code,result])));
const days=computed(()=>[...new Set(props.view.games.map(game=>game.jornada_no??0))].sort((a,b)=>a-b));
const rounds=computed(()=>[...new Set(props.view.games.map(game=>game.sporting_round))]);
const visible=computed(()=>props.view.games.filter(game=>tab.value==='days'?(game.jornada_no??0)===day.value:game.sporting_round===round.value));
const selected=computed(()=>props.view.games.find(game=>game.code===selectedCode.value)||null);
watch(days,values=>{if(!values.includes(day.value))day.value=values[0]??0;},{immediate:true});
function team(game:Game,side:'home'|'away'){const id=props.competition?.competition.participants[game.code]?.[side==='home'?'homeEntryId':'awayEntryId'];return id?entries.value.get(id):entries.value.get(slots.value.get(side==='home'?game.home_ref:game.away_ref)?.entry_id||'');}
function name(game:Game,side:'home'|'away'){return team(game,side)?.name||slots.value.get(side==='home'?game.home_ref:game.away_ref)?.team_name||(/^S[1-4]$/.test(side==='home'?game.home_ref:game.away_ref)?'Por definir':side==='home'?game.home_ref:game.away_ref);}
function shield(game:Game,side:'home'|'away'){const item=team(game,side);return item?.has_shield?`/api/v1/organizations/${props.organizationId}/teams/${item.id}/shield`:null;}
function date(value:string|null){if(!value)return 'Por definir';const [year,month,day]=value.slice(0,10).split('-');return `${day}/${month}/${year}`;}
function gameDate(game:Game){return game.planned_date?date(game.planned_date):game.sporting_round==='F1'?`${date(props.view.blueprint?.opening_first_date||null)} / ${date(props.view.blueprint?.opening_second_date||null)}`:'Por definir';}
function score(game:Game){const value=results.value.get(game.code);return value?`${value.homeGoals}:${value.awayGoals}`:'–';}
function title(value:string){return /^F\d+$/.test(value)?`Fecha ${value.slice(1)}`:value.replace('Cuadrangular ','Final ');}
function open(game:Game){const id=matches.value.get(game.code);if(id){location.hash=`#/partido/${props.categoryId}/${id}`;return;}selectedCode.value=game.code;}
</script>

<template>
  <section class="planned-matches">
    <template v-if="selected">
      <button type="button" class="planned-back" @click="selectedCode=''">‹ Partidos</button>
      <div class="planned-hero"><small>{{ title(selected.sporting_round) }} · {{ selected.jornada_no?`J${selected.jornada_no}`:'J1/J2 por definir' }}</small><div class="planned-sides"><span><img v-if="shield(selected,'home')" :src="shield(selected,'home')!" alt=""><strong>{{ name(selected,'home') }}</strong></span><b>–</b><span><img v-if="shield(selected,'away')" :src="shield(selected,'away')!" alt=""><strong>{{ name(selected,'away') }}</strong></span></div><small>{{ gameDate(selected) }}</small></div>
      <div class="planned-foot"><strong>Cruce planificado</strong><a :href="`#/torneo/${tournamentId}/fixture`">Ver fixture ›</a></div>
    </template>
    <template v-else>
      <SportTabs v-model="tab" :tabs="[{key:'days',label:'Jornadas',icon:'calendar'},{key:'rounds',label:'Fechas',icon:'ball'}]" id="planned-matches" />
      <div class="planned-pills" role="group" :aria-label="tab==='days'?'Jornadas':'Fechas'"><button v-for="value in tab==='days'?days:rounds" :key="value" type="button" :aria-pressed="tab==='days'?day===value:round===value" @click="tab==='days'?day=Number(value):round=String(value)">{{ tab==='days'?(value===0?'J1/J2':`J${value}`):String(value).replace('Cuadrangular ','Final ') }}</button></div>
      <h2>{{ tab==='days'?(day===0?'J1/J2 por definir':`Jornada ${day}`):title(round) }}</h2>
      <button v-for="game in visible" :key="game.code" type="button" class="planned-row" @click="open(game)"><small>{{ title(game.sporting_round) }}<span>{{ gameDate(game) }}</span></small><span class="planned-side"><img v-if="shield(game,'home')" :src="shield(game,'home')!" alt=""><strong>{{ name(game,'home') }}</strong></span><b>{{ score(game) }}</b><span class="planned-side away"><img v-if="shield(game,'away')" :src="shield(game,'away')!" alt=""><strong>{{ name(game,'away') }}</strong></span></button>
    </template>
  </section>
</template>

<style scoped>
.planned-matches{max-width:880px;margin:0 auto;color:#10252b}.planned-pills{display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid #dce7e0}.planned-pills::-webkit-scrollbar{display:none}.planned-pills button{flex:none;min-height:40px;padding:8px 13px;border:0;border-bottom:2px solid transparent;background:#fff;color:#63786e;font:inherit;font-size:.75rem}.planned-pills button[aria-pressed=true]{border-color:#078454;color:#075e40;font-weight:800}.planned-matches h2{margin:17px 0 8px;font-size:.9rem}.planned-row{display:grid;grid-template-columns:58px minmax(0,1fr) 25px minmax(0,1fr);gap:7px;align-items:center;width:100%;min-height:66px;padding:7px 0;border:0;border-top:1px solid #e1eae4;background:#fff;text-align:left;color:inherit;font:inherit}.planned-row>small{font-size:.6rem;color:#357256}.planned-row>small span{display:block;color:#78887e}.planned-side{display:flex;align-items:center;gap:6px;min-width:0}.planned-side.away{flex-direction:row-reverse;text-align:right}.planned-side img{flex:none;width:27px;height:27px;object-fit:contain}.planned-side strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem}.planned-row>b{text-align:center}.planned-back{min-height:46px;padding:0;border:0;background:#fff;color:#086744;font:inherit;font-weight:700}.planned-hero{padding:25px 12px;background:#10252b;color:#fff;text-align:center}.planned-hero>small{color:#a9dabc;font-size:.7rem}.planned-sides{display:grid;grid-template-columns:minmax(0,1fr) 25px minmax(0,1fr);gap:8px;align-items:center;margin:19px 0}.planned-sides span{display:grid;justify-items:center;gap:7px;min-width:0}.planned-sides img{width:48px;height:48px;object-fit:contain}.planned-sides strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:.78rem}.planned-foot{display:flex;justify-content:space-between;align-items:center;padding:16px 2px;font-size:.78rem}.planned-foot a{color:#086744;font-weight:700}.planned-matches button:focus-visible{outline:3px solid #0cac70;outline-offset:2px}
/* Cruces planificados con la misma lectura visual que los resultados. */
.planned-row{min-height:72px;border-top-color:#e5ede8;transition:background-color .15s ease}
.planned-row:hover,.planned-row:focus-visible{background:#f4f9f6}
.planned-side img{width:32px;height:32px}
.planned-side strong{font-size:.76rem;font-weight:760}
.planned-row>b{display:grid;place-items:center;min-height:30px;border-radius:6px;background:#eff3f0;color:#173d34;font-size:.82rem;font-variant-numeric:tabular-nums}
.planned-row>small{color:#4b725e;font-size:.65rem;font-weight:700}
.planned-hero{position:relative;overflow:hidden;isolation:isolate;background:radial-gradient(circle at 50% 120%,#214c3c 0,#102d29 64%)}
.planned-hero::before{content:"";position:absolute;inset:auto -14% -82% -14%;height:145%;border:1px solid #ffffff19;border-radius:50%;z-index:-1;pointer-events:none}
.planned-sides img{width:56px;height:56px}.planned-sides strong{font-size:.83rem;font-weight:800}
@media(max-width:359px){.planned-side img{width:27px;height:27px}}
</style>
