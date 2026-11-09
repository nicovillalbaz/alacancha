<script setup lang="ts">
import {nextTick,onMounted,ref,watch} from 'vue';
import Icon from './Icon.vue';

const props = defineProps<{ tabs: Array<{ key: string; label: string; icon?: string }>; modelValue: string; id: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const strip=ref<HTMLElement|null>(null);
function reveal(key:string,behavior:ScrollBehavior='smooth'){
  const list=strip.value,target=list?.querySelector<HTMLElement>(`[id="${props.id}-${key}-tab"]`);
  if(!list||!target)return;
  const listBox=list.getBoundingClientRect(),tabBox=target.getBoundingClientRect();
  const left=list.scrollLeft+tabBox.left-listBox.left-(list.clientWidth-tabBox.width)/2;
  list.scrollTo({left,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':behavior});
}
watch(()=>props.modelValue,key=>{void nextTick(()=>reveal(key));});
onMounted(()=>reveal(props.modelValue,'instant'));
function choose(key: string) { emit('update:modelValue', key); }
function onKeydown(event: KeyboardEvent, index: number) {
  const move = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? props.tabs.length - 1 : move ? (index + move + props.tabs.length) % props.tabs.length : -1;
  if (next < 0) return;
  event.preventDefault();
  choose(props.tabs[next].key);
  (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
</script>

<template>
  <nav ref="strip" class="sport-tabs" role="tablist" :aria-label="id">
    <button v-for="(tab, index) in tabs" :id="`${id}-${tab.key}-tab`" :key="tab.key" type="button" role="tab" :aria-controls="`${id}-${tab.key}-panel`" :aria-selected="modelValue===tab.key" :tabindex="modelValue===tab.key?0:-1" @click="choose(tab.key)" @keydown="onKeydown($event,index)"><Icon v-if="tab.icon" :name="tab.icon" /><span>{{ tab.label }}</span></button>
  </nav>
</template>
