<script setup lang="ts">
import Icon from './Icon.vue';
import { computed } from 'vue';
const props = defineProps<{ kind: string; color?: string }>();
const isCard = computed(()=>['yellow','second_yellow','red','custom_card'].includes(props.kind));
const label = computed(()=>props.kind==='own_goal'?'Autogol':props.kind==='yellow'?'Tarjeta amarilla':props.kind==='second_yellow'?'Segunda amarilla':props.kind==='red'?'Tarjeta roja':props.kind==='custom_card'?'Tarjeta':props.kind==='substitution'?'Cambio':props.kind==='incident'?'Incidencia':props.kind==='shootout_miss'?'Penal fallado':'Gol');
</script>
<template><span class="sport-event-mark" :class="kind" role="img" :aria-label="label"><span v-if="isCard" class="sport-event-card" :style="{background: color || (kind==='red'?'#d43131':kind==='custom_card'?'#2988c9':'#f7c743')}"></span><Icon v-else :name="kind==='substitution'?'arrows':kind==='incident'?'alert':'ball'" /><span v-if="kind==='own_goal'" class="sport-event-corner">↶</span><span v-if="kind==='shootout_miss'" class="sport-event-corner">×</span></span></template>
