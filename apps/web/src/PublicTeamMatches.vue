<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import { announcedDate } from './announced-fixture.ts';
import { plainPublicClick, publicNavigationUrl, type TeamMatch } from './public-navigation.ts';

const props = defineProps<{ matches: TeamMatch[]; loading?: boolean; error?: string }>();
const emit = defineEmits<{ open: [match: TeamMatch]; retry: [] }>();
const sections = computed(() => {
  const order = (match: TeamMatch, undated: string) => `${match.date || undated}T${match.time || ''}`;
  const upcoming = props.matches.filter(match => match.status !== 'official').sort((a,b) => order(a,'9999').localeCompare(order(b,'9999')));
  const played = props.matches.filter(match => match.status === 'official').sort((a,b) => order(b,'0000').localeCompare(order(a,'0000')));
  return [{ title: 'Próximos', matches: upcoming }, { title: 'Disputados', matches: played }].filter(section => section.matches.length);
});
function href(match: TeamMatch) {
  return publicNavigationUrl(location.pathname, '', 'partidos', { kind: match.kind, id: match.id });
}
function open(event: MouseEvent, match: TeamMatch) {
  if (!plainPublicClick(event)) return;
  event.preventDefault();
  emit('open', match);
}
</script>

<template>
  <div class="team-matches">
    <p v-if="error" role="alert">{{ error }} <button type="button" class="text-action" @click="emit('retry')">Reintentar</button></p>
    <p v-else-if="loading && !matches.length" role="status">Cargando partidos…</p>
    <p v-else-if="!matches.length">Aún no hay partidos para este equipo.</p>
    <section v-for="section in sections" :key="section.title">
      <h2>{{ section.title }}</h2>
      <a v-for="match in section.matches" :key="`${match.kind}:${match.id}`" :href="href(match)" class="team-match" @click="open($event, match)">
        <span class="team-match-main">
          <strong>{{ match.home }} – {{ match.away }}</strong>
          <small>{{ match.round }} · <time v-if="match.date" :datetime="match.date">{{ announcedDate(match.date) }}</time><template v-else>Fecha pendiente</template><template v-if="match.time"> · {{ match.time }}</template></small>
        </span>
        <span v-if="match.score" class="team-match-score"><b>{{ match.score }}</b><small>{{ match.status === 'official' ? 'Final' : 'Provisional' }}</small></span>
        <Icon name="arrow" />
      </a>
    </section>
  </div>
</template>

<style scoped>
.team-matches{margin:auto;padding:14px 0 32px;color:#10252b}
.team-matches section+section{margin-top:20px}
.team-matches h2{margin:0 0 7px;font-size:.86rem}
.team-matches p{font-size:.78rem;color:#576f64}
.team-match{display:flex;align-items:center;gap:10px;min-height:54px;padding:8px 2px;border-top:1px solid #e5ede8;color:inherit;text-decoration:none}
.team-match:hover{background:#f4f9f6}
.team-match:focus-visible{outline:2px solid #15a36c;outline-offset:-2px}
.team-match-main{flex:1;min-width:0;overflow-wrap:anywhere}
.team-match strong{display:block;font-size:.78rem}
.team-match small{display:block;margin-top:3px;color:#576f64;font-size:.67rem}
.team-match-score{flex:none;text-align:center;font-variant-numeric:tabular-nums}
.team-match>.icon{flex:none;width:15px;height:15px;color:#688075}
</style>
