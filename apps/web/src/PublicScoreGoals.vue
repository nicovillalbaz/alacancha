<script setup lang="ts">
import { computed } from 'vue';
import SportEventMark from './SportEventMark.vue';

type Event={id:string;kind:string;side:string;name:string;period:string|null};
const props=defineProps<{events:Event[];homeName:string;awayName:string}>();
const goals=computed(()=>props.events.filter(event=>
  (event.side==='home'||event.side==='away')&&['goal','penalty','own_goal'].includes(event.kind),
));
function sideGoals(side:'home'|'away'){
  return goals.value.filter(event=>event.kind==='own_goal'?event.side!==side:event.side===side);
}
</script>

<template>
  <div v-if="goals.length" class="score-goals" aria-label="Goles del partido">
    <ul v-for="side in (['home','away'] as const)" :key="side" :class="side" :aria-label="side==='home'?homeName:awayName">
      <li v-for="goal in sideGoals(side)" :key="goal.id">
        <SportEventMark :kind="goal.kind" />
        <span>{{ goal.name }}<small v-if="goal.period"> {{ goal.period }}</small></span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.score-goals{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;margin-top:18px;padding-top:10px;border-top:1px solid #ffffff35;text-align:left}
.score-goals ul{display:grid;align-content:start;gap:6px;min-width:0;margin:0;padding:0;list-style:none}
.score-goals li{display:flex;align-items:start;gap:5px;font-size:.75rem;line-height:1.35}
.score-goals li span{overflow-wrap:anywhere}
.score-goals .away{text-align:right}
.score-goals .away li{justify-content:flex-end}
.score-goals small{color:#a3d7bd;font-size:.65rem}
</style>
