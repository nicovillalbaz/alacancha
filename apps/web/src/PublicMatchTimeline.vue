<script setup lang="ts">
import { computed, ref } from 'vue';
import SportEventMark from './SportEventMark.vue';

type Event = { id:string; kind:string; side:string; period:string|null; minute?:number|null; name:string; cardLabel?:string|null; cardColor?:string|null; relatedName?:string|null };
const props = defineProps<{ events:Event[]; homeName:string; awayName:string }>();
const view = ref<'all'|'goals'|'cards'>('all');
const views = [{key:'all',label:'Completo'},{key:'goals',label:'Goles'},{key:'cards',label:'Tarjetas'}] as const;
const goalKinds = new Set(['goal','penalty','penalty_miss','own_goal','shootout_goal','shootout_miss']);
const cardKinds = new Set(['yellow','second_yellow','red','custom_card']);
const visibleEvents = computed(() => props.events.filter(event => view.value === 'all' || (view.value === 'goals' ? goalKinds : cardKinds).has(event.kind)));
const periods = [{code:'PT',label:'PT'},{code:'ST',label:'ST'},{code:'TE',label:'TE'},{code:'P4',label:'P4'},{code:'P5',label:'P5'},{code:'P6',label:'P6'},{code:'',label:'Detalle del partido'}];
const groups = computed(() => {
  const known = new Set(periods.map(period => period.code));
  const other = [...new Set(visibleEvents.value.map(event => event.period || '').filter(period => !known.has(period)))].map(code => ({code,label:code}));
  return [...periods,...other].map(period => ({...period,events:visibleEvents.value.filter(event => (event.period || '') === period.code)})).filter(group => group.events.length);
});
function label(event:Event){return event.cardLabel || ({goal:'Gol',penalty:'Gol de penal',penalty_miss:'Penal errado',own_goal:'Autogol',yellow:'Amarilla',second_yellow:'Segunda amarilla',red:'Roja',custom_card:'Tarjeta',substitution:'Cambio',incident:'Incidencia',shootout_goal:'Penal convertido',shootout_miss:'Penal fallado'} as Record<string,string>)[event.kind] || 'Evento';}
</script>

<template>
  <div class="match-timeline">
    <div class="timeline-tabs" role="group" aria-label="Filtrar eventos del partido"><button v-for="option in views" :key="option.key" type="button" :aria-pressed="view===option.key" @click="view=option.key">{{ option.label }}</button></div>
    <p v-if="!groups.length" class="timeline-empty">{{ view==='goals'?'Sin goles registrados.':view==='cards'?'Sin tarjetas registradas.':'Sin eventos registrados.' }}</p>
    <section v-for="group in groups" :key="group.code" class="timeline-period" :aria-label="group.label">
      <h3>{{ group.label }}</h3>
      <div v-for="event in group.events" :key="event.id" class="timeline-row" :class="`side-${event.side}`" :aria-label="`${event.side==='home'?homeName:event.side==='away'?awayName:'Equipo sin identificar'}: ${event.name}, ${label(event)}${event.minute == null ? '' : `, ${event.minute} minutos`}`">
        <div class="timeline-event"><SportEventMark :kind="event.kind" :color="event.cardColor || undefined" /><span><strong :title="event.name">{{ event.name }}</strong><small>{{ label(event) }}<template v-if="event.relatedName"> · {{ event.relatedName }}</template></small></span></div>
        <span class="timeline-minute">{{ event.minute == null ? '' : `${event.minute}′` }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.match-timeline{width:100%;min-width:0}.timeline-tabs{display:flex;gap:4px;border-bottom:1px solid #dce7e0;overflow-x:auto}.timeline-tabs button{flex:1;min-width:82px;min-height:44px;padding:8px 10px;border:0;border-bottom:2px solid transparent;background:#fff;color:#50685d;font:inherit;font-size:.74rem;font-weight:700}.timeline-tabs button[aria-pressed=true]{border-bottom-color:#087c51;color:#075e40;font-weight:850}.timeline-tabs button:focus-visible{outline:3px solid #0cac70;outline-offset:-3px}.timeline-empty{padding:12px 0;color:#62776e;font-size:.78rem}.timeline-period{border-top:1px solid #dce7e0}.timeline-period h3{margin:0;padding:11px 0 8px;color:#086744;font-size:.78rem;font-weight:850}.timeline-row{display:grid;grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);gap:7px;align-items:center;min-height:57px;border-top:1px solid #edf2ef}.timeline-event{display:flex;gap:8px;align-items:center;min-width:0}.timeline-event>span:last-child{min-width:0}.timeline-event strong,.timeline-event small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.timeline-event strong{font-size:.77rem}.timeline-event small{font-size:.68rem;color:#5a7165}.timeline-minute{grid-column:2;grid-row:1;text-align:center;font-size:.68rem;color:#5b7066}.side-home .timeline-event{grid-column:1;grid-row:1}.side-away .timeline-event{grid-column:3;grid-row:1;flex-direction:row-reverse;text-align:right}.side-unknown .timeline-event{grid-column:1/4;grid-row:1}.side-unknown .timeline-minute{display:none}
</style>
