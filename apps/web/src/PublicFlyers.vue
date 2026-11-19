<script lang="ts">
import {createPublicReads} from './public-reads.ts';

const readFlyers = createPublicReads();
type Flyer = {id:string;kind:string;sourceId:string;title:string;format:string};
</script>

<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import Icon from './Icon.vue';

const props = defineProps<{organizationId:string;tournamentId:string;revision:number;sources:Record<string,string[]>}>();
const open = ref(false);
const flyers = ref<Flyer[]>([]);
const loading = ref(false);
const failed = ref(false);
const retry = ref(0);
const visible = computed(() => flyers.value.filter(item => props.sources[item.kind]?.includes(item.sourceId)));

watch(() => [open.value,props.organizationId,props.tournamentId,props.revision,retry.value] as const,
  async ([expanded,org,tournament,revision,attempt],_previous,onCleanup) => {
    failed.value=false;
    loading.value=expanded;
    if (!expanded) return;
    let active=true;
    onCleanup(()=>{active=false;});
    try {
      const next=await readFlyers<Flyer[]>(`/organizations/${org}/flyers?torneo=${tournament}`,`${revision}:${attempt}`);
      if(active)flyers.value=next;
    } catch {
      if(active)failed.value=true;
    } finally {
      if(active)loading.value=false;
    }
  });

function onToggle(event: Event) {
  open.value=(event.currentTarget as HTMLDetailsElement).open;
}
</script>

<template>
  <details class="public-flyers" @toggle="onToggle">
    <summary><Icon name="download" /> Flyers</summary>
    <div v-if="open" class="public-flyers-items">
      <p v-if="failed" role="alert">No se pudieron cargar los flyers. <button class="text-action" type="button" @click="retry++">Reintentar</button></p>
      <p v-else-if="loading&&!visible.length" role="status">Cargando flyers…</p>
      <p v-else-if="!visible.length">Aún no hay flyers publicados.</p>
      <a v-for="item in visible" :key="item.id" :href="`/api/v1/public/organizations/${organizationId}/flyers/${item.id}/file`" target="_blank" rel="noopener">
        {{ item.title }} <small>{{ item.format.toUpperCase() }}</small>
      </a>
    </div>
  </details>
</template>

<style scoped>
.public-flyers{max-width:880px;margin:0 auto;padding:0 16px;color:#076f4b}
.public-flyers>summary{width:max-content;min-height:40px;display:flex;align-items:center;gap:5px;cursor:pointer;font-size:.8rem;font-weight:800}
.public-flyers>summary .icon{width:16px;height:16px}
.public-flyers-items{display:grid;gap:6px;padding:0 0 8px;font-size:.85rem}
.public-flyers-items a{width:fit-content;display:block;padding:7px 0;color:inherit}
.public-flyers-items small{margin-left:4px;color:#50675c}
</style>