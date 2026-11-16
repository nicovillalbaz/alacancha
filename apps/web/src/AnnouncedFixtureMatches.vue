<script setup lang="ts">
import TeamCrest from './TeamCrest.vue';
import Icon from './Icon.vue';

type Team={entry_id:string;team_id:string;name:string;color:string;has_shield:boolean};
type Round={ordinal:number;matches:Array<{homeEntryId:string;awayEntryId:string}>};
const props=defineProps<{rounds:Round[];teams:Team[];organizationId?:string}>();
const emit=defineEmits<{ 'open-match':[ordinal:number,match:{homeEntryId:string;awayEntryId:string}] }>();
const teamByEntry=(id:string)=>props.teams.find(team=>team.entry_id===id);
</script>

<template>
  <section v-for="round in rounds" :key="round.ordinal" class="announced-round">
    <h2>Jornada {{ round.ordinal }}</h2>
    <button v-for="(match,index) in round.matches" :key="index" type="button" class="announced-match" :aria-label="`Abrir partido: ${teamByEntry(match.homeEntryId)?.name} contra ${teamByEntry(match.awayEntryId)?.name}, jornada ${round.ordinal}, pendiente de fecha`" @click="emit('open-match',round.ordinal,match)">
      <span class="announced-side"><TeamCrest size="sm" :name="teamByEntry(match.homeEntryId)?.name||'Equipo'" :team-id="teamByEntry(match.homeEntryId)?.team_id" :organization-id="organizationId" :color="teamByEntry(match.homeEntryId)?.color" :has-shield="teamByEntry(match.homeEntryId)?.has_shield" /><strong>{{ teamByEntry(match.homeEntryId)?.name }}</strong></span>
      <span class="announced-center"><b>vs</b><small>Pendiente de fecha</small></span>
      <span class="announced-side away"><TeamCrest size="sm" :name="teamByEntry(match.awayEntryId)?.name||'Equipo'" :team-id="teamByEntry(match.awayEntryId)?.team_id" :organization-id="organizationId" :color="teamByEntry(match.awayEntryId)?.color" :has-shield="teamByEntry(match.awayEntryId)?.has_shield" /><strong>{{ teamByEntry(match.awayEntryId)?.name }}</strong></span>
      <Icon name="arrow" class="announced-arrow" />
    </button>
  </section>
</template>

<style scoped>
.announced-round+.announced-round{margin-top:20px;border-top:6px solid #f5f7f8}.announced-round h2{margin:0;padding:15px 2px 8px;color:#294b3e;font-size:.84rem}.announced-match{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 92px minmax(0,1fr);align-items:center;gap:6px;width:100%;min-height:76px;padding:6px 18px 6px 0;border:0;border-bottom:1px solid #e1e8e5;background:#fff;color:#14242c;text-align:left;font:inherit;cursor:pointer}.announced-match:hover{background:#f7fbf9}.announced-match:focus-visible{outline:3px solid #0cac70;outline-offset:-3px}.announced-arrow{position:absolute;right:0;width:14px;height:14px;color:#82968e}.announced-side{display:flex;align-items:center;gap:8px;min-width:0}.announced-side strong{overflow:hidden;text-overflow:ellipsis;font-size:.77rem;line-height:1.22}.announced-side.away{flex-direction:row-reverse;text-align:right}.announced-center{text-align:center}.announced-center b,.announced-center small{display:block}.announced-center b{color:#1e3c31;font-size:.85rem}.announced-center small{margin-top:3px;color:#5b7268;font-size:.64rem;line-height:1.2}
@media(max-width:360px){.announced-match{grid-template-columns:minmax(0,1fr) 73px minmax(0,1fr);gap:4px}.announced-center small{font-size:.59rem}}
</style>
