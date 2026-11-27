<script setup lang="ts">
import SportTabs from './SportTabs.vue';

const tab = defineModel<string>({ required: true });
const tabs = [
  { key: 'players', label: 'Jugadores', icon: 'users' },
  { key: 'matches', label: 'Partidos', icon: 'ball' },
  { key: 'statistics', label: 'Estadísticas', icon: 'chart' },
];
</script>

<template>
  <div class="team-tabs">
    <SportTabs v-model="tab" :tabs="tabs" id="public-team" />
    <div :id="`public-team-${tab}-panel`" role="tabpanel" :aria-labelledby="`public-team-${tab}-tab`">
      <slot v-if="tab==='players'" name="players" />
      <slot v-else-if="tab==='matches'" name="matches" />
      <slot v-else name="statistics" />
    </div>
  </div>
</template>

<style scoped>
.team-tabs{max-width:880px;margin:auto;padding:0 16px}
.team-tabs :deep(.public-roster){padding-inline:0}
.team-tabs :deep(.public-roster h2){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style>
