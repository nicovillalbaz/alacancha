<script setup lang="ts">
import TeamCrest from './TeamCrest.vue';
import Icon from './Icon.vue';
import PublicTeamLink from './PublicTeamLink.vue';
import { matchRowClicked } from './public-navigation.ts';
import { announcedDate, type AnnouncedRound } from './announced-fixture.ts';

type Team={entry_id:string;team_id:string;name:string;color:string;has_shield:boolean};
const props=withDefaults(defineProps<{rounds:AnnouncedRound[];teams:Team[];organizationId?:string;interactive?:boolean;busy?:boolean;teamLinks?:boolean;statusByPair?:Record<string,{score:string|null;label:string}>}>(),{interactive:true,busy:false,statusByPair:()=>({})});
const emit=defineEmits<{ 'open-match':[ordinal:number,match:{homeEntryId:string;awayEntryId:string}]; 'open-team':[entryId:string] }>();
const matchLabel=(round:AnnouncedRound,match:AnnouncedRound['matches'][number]) =>
  `Abrir partido: ${teamByEntry(match.homeEntryId)?.name} contra ${teamByEntry(match.awayEntryId)?.name}, jornada ${round.ordinal}, ${round.date?announcedDate(round.date):'pendiente de fecha'}`;
const teamByEntry=(id:string)=>props.teams.find(team=>team.entry_id===id);
const status=(match:{homeEntryId:string;awayEntryId:string})=>props.statusByPair[`${match.homeEntryId}:${match.awayEntryId}`];
</script>

<template>
  <section v-for="round in rounds" :key="round.ordinal" class="announced-round">
    <h2>Jornada {{ round.ordinal }}<template v-if="round.date"> · <time :datetime="round.date">{{ announcedDate(round.date) }}</time></template></h2>
    <component v-for="match in round.matches" :is="interactive&&!teamLinks?'button':'div'" :key="`${match.homeEntryId}:${match.awayEntryId}`" :type="interactive&&!teamLinks?'button':undefined" :disabled="interactive&&!teamLinks&&busy||undefined" class="announced-match" :class="{'read-only':!interactive}" :aria-label="interactive&&!teamLinks?matchLabel(round,match):undefined" @click="interactive&&!busy&&(!teamLinks||matchRowClicked($event))&&emit('open-match',round.ordinal,match)">
      <PublicTeamLink class="announced-side" :name="teamByEntry(match.homeEntryId)?.name||'Equipo'" :entry-id="teamLinks?match.homeEntryId:undefined" @open="emit('open-team',$event)"><TeamCrest size="sm" :name="teamByEntry(match.homeEntryId)?.name||'Equipo'" :team-id="teamByEntry(match.homeEntryId)?.team_id" :organization-id="organizationId" :color="teamByEntry(match.homeEntryId)?.color" :has-shield="teamByEntry(match.homeEntryId)?.has_shield" /><strong>{{ teamByEntry(match.homeEntryId)?.name }}</strong></PublicTeamLink>
      <component :is="teamLinks?'button':'span'" :type="teamLinks?'button':undefined" :disabled="teamLinks&&busy||undefined" class="announced-center" :class="{'public-match-action':teamLinks}" :aria-label="teamLinks?matchLabel(round,match):undefined" @click="teamLinks&&interactive&&!busy&&emit('open-match',round.ordinal,match)"><b>{{ status(match)?.score||'vs' }}</b><small>{{ status(match)?.label||(round.date?'Hora por confirmar':'Pendiente de fecha') }}</small></component>
      <PublicTeamLink class="announced-side away" :name="teamByEntry(match.awayEntryId)?.name||'Equipo'" :entry-id="teamLinks?match.awayEntryId:undefined" @open="emit('open-team',$event)"><TeamCrest size="sm" :name="teamByEntry(match.awayEntryId)?.name||'Equipo'" :team-id="teamByEntry(match.awayEntryId)?.team_id" :organization-id="organizationId" :color="teamByEntry(match.awayEntryId)?.color" :has-shield="teamByEntry(match.awayEntryId)?.has_shield" /><strong>{{ teamByEntry(match.awayEntryId)?.name }}</strong></PublicTeamLink>
      <Icon v-if="interactive" name="arrow" class="announced-arrow" />
    </component>
  </section>
</template>

<style scoped>
.announced-round+.announced-round{margin-top:20px;border-top:6px solid #f5f7f8}.announced-round h2{margin:0;padding:15px 2px 8px;color:#294b3e;font-size:.84rem}.announced-match{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 92px minmax(0,1fr);align-items:center;gap:6px;width:100%;min-height:76px;padding:6px 18px 6px 0;border:0;border-bottom:1px solid #e1e8e5;background:#fff;color:#14242c;text-align:left;font:inherit;cursor:pointer}.announced-match:hover{background:#f7fbf9}.announced-match:focus-visible{outline:3px solid #0cac70;outline-offset:-3px}.announced-arrow{position:absolute;right:0;width:14px;height:14px;color:#82968e}.announced-side{display:flex;align-items:center;gap:8px;min-width:0}.announced-side strong{overflow:hidden;text-overflow:ellipsis;font-size:.77rem;line-height:1.22}.announced-side.away{flex-direction:row-reverse;text-align:right}.announced-center{text-align:center}.announced-center b,.announced-center small{display:block}.announced-center b{color:#1e3c31;font-size:.85rem}.announced-center small{margin-top:3px;color:#5b7268;font-size:.64rem;line-height:1.2}
.announced-match.read-only{cursor:default}.announced-match.read-only:hover{background:#fff}
@media(max-width:360px){.announced-match{grid-template-columns:minmax(0,1fr) 73px minmax(0,1fr);gap:4px}.announced-center small{font-size:.59rem}}
.public-match-action{border:0;background:transparent;padding:0;min-height:44px;cursor:pointer}
</style>
