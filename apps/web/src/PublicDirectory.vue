<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import Icon from './Icon.vue';

type OrganizationItem = { id: string; name: string; public_slug: string; tournament_count: number };
type TournamentItem = { id: string; name: string; organization_id: string; organization_name: string };
const props = defineProps<{ organizations: OrganizationItem[]; loading: boolean; error: string }>();
const emit = defineEmits<{ select: [organizationId: string]; selectTournament: [organizationId: string, tournamentId: string] }>();
const query = ref('');
const tournaments = ref<TournamentItem[]>([]);
const searching = ref(false);
const searchError = ref('');
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchController: AbortController | null = null;
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');
const organizations = computed(() => {
  const term = normalize(query.value.trim());
  return props.organizations.filter(item => normalize(item.name).includes(term));
});
watch(query, (value) => {
  clearTimeout(searchTimer);
  searchController?.abort();
  tournaments.value = [];
  searchError.value = '';
  const term = value.trim();
  if (!term) { searching.value = false; return; }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    const controller = new AbortController();
    searchController = controller;
    try {
      const response = await fetch(`/api/v1/public/tournaments?q=${encodeURIComponent(term)}`, { signal: controller.signal });
      if (!response.ok) throw new Error('No se pudo buscar torneos.');
      const rows = await response.json() as TournamentItem[];
      if (!controller.signal.aborted && query.value.trim() === term) tournaments.value = rows;
    } catch (failure) {
      if (!controller.signal.aborted) searchError.value = failure instanceof Error ? failure.message : 'No se pudo buscar torneos.';
    } finally {
      if (searchController === controller) { searching.value = false; searchController = null; }
    }
  }, 180);
});
onUnmounted(() => { clearTimeout(searchTimer); searchController?.abort(); });
</script>

<template>
  <div class="public-directory">
    <header class="directory-header"><div class="directory-top"><span>Fútbol</span><a href="/acceso">Acceso</a></div><h1>Organizaciones</h1></header>
    <div class="directory-body">
      <label class="directory-search"><Icon name="search" /><span class="sr-only">Buscar organización o torneo</span><input v-model="query" type="search" placeholder="Buscar organización o torneo" autocomplete="off"></label>
      <p v-if="loading" class="directory-state" role="status">Cargando…</p>
      <p v-else-if="error" class="directory-state error" role="alert">{{ error }}</p>
      <p v-if="searchError" class="directory-state error" role="alert">{{ searchError }}</p>
      <p v-if="searching" class="directory-state" role="status">Buscando…</p>
      <p v-if="query && organizations.length" class="directory-group">Organizaciones</p>
      <button v-for="item in organizations" :key="item.id" type="button" class="directory-row" @click="emit('select', item.id)"><span class="directory-mark">{{ item.name.trim().slice(0, 1).toLocaleUpperCase('es') }}</span><span class="directory-name"><strong>{{ item.name }}</strong><small>{{ item.tournament_count }} {{ item.tournament_count === 1 ? 'torneo' : 'torneos' }}</small></span><Icon name="arrow" /></button>
      <p v-if="query && tournaments.length" class="directory-group">Torneos</p>
      <button v-for="item in tournaments" :key="item.id" type="button" class="directory-row" @click="emit('selectTournament', item.organization_id, item.id)"><span class="directory-mark tournament"><Icon name="trophy" /></span><span class="directory-name"><strong>{{ item.name }}</strong><small>{{ item.organization_name }}</small></span><Icon name="arrow" /></button>
      <p v-if="!loading && !error && !searching && !organizations.length && !tournaments.length && !searchError" class="directory-state">{{ query ? 'Sin resultados.' : 'Aún no hay torneos publicados.' }}</p>
    </div>
  </div>
</template>

<style scoped>
.public-directory{min-height:100svh;background:#fff;color:#14242c}.directory-header{background:#102029;color:#fff;padding:11px max(16px,calc((100vw - 880px)/2)) 15px}.directory-top{display:flex;justify-content:space-between;align-items:center;gap:16px;color:#a8c2ba;font-size:.72rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.directory-top a{color:#c9dcd3;text-decoration:none;font-size:.72rem;letter-spacing:0;text-transform:none}.directory-top a:focus-visible,.directory-row:focus-visible,.directory-search:focus-within{outline:3px solid #0cac70;outline-offset:2px}.directory-header h1{margin:13px 0 0;font-size:1.45rem;line-height:1.2}.directory-body{max-width:880px;margin:auto;padding:12px 16px}.directory-search{display:flex;align-items:center;gap:10px;min-height:46px;padding:0 12px;border:1px solid #cddbd6;border-radius:10px}.directory-search .icon{width:18px;height:18px;color:#607a72}.directory-search input{width:100%;border:0;outline:0;background:transparent;color:#14242c;font:inherit;font-size:1rem}.directory-state{padding:16px 2px;color:#60756d;font-size:.86rem}.directory-state.error{color:#a82c31}.directory-group{margin:18px 2px 3px;color:#536c63;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.directory-row{display:flex;align-items:center;gap:12px;width:100%;min-height:60px;padding:7px 2px;border:0;border-bottom:1px solid #e0e8e4;background:#fff;color:#14242c;text-align:left;font:inherit;cursor:pointer}.directory-row:hover{background:#f6faf8}.directory-mark{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:50%;background:#dceee5;color:#07583c;font-size:.95rem;font-weight:850}.directory-mark.tournament{background:#edf4ef}.directory-mark .icon{width:18px;height:18px}.directory-name{min-width:0;flex:1}.directory-name strong,.directory-name small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.directory-name strong{font-size:.88rem}.directory-name small{margin-top:3px;color:#667b72;font-size:.72rem}.directory-row>.icon{width:17px;height:17px;color:#819990}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
