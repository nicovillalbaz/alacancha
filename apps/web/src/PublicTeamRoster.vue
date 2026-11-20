<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PublicRosterPlayer } from '@torneos/shared';
import SportEventMark from './SportEventMark.vue';
import { createPublicReads } from './public-reads.ts';

const props=defineProps<{path:string;revision:string|number}>();
const read=createPublicReads();
const players=ref<PublicRosterPlayer[]>([]),loading=ref(false),failed=ref(false),retry=ref(0);
watch([()=>props.path,()=>props.revision,retry],async ([path,revision,attempt],previous,onCleanup)=>{
  let active=true;
  onCleanup(()=>{active=false;});
  if(path!==previous?.[0])players.value=[];
  failed.value=false;
  loading.value=true;
  try{
    const roster=await read<PublicRosterPlayer[]>(path,`${revision}:${attempt}`);
    if(active)players.value=roster;
  }catch{if(active)failed.value=true;}
  finally{if(active)loading.value=false;}
},{immediate:true});
</script>

<template>
  <section class="public-roster" aria-label="Jugadores">
    <h2>Jugadores</h2>
    <p v-if="failed" class="roster-status" role="alert">No se pudo cargar el plantel. <button class="text-action" type="button" @click="retry++">Reintentar</button></p>
    <p v-else-if="loading && !players.length" class="roster-status" role="status">Cargando jugadores…</p>
    <p v-else-if="!players.length" class="roster-status">Aún no hay jugadores publicados.</p>
    <ul v-if="players.length">
      <li v-for="(player,index) in players" :key="index">
        <span v-if="player.shirtNumber!=null" class="shirt" :aria-label="`Dorsal ${player.shirtNumber}`">{{ player.shirtNumber }}</span><span v-else aria-hidden="true"></span>
        <strong>{{ player.name }}</strong>
        <span class="roster-stats">
          <span :aria-label="`${player.goals} goles`" title="Goles"><SportEventMark kind="goal" />{{ player.goals }}</span>
          <span :aria-label="`${player.yellowCards} amarillas`" title="Amarillas"><SportEventMark kind="yellow" />{{ player.yellowCards }}</span>
          <span :aria-label="`${player.redCards} rojas`" title="Rojas"><SportEventMark kind="red" />{{ player.redCards }}</span>
          <span v-for="card in player.customCards" :key="`${card.label}:${card.color}`" :aria-label="`${card.count} tarjetas ${card.label}`" :title="card.label"><SportEventMark kind="custom_card" :color="card.color" />{{ card.count }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.public-roster{width:100%;max-width:880px;margin:auto;padding:14px 16px;color:#10252b}
.public-roster h2{font-size:.86rem;margin:0 0 8px}
.public-roster ul{list-style:none;margin:0;padding:0}
.public-roster li{display:grid;grid-template-columns:26px minmax(0,1fr) auto;align-items:center;gap:7px;min-height:47px;border-top:1px solid #e5ede8;font-size:.76rem}
.public-roster strong{overflow-wrap:anywhere}
.shirt{display:grid;place-items:center;min-height:24px;border-radius:5px;background:#e6efe9;color:#075d3f;font-weight:800}
.roster-stats{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;max-width:50vw;padding:6px 0;color:#3e6152;font-variant-numeric:tabular-nums}
.roster-stats>span{display:inline-flex;align-items:center;gap:3px}
.roster-status{color:#576f64;font-size:.78rem}
</style>
