<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import PublicTeamLink from './PublicTeamLink.vue';
import { announcedDate } from './announced-fixture.ts';
import { matchRowClicked, plainPublicClick, publicNavigationUrl, type TeamMatch } from './public-navigation.ts';

const props = defineProps<{ matches: TeamMatch[]; loading?: boolean; error?: string }>();
const emit = defineEmits<{ open: [match: TeamMatch]; 'open-team': [id: string]; retry: [] }>();
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
      <div v-for="match in section.matches" :key="`${match.kind}:${match.id}`" class="team-match" @click="matchRowClicked($event)&&emit('open',match)">
        <span class="team-match-main">
          <strong><PublicTeamLink :name="match.home" :entry-id="match.homeEntryId" @open="emit('open-team',$event)">{{ match.home }}</PublicTeamLink> – <PublicTeamLink :name="match.away" :entry-id="match.awayEntryId" @open="emit('open-team',$event)">{{ match.away }}</PublicTeamLink></strong>
          <small>{{ match.round }} · <time v-if="match.date" :datetime="match.date">{{ announcedDate(match.date) }}</time><template v-else>Fecha pendiente</template><template v-if="match.time"> · {{ match.time }}</template></small>
        </span>
        <a :href="href(match)" class="team-match-open" :aria-label="`Ver partido: ${match.home} contra ${match.away}`" @click="open($event,match)">
          <span v-if="match.score" class="team-match-score"><b>{{ match.score }}</b><small>{{ match.status === 'official' ? 'Final' : 'Provisional' }}</small></span>
          <Icon name="arrow" />
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.team-matches{margin:auto;padding:14px 0 32px;color:#10252b}
.team-matches section+section{margin-top:20px}
.team-matches h2{margin:0 0 7px;font-size:.86rem}
.team-matches p{font-size:.78rem;color:#576f64}
.team-match{display:flex;align-items:center;gap:10px;min-height:54px;padding:3px 2px;border-top:1px solid #e5ede8;cursor:pointer}
.team-match:hover{background:#f4f9f6}
.team-match-open{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:44px;min-height:44px;color:inherit;text-decoration:none}
.team-match-open:focus-visible{outline:2px solid #15a36c;outline-offset:-2px}
.team-match-main{flex:1;min-width:0;overflow-wrap:anywhere}
.team-match strong{display:block;font-size:.78rem}
.team-match small{display:block;margin-top:3px;color:#576f64;font-size:.67rem}
.team-match-score{flex:none;text-align:center;font-variant-numeric:tabular-nums}
.team-match-open>.icon{flex:none;width:15px;height:15px;color:#688075}
</style>
