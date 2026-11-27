<script setup lang="ts">
import Icon from './Icon.vue';
import { plainPublicClick, publicSectionHref } from './public-navigation.ts';

type Section = 'clasificacion' | 'goleadores';
defineProps<{
  position?: string;
  goals?: { goalsFor: number; goalsAgainst: number };
  scorers: Array<{ name: string; goals: number }>;
  standingsHref?: string;
  hasScorersTable: boolean;
  loading: boolean;
  error: string;
}>();
const emit = defineEmits<{ navigate: [section: Section]; retry: [] }>();

function open(event: MouseEvent, section: Section) {
  if (!plainPublicClick(event) || !(event.currentTarget instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  emit('navigate', section);
}
</script>

<template>
  <section class="team-stats" aria-label="Estadísticas del equipo">
    <p v-if="error" role="alert">{{ error }} <button class="text-action" type="button" @click="emit('retry')">Reintentar</button></p>
    <p v-else-if="loading" role="status">Cargando estadísticas…</p>
    <template v-else>
      <component :is="standingsHref ? 'a' : 'div'" :href="standingsHref" class="team-position" @click="open($event,'clasificacion')">
        <div><span>Posición actual</span><strong>{{ position || 'Por definir' }}</strong></div>
        <Icon v-if="standingsHref" name="arrow" />
      </component>
      <dl class="team-goals">
        <div><dt>Goles a favor</dt><dd>{{ goals?.goalsFor ?? '—' }}</dd></div>
        <div><dt>Goles en contra</dt><dd>{{ goals?.goalsAgainst ?? '—' }}</dd></div>
      </dl>
      <component :is="hasScorersTable ? 'a' : 'div'" :href="hasScorersTable ? publicSectionHref('goleadores') : undefined" class="team-top" @click="open($event,'goleadores')">
        <div class="team-top-head"><h2>Máximos goleadores</h2><Icon v-if="hasScorersTable" name="arrow" /></div>
        <ol v-if="scorers.length">
          <li v-for="(player,index) in scorers" :key="index"><span>{{ player.name }}</span><strong>{{ player.goals }} {{ player.goals === 1 ? 'gol' : 'goles' }}</strong></li>
        </ol>
        <p v-else>Aún no hay goleadores publicados.</p>
      </component>
    </template>
  </section>
</template>

<style scoped>
.team-stats{padding:10px 0 28px;color:#10252b;font-size:.82rem}
.team-stats a{color:inherit;text-decoration:none}
.team-stats a:hover{background:#f4f9f6}
.team-stats a:focus-visible{outline:2px solid #15a36c;outline-offset:-2px}
.team-stats p{color:#587066;margin:10px 0;font-size:.78rem}
.team-position,.team-top-head,.team-top li{display:flex;align-items:center;justify-content:space-between;gap:12px}
.team-position{min-height:54px;padding:8px 2px;border-bottom:1px solid #e5ede8}
.team-position span,.team-position strong{display:block}
.team-position span,.team-goals dt{color:#587066;font-size:.73rem}
.team-position strong,.team-goals dd,.team-top li strong{color:#086744;font-weight:800}
.team-goals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:13px 2px 14px;border-bottom:1px solid #e5ede8}
.team-goals dd{margin:3px 0 0;font-size:1.2rem;font-variant-numeric:tabular-nums}
.team-top{display:block;padding:10px 2px 5px}
.team-top-head{min-height:35px}
.team-top h2{margin:0;font-size:.84rem}
.team-top ol{margin:0;padding:0;list-style:none}
.team-top li{min-height:43px;border-top:1px solid #e5ede8}
.team-top li span{min-width:0;overflow-wrap:anywhere}
.team-top li strong{white-space:nowrap}
.team-stats .icon{flex:none;width:15px;height:15px;color:#688075}
</style>
