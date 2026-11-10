<script setup lang="ts">
import {ref,watch} from 'vue';
import type {TeamSummary} from '@torneos/shared';

const props=defineProps<{teamIds:string[];position:number;entries:TeamSummary[];disabled:boolean}>();
const emit=defineEmits<{save:[entryOrder:string[]]}>();
const order=ref<string[]>([]);
watch(()=>props.teamIds.join(','),()=>{order.value=[];});
function name(id:string){return props.entries.find(entry=>entry.entry_id===id)?.name||'Equipo';}
function choose(id:string){if(props.disabled)return;order.value=order.value.includes(id)?order.value.filter(item=>item!==id):[...order.value,id];}
</script>

<template>
  <div class="tie-resolver">
    <div class="tie-heading"><strong>Desempate · puesto {{ position }}</strong><span>{{ order.length }}/{{ teamIds.length }}</span></div>
    <div class="tie-options" role="group" :aria-label="`Orden de equipos empatados desde el puesto ${position}`">
      <button v-for="id in teamIds" :key="id" type="button" :aria-pressed="order.includes(id)" :disabled="disabled" @click="choose(id)"><b>{{ order.includes(id)?order.indexOf(id)+1:'+' }}</b><span>{{ name(id) }}</span></button>
    </div>
    <button type="button" class="tie-save" :disabled="disabled||order.length!==teamIds.length" @click="emit('save',[...order])">Guardar orden</button>
  </div>
</template>

<style scoped>
.tie-resolver{padding:12px 0;border-top:1px solid #dbe7df}.tie-heading{display:flex;justify-content:space-between;gap:8px;color:#123b2f;font-size:.75rem}.tie-heading span{color:#60766c}.tie-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:6px;margin-top:9px}.tie-options button{display:flex;align-items:center;gap:8px;min-width:0;min-height:44px;padding:5px 8px;border:1px solid #d4e3d9;border-radius:7px;background:#fff;color:#163d31;text-align:left;font:inherit;font-size:.73rem}.tie-options button[aria-pressed=true]{border-color:#08714c;background:#e8f4ed}.tie-options b{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:50%;background:#dbece2;color:#075f40}.tie-options span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tie-save{min-height:44px;margin-top:9px;padding:8px 16px;border:0;border-radius:7px;background:#0b704e;color:#fff;font:inherit;font-size:.75rem;font-weight:750}.tie-save:disabled{opacity:.45}button:focus-visible{outline:3px solid #165dad;outline-offset:2px}
</style>
