<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { tiebreakerNames, tiebreakerLabels as breakerLabels, previewCompetitionBracket, type CompetitionPlan, type RuleConfig } from '@torneos/shared';
import BracketView from './BracketView.vue';
const props = defineProps<{ modelValue: RuleConfig; disabled?: boolean; focusCards?:boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: RuleConfig] }>();
const lastLimitedCount = ref(1);
type AgeConfig = NonNullable<NonNullable<RuleConfig['eligibility']>['age']>;
const lastAge = ref<AgeConfig | null>(null), lastFixedDate = ref<string | null>(null);
type WalkoverConfig = NonNullable<RuleConfig['advanced']>['walkover'];
const lastWalkover = ref<WalkoverConfig | null>(null);
const customDocument = ref(''), customDocumentError = ref('');
const cardName = ref(''), cardColor = ref('#2278C7'), cardSuspension = ref(0);
const customRegistrationField = ref(''), registrationFieldError = ref('');
const documentInput = ref<HTMLInputElement | null>(null);
const suggestedDocuments = ['Documento de identidad', 'Ficha del jugador', 'Foto', 'Autorización de tutor'];
type Breaker = typeof tiebreakerNames[number];
const breakerGroups: Array<{ title: string; values: Breaker[] }> = [
  { title: 'Partidos entre los empatados', values: ['head_to_head_points', 'head_to_head_wins', 'head_to_head_goal_difference', 'head_to_head_goals_for', 'head_to_head_goals_against'] },
  { title: 'Todos los partidos de la fase', values: ['wins', 'goal_difference', 'goals_for', 'goals_against', 'yellow_cards', 'red_cards'] },
  { title: 'Resolución manual', values: ['manual_draw'] },
];
const rosterTotal = computed(() => props.modelValue.playersOnField + props.modelValue.maxBenchPlayers);
const plannedRounds = computed(() => props.modelValue.competitionPlan ? previewCompetitionBracket(props.modelValue.competitionPlan, props.modelValue.initialPhase?.groupCount ?? null) : []);
const bracketSizes = [2, 4, 8, 16, 32, 64, 128, 256];
function defaultPlan(mode: PhaseMode, groupCount: number | null): CompetitionPlan {
  const qualification = mode === 'groups' ? { from: 'groups' as const, perGroup: 2, bestRemaining: 0 } : mode === 'league' ? { from: 'league' as const, top: 4 } : { from: 'direct' as const, entrants: 8 };
  const count = mode === 'groups' ? (groupCount || 2) * 2 : mode === 'league' ? 4 : 8;
  const bracketSize = 2 ** Math.ceil(Math.log2(count));
  return { qualification, bracketSize, rounds: Array.from({ length: Math.log2(bracketSize) }, (_, index) => ({ size: bracketSize / 2 ** index, pairing: mode === 'knockout' && index === 0 ? 'draw' as const : 'positions' as const, legs: 1 as const })) };
}
function enablePlan() { const next = copy(); if (!next.initialPhase) return; next.competitionPlan = defaultPlan(next.initialPhase.mode, next.initialPhase.groupCount); emit('update:modelValue', next); }
function disablePlan() { const next = copy(); next.competitionPlan = null; emit('update:modelValue', next); }
function setBracketSize(size: number) { const next = copy(); if (!next.competitionPlan) return; const old = next.competitionPlan.rounds; next.competitionPlan.bracketSize = size; next.competitionPlan.rounds = Array.from({ length: Math.log2(size) }, (_, index) => ({ size: size / 2 ** index, pairing: index === 0 && next.competitionPlan!.qualification.from === 'direct' ? (next.competitionPlan!.repechage ? 'positions' : 'draw') : old.find((item) => item.size === size / 2 ** index)?.pairing || 'positions', legs: old.find((item) => item.size === size / 2 ** index)?.legs || 1, resolution: old.find((item) => item.size === size / 2 ** index)?.resolution || 'aggregate' })); emit('update:modelValue', next); }
function setQualifier(key: 'entrants' | 'top' | 'perGroup' | 'bestRemaining', event: Event) { const next = copy(); if (!next.competitionPlan) return; const source = next.competitionPlan.qualification; const value = Number((event.target as HTMLInputElement).value || 0); if (key === 'entrants' && source.from === 'direct') source.entrants = value; if (key === 'top' && source.from === 'league') source.top = value; if (key === 'perGroup' && source.from === 'groups') source.perGroup = value; if (key === 'bestRemaining' && source.from === 'groups') source.bestRemaining = value; emit('update:modelValue', next); }
function setRepechage(enabled: boolean) { const next = copy(); if (!next.competitionPlan) return; next.competitionPlan.repechage = enabled; if (enabled && next.competitionPlan.qualification.from === 'direct') next.competitionPlan.rounds[0].pairing = 'positions'; if (!enabled && next.competitionPlan.qualification.from === 'direct') next.competitionPlan.rounds[0].pairing = 'draw'; emit('update:modelValue', next); }
function addCustomCard() { const label = cardName.value.trim(); if (label.length < 2 || label.length > 40) return; const next = copy(); if (!next.advanced) return; const cards = next.advanced.discipline.customCards || []; if (cards.length >= 8) return; cards.push({ code: `c_${crypto.randomUUID().slice(0,8)}`, label, color: cardColor.value, suspensionMatches: cardSuspension.value }); next.advanced.discipline.customCards = cards; emit('update:modelValue', next); cardName.value = ''; cardSuspension.value = 0; }
function removeCustomCard(code: string) { const next = copy(); if (!next.advanced) return; next.advanced.discipline.customCards = (next.advanced.discipline.customCards || []).filter(card => card.code !== code); emit('update:modelValue', next); }
function setRound(index: number, key: 'pairing' | 'legs' | 'resolution', value: 'positions' | 'draw' | 'aggregate' | 'match_points_penalties' | 'match_points_third' | 1 | 2) { const next = copy(); if (!next.competitionPlan) return; const round=next.competitionPlan.rounds[index]; if (key === 'pairing' && (value==='positions'||value==='draw')) round.pairing = value; if (key === 'legs' && typeof value === 'number'){round.legs = value;if(value===1)round.resolution='aggregate';} if (key === 'resolution' && (value==='aggregate'||value==='match_points_penalties'||value==='match_points_third'))round.resolution=value; emit('update:modelValue', next); }
const qualificationCount = computed(() => { const plan = props.modelValue.competitionPlan, source = plan?.qualification; if (!source) return 0; return source.from === 'direct' ? source.entrants : source.from === 'league' ? source.top : source.perGroup * (props.modelValue.initialPhase?.groupCount || 0) + source.bestRemaining; });
const warnings = computed(() => {
  const rules = props.modelValue, messages: string[] = [];
  if (rules.minimumToStart > rules.playersOnField) messages.push('El mínimo para iniciar supera los jugadores en cancha.');
  if (rules.minimumToContinue > rules.minimumToStart) messages.push('El mínimo para continuar supera el mínimo para iniciar.');
  if (rosterTotal.value > 100) messages.push('Cancha y banca no pueden sumar más de 100 jugadores.');
  if (rules.maxRegisteredPlayers !== null && rules.maxRegisteredPlayers < rosterTotal.value) messages.push('El máximo de inscriptos no alcanza para la planilla de jugadores.');
  if (rules.substitutions?.mode === 'limited' && (rules.substitutions.maxChanges === null || rules.substitutions.maxChanges < 1)) messages.push('Indicá cuántos cambios están permitidos.');
  if (rules.substitutions?.mode === 'limited' && rules.substitutions.maxWindows !== null && rules.substitutions.maxChanges !== null && rules.substitutions.maxWindows > rules.substitutions.maxChanges) messages.push('Las ventanas no pueden superar la cantidad de cambios.');
  return messages;
});
const ageWarnings = computed(() => {
  const age = props.modelValue.eligibility?.age, messages: string[] = [];
  if (age && age.minYears === null && age.maxYears === null) messages.push('Indicá una edad mínima o máxima, o quitá el límite de edad.');
  if (age && age.minYears !== null && age.maxYears !== null && age.minYears > age.maxYears) messages.push('La edad mínima no puede superar la máxima.');
  if (age?.reference === 'fixed_date' && !age.fixedDate) messages.push('Elegí la fecha de corte de edad.');
  return messages;
});
const advancedWarnings = computed(() => {
  const advanced = props.modelValue.advanced, messages: string[] = [];
  if (advanced?.walkover.enabled && (advanced.walkover.winnerGoals === null || advanced.walkover.loserGoals === null || advanced.walkover.winnerGoals <= advanced.walkover.loserGoals)) messages.push('El marcador de walkover debe dar más goles al ganador.');
  return messages;
});
type PhaseMode = NonNullable<RuleConfig['initialPhase']>['mode'];
function choosePhase(mode: PhaseMode) {
  const next = copy(), previous = next.initialPhase;
  next.initialPhase = { mode, legs: previous?.legs ?? 1, groupCount: mode === 'groups' ? previous?.groupCount ?? 2 : null };
  if (previous?.mode !== mode) next.competitionPlan = mode === 'knockout' ? defaultPlan(mode, null) : null;
  emit('update:modelValue', next);
}
function chooseLegs(legs: 1 | 2) { const next = copy(); if (!next.initialPhase) return; next.initialPhase.legs = legs; emit('update:modelValue', next); }
function setGroupCount(event: Event) { const next = copy(); if (next.initialPhase?.mode !== 'groups') return; next.initialPhase.groupCount = Number((event.target as HTMLInputElement).value || 0); emit('update:modelValue', next); }
type NumberKey = 'playersOnField' | 'minimumToStart' | 'minimumToContinue' | 'maxBenchPlayers' | 'maxBenchStaff' | 'maxRegisteredPlayers';
function copy(): RuleConfig { const next: RuleConfig = JSON.parse(JSON.stringify(props.modelValue)); next.maxMatchRoster = next.playersOnField + next.maxBenchPlayers; return next; }
function number(key: NumberKey, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  const next = copy();
  if (key === 'maxRegisteredPlayers') next.maxRegisteredPlayers = value === '' ? null : Number(value);
  else next[key] = value === '' ? 0 : Number(value);
  next.maxMatchRoster = next.playersOnField + next.maxBenchPlayers;
  emit('update:modelValue', next);
}
function toggleLineupRole(key: 'goalkeeperRequired' | 'captainRequired') {
  const next = copy();
  next.lineupRoles ??= { goalkeeperRequired: false, captainRequired: false };
  next.lineupRoles[key] = !next.lineupRoles[key];
  emit('update:modelValue', next);
}
function period(index: number, key: 'name' | 'minutes', event: Event) {
  const next = copy();
  if (key === 'name') next.periods[index].name = (event.target as HTMLInputElement).value;
  else next.periods[index].minutes = Number((event.target as HTMLInputElement).value || 0);
  emit('update:modelValue', next);
}
function addPeriod() { const next = copy(); next.periods.push({ name: '', minutes: 20 }); emit('update:modelValue', next); }
function removePeriod(index: number) { const next = copy(); next.periods.splice(index, 1); emit('update:modelValue', next); }
function points(key: 'win' | 'draw' | 'loss', event: Event) { const next = copy(); next.points[key] = Number((event.target as HTMLInputElement).value || 0); emit('update:modelValue', next); }
type ChangeMode = NonNullable<RuleConfig['substitutions']>['mode'];
function chooseChangeMode(mode: ChangeMode) {
  const next = copy();
  const previous = next.substitutions;
  if (previous?.mode === mode) return;
  if (previous?.mode === 'limited' && previous.maxChanges !== null && previous.maxChanges > 0) lastLimitedCount.value = previous.maxChanges;
  next.substitutions = mode === 'none' ? { mode, maxChanges: 0, maxWindows: null, reentry: false }
    : { mode, maxChanges: mode === 'limited' ? Math.max(lastLimitedCount.value, previous?.maxWindows ?? 1) : null, maxWindows: previous?.maxWindows ?? null, reentry: previous?.reentry ?? false };
  emit('update:modelValue', next);
}
function changeNumber(key: 'maxChanges' | 'maxWindows', event: Event) {
  const next = copy(); if (!next.substitutions) return;
  const value = (event.target as HTMLInputElement).value;
  next.substitutions[key] = value === '' ? null : Number(value);
  emit('update:modelValue', next);
}
function setReentry(value: boolean) {
  const next = copy(); if (!next.substitutions) return;
  next.substitutions.reentry = value;
  emit('update:modelValue', next);
}
function startEligibility() {
  const next = copy(); next.eligibility = { age: null, requiredDocuments: [], registrationWindow: null, transferProof: { requiredFor: 'none', label: 'Comprobante de pase' } };
  emit('update:modelValue', next);
}
function toggleRegistrationWindow(enabled: boolean) {
  const next = copy(); if (!next.eligibility) return;
  next.eligibility.registrationWindow = enabled ? next.eligibility.registrationWindow ?? { opensOn: '', closesOn: '' } : null;
  emit('update:modelValue', next);
}
function registrationDate(key: 'opensOn' | 'closesOn', event: Event) {
  const next = copy(); if (!next.eligibility?.registrationWindow) return;
  next.eligibility.registrationWindow[key] = (event.target as HTMLInputElement).value;
  emit('update:modelValue', next);
}
function transferProof(requiredFor: 'none' | 'external' | 'all') {
  const next = copy(); if (!next.eligibility) return;
  next.eligibility.transferProof = { requiredFor, label: next.eligibility.transferProof?.label || 'Comprobante de pase' };
  emit('update:modelValue', next);
}
function addRegistrationField() {
  const label = customRegistrationField.value.trim();
  const key = label.toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  const current = props.modelValue.eligibility?.registrationFields || [];
  if (label.length < 2 || label.length > 80 || !/^[a-z][a-z0-9_]{1,31}$/.test(key)) { registrationFieldError.value = 'Escribí una etiqueta de 2 a 80 caracteres que empiece con una letra.'; return; }
  if (current.length >= 8 || current.some((field) => field.key === key)) { registrationFieldError.value = current.length >= 8 ? 'Podés agregar hasta ocho campos.' : 'Ese campo ya existe.'; return; }
  const next = copy(); if (!next.eligibility) return;
  next.eligibility.registrationFields = [...current, { key, label }];
  customRegistrationField.value = ''; registrationFieldError.value = ''; emit('update:modelValue', next);
}
function removeRegistrationField(key: string) {
  const next = copy(); if (!next.eligibility) return;
  next.eligibility.registrationFields = (next.eligibility.registrationFields || []).filter((field) => field.key !== key);
  emit('update:modelValue', next);
}
function setAgeEnabled(enabled: boolean) {
  const next = copy(); if (!next.eligibility) return;
  if (!!next.eligibility.age === enabled) return;
  if (!enabled && next.eligibility.age) lastAge.value = { ...next.eligibility.age };
  next.eligibility.age = enabled ? lastAge.value ? { ...lastAge.value } : { minYears: null, maxYears: null, reference: 'match_date', fixedDate: null } : null;
  emit('update:modelValue', next);
}
function ageNumber(key: 'minYears' | 'maxYears', event: Event) {
  const next = copy(); if (!next.eligibility?.age) return;
  const value = (event.target as HTMLInputElement).value;
  next.eligibility.age[key] = value === '' ? null : Number(value);
  emit('update:modelValue', next);
}
function ageReference(reference: 'match_date' | 'fixed_date') {
  const next = copy(); if (!next.eligibility?.age) return;
  if (next.eligibility.age.reference === reference) return;
  if (next.eligibility.age.reference === 'fixed_date') lastFixedDate.value = next.eligibility.age.fixedDate;
  next.eligibility.age.reference = reference; next.eligibility.age.fixedDate = reference === 'fixed_date' ? lastFixedDate.value : null;
  emit('update:modelValue', next);
}
function ageDate(event: Event) {
  const next = copy(); if (!next.eligibility?.age) return;
  next.eligibility.age.fixedDate = (event.target as HTMLInputElement).value || null;
  lastFixedDate.value = next.eligibility.age.fixedDate;
  emit('update:modelValue', next);
}
function documentSelected(label: string) { return props.modelValue.eligibility?.requiredDocuments.some((item) => item.toLocaleLowerCase('es') === label.toLocaleLowerCase('es')) ?? false; }
function toggleDocument(label: string) {
  const next = copy(); if (!next.eligibility) return;
  const index = next.eligibility.requiredDocuments.findIndex((item) => item.toLocaleLowerCase('es') === label.toLocaleLowerCase('es'));
  if (index >= 0) next.eligibility.requiredDocuments.splice(index, 1);
  else if (next.eligibility.requiredDocuments.length < 12) next.eligibility.requiredDocuments.push(label);
  else { customDocumentError.value = 'Podés exigir hasta 12 documentos.'; return; }
  customDocumentError.value = ''; emit('update:modelValue', next);
}
async function addCustomDocument() {
  const label = customDocument.value.trim();
  if (label.length < 2 || label.length > 80) { customDocumentError.value = 'Escribí entre 2 y 80 caracteres.'; return; }
  if (documentSelected(label)) { customDocumentError.value = 'Ese documento ya está agregado.'; return; }
  const next = copy(); if (!next.eligibility) return;
  if (next.eligibility.requiredDocuments.length >= 12) { customDocumentError.value = 'Podés exigir hasta 12 documentos.'; return; }
  next.eligibility.requiredDocuments.push(label); customDocument.value = ''; customDocumentError.value = '';
  emit('update:modelValue', next); await nextTick(); documentInput.value?.focus();
}
function startAdvanced() {
  const next = copy(); next.advanced = {
    tiebreakers: ['head_to_head_points', 'goal_difference', 'goals_for', 'wins', 'yellow_cards', 'manual_draw'],
    discipline: { yellowCards: true, redCards: true, secondYellowRed: false, yellowAccumulation: null, redReviewRequired: true },
    walkover: { enabled: false, winnerGoals: null, loserGoals: null, winnerPoints: null, loserPoints: null },
  }; emit('update:modelValue', next);
}
function toggleBreaker(value: Breaker) {
  const next = copy(); if (!next.advanced) return;
  const current = next.advanced.tiebreakers, index = current.indexOf(value);
  if (index >= 0 && current.length > 1) current.splice(index, 1);
  else if (index < 0) value === 'manual_draw' ? current.push(value) : current.splice(Math.max(0, current.indexOf('manual_draw')), 0, value);
  emit('update:modelValue', next);
}
function moveBreaker(index: number, offset: -1 | 1) {
  const next = copy(); if (!next.advanced) return;
  const order = next.advanced.tiebreakers, other = index + offset;
  if (other < 0 || other >= order.length || order[index] === 'manual_draw' || order[other] === 'manual_draw') return;
  [order[index], order[other]] = [order[other], order[index]];
  emit('update:modelValue', next);
}
type CardBoolean = 'yellowCards' | 'redCards' | 'secondYellowRed' | 'redReviewRequired';
function setCard(key: CardBoolean, value: boolean) {
  const next = copy(); if (!next.advanced) return;
  const cards = next.advanced.discipline; cards[key] = value;
  if (!cards.yellowCards) { cards.yellowAccumulation = null; cards.secondYellowRed = false; }
  if (!cards.redCards) { cards.redReviewRequired = false; cards.secondYellowRed = false; }
  emit('update:modelValue', next);
}
function yellowAccumulation(event: Event) {
  const next = copy(); if (!next.advanced) return;
  const value = (event.target as HTMLInputElement).value;
  next.advanced.discipline.yellowAccumulation = value === '' ? null : Number(value);
  emit('update:modelValue', next);
}
function setWalkover(enabled: boolean) {
  const next = copy(); if (!next.advanced) return;
  if (next.advanced.walkover.enabled === enabled) return;
  if (!enabled) lastWalkover.value = { ...next.advanced.walkover };
  next.advanced.walkover = enabled ? lastWalkover.value ? { ...lastWalkover.value } : { enabled: true, winnerGoals: 3, loserGoals: 0, winnerPoints: null, loserPoints: null }
    : { enabled: false, winnerGoals: null, loserGoals: null, winnerPoints: null, loserPoints: null };
  emit('update:modelValue', next);
}
function walkoverNumber(key: 'winnerGoals' | 'loserGoals' | 'winnerPoints' | 'loserPoints', event: Event) {
  const next = copy(); if (!next.advanced) return;
  const value = (event.target as HTMLInputElement).value;
  next.advanced.walkover[key] = value === '' ? null : Number(value);
  emit('update:modelValue', next);
}
</script>

<template>
  <div class="rules-fields stack">
    <div><h2>Fase inicial</h2><p class="small muted">Elegí cómo comienza esta categoría. El fixture y los cruces se armarán en la tanda de programación.</p></div>
    <div class="choices grid" role="group" aria-label="Formato de fase inicial">
      <button type="button" class="choice" :aria-pressed="modelValue.initialPhase?.mode === 'league'" :disabled="disabled" @click="choosePhase('league')">Liga</button>
      <button type="button" class="choice" :aria-pressed="modelValue.initialPhase?.mode === 'groups'" :disabled="disabled" @click="choosePhase('groups')">Grupos</button>
      <button type="button" class="choice" :aria-pressed="modelValue.initialPhase?.mode === 'knockout'" :disabled="disabled" @click="choosePhase('knockout')">Eliminación</button>
    </div>
    <div v-if="!modelValue.initialPhase" class="notice amber">Elegí una fase antes de publicar. Podés guardar el borrador sin definirla.</div>
    <div v-else class="stack">
      <div v-if="modelValue.initialPhase.mode !== 'knockout' || !modelValue.competitionPlan" class="choices grid" role="group" aria-label="Cantidad de enfrentamientos"><button type="button" class="choice" :aria-pressed="modelValue.initialPhase.legs === 1" :disabled="disabled" @click="chooseLegs(1)">Una rueda</button><button type="button" class="choice" :aria-pressed="modelValue.initialPhase.legs === 2" :disabled="disabled" @click="chooseLegs(2)">Ida y vuelta</button></div>
      <div v-if="modelValue.initialPhase.mode === 'groups'" class="field"><label for="phase-groups">Cantidad de grupos</label><input id="phase-groups" type="number" inputmode="numeric" min="2" max="32" required :disabled="disabled" :value="modelValue.initialPhase.groupCount ?? ''" @input="setGroupCount($event)"><span class="small muted">Cada grupo necesitará al menos dos equipos cuando se arme el fixture.</span></div>
      <p v-if="modelValue.initialPhase.mode === 'knockout'" class="small muted">Los cruces se definirán en el fixture; los rivales aún desconocidos quedarán pendientes. Con copa planificada, partido único o ida y vuelta se define en cada ronda.</p>
    </div>
    <section v-if="modelValue.initialPhase" class="stack competition-plan-editor">
      <div><h2>Camino al título</h2><p class="small muted">Planificá la copa completa antes de empezar. Las plazas del cuadro quedan pendientes hasta que haya clasificación o sorteo oficial.</p></div>
      <div class="choices grid" role="group" aria-label="Continuación del torneo"><button type="button" class="choice" :aria-pressed="!modelValue.competitionPlan" :disabled="disabled" @click="disablePlan">{{ modelValue.initialPhase.mode === 'knockout' ? 'Cuadro heredado' : 'Solo fase inicial' }}</button><button type="button" class="choice" :aria-pressed="!!modelValue.competitionPlan" :disabled="disabled" @click="enablePlan">{{ modelValue.initialPhase.mode === 'knockout' ? 'Planificar copa' : 'Clasificación y copa' }}</button></div>
      <template v-if="modelValue.competitionPlan">
        <div v-if="modelValue.competitionPlan.qualification.from === 'groups'" class="form-grid"><div class="field"><label for="qualifiers-per-group">Clasifican por grupo</label><input id="qualifiers-per-group" type="number" inputmode="numeric" min="1" max="16" :disabled="disabled" :value="modelValue.competitionPlan.qualification.perGroup" @input="setQualifier('perGroup',$event)"></div><div class="field"><label for="best-remaining">Mejores restantes</label><input id="best-remaining" type="number" inputmode="numeric" min="0" max="32" :disabled="disabled" :value="modelValue.competitionPlan.qualification.bestRemaining" @input="setQualifier('bestRemaining',$event)"></div></div>
        <div v-else-if="modelValue.competitionPlan.qualification.from === 'league'" class="field"><label for="league-qualifiers">Primeros puestos que clasifican</label><input id="league-qualifiers" type="number" inputmode="numeric" min="2" max="256" :disabled="disabled" :value="modelValue.competitionPlan.qualification.top" @input="setQualifier('top',$event)"></div>
        <div v-else class="field"><label for="direct-entrants">Equipos previstos para la copa</label><input id="direct-entrants" type="number" inputmode="numeric" min="2" max="256" :disabled="disabled" :value="modelValue.competitionPlan.qualification.entrants" @input="setQualifier('entrants',$event)"></div>
        <div class="choices grid" role="group" aria-label="Repechaje"><button type="button" class="choice" :aria-pressed="!!modelValue.competitionPlan.repechage" :disabled="disabled" @click="setRepechage(true)">Con repechaje</button><button type="button" class="choice" :aria-pressed="!modelValue.competitionPlan.repechage" :disabled="disabled" @click="setRepechage(false)">Sin repechaje</button></div>
        <div><span class="label">Tamaño del cuadro</span><div class="choices grid mt" role="group" aria-label="Tamaño del cuadro"><button v-for="size in bracketSizes" :key="size" type="button" class="choice" :aria-pressed="modelValue.competitionPlan.bracketSize === size" :disabled="disabled" @click="setBracketSize(size)">{{ size }}</button></div><p class="small muted mt">{{ qualificationCount }} plazas previstas{{ qualificationCount < modelValue.competitionPlan.bracketSize ? ` · ${modelValue.competitionPlan.bracketSize - qualificationCount} descansos` : '' }}.</p></div>
        <p v-if="qualificationCount > modelValue.competitionPlan.bracketSize" class="notice amber" role="alert">Los clasificados no caben en el cuadro. Aumentá el tamaño o reducí la cantidad.</p>
        <div v-for="(round,index) in modelValue.competitionPlan.rounds" :key="round.size" class="optional-section"><h3>{{ plannedRounds[index]?.name }}</h3><div class="choices grid" role="group" :aria-label="`Cruces de ${plannedRounds[index]?.name}`"><button type="button" class="choice" :aria-pressed="round.pairing === 'positions'" :disabled="disabled || (index === 0 && modelValue.competitionPlan.qualification.from === 'direct' && !modelValue.competitionPlan.repechage)" @click="setRound(index,'pairing','positions')">Por posiciones</button><button type="button" class="choice" :aria-pressed="round.pairing === 'draw'" :disabled="disabled" @click="setRound(index,'pairing','draw')">Por sorteo</button></div><div class="choices grid" role="group" :aria-label="`Partidos de ${plannedRounds[index]?.name}`"><button type="button" class="choice" :aria-pressed="round.legs === 1" :disabled="disabled" @click="setRound(index,'legs',1)">Partido único</button><button type="button" class="choice" :aria-pressed="round.legs === 2" :disabled="disabled" @click="setRound(index,'legs',2)">Ida y vuelta</button></div><div v-if="round.legs===2" class="choices grid resolution-choices" role="group" :aria-label="`Desempate de ${plannedRounds[index]?.name}`"><button type="button" class="choice" :aria-pressed="!round.resolution||round.resolution==='aggregate'" :disabled="disabled" @click="setRound(index,'resolution','aggregate')">Goles globales</button><button type="button" class="choice" :aria-pressed="round.resolution==='match_points_penalties'" :disabled="disabled" @click="setRound(index,'resolution','match_points_penalties')">Puntos · penales</button><button type="button" class="choice" :aria-pressed="round.resolution==='match_points_third'" :disabled="disabled" @click="setRound(index,'resolution','match_points_third')">Puntos · tercer partido</button></div></div>
        <p class="small muted">Por posiciones se ordenan las plazas de mejor a peor puesto; por sorteo los cruces se definirán al llegar a esa ronda. No se asigna un rival antes del sorteo.</p>
        <BracketView v-if="qualificationCount <= modelValue.competitionPlan.bracketSize" :rounds="plannedRounds" planned />
      </template>
    </section>
    <div><h2>Plantel y planilla</h2><p class="small muted">Valores sugeridos; ajustalos a tu reglamento antes de publicar.</p></div>
    <div class="form-grid">
      <div class="field"><label for="rule-field">Jugadores en cancha</label><input id="rule-field" type="number" inputmode="numeric" min="1" max="30" required :disabled="disabled" :value="modelValue.playersOnField" @input="number('playersOnField',$event)"></div>
      <div class="field"><label for="rule-start">Mínimo para iniciar</label><input id="rule-start" type="number" inputmode="numeric" min="1" max="30" required :disabled="disabled" :value="modelValue.minimumToStart" @input="number('minimumToStart',$event)"></div>
      <div class="field"><label for="rule-continue">Mínimo para continuar</label><input id="rule-continue" type="number" inputmode="numeric" min="1" max="30" required :disabled="disabled" :value="modelValue.minimumToContinue" @input="number('minimumToContinue',$event)"></div>
      <div class="field"><label for="rule-bench">Jugadores en banca</label><input id="rule-bench" type="number" inputmode="numeric" min="0" max="100" required :disabled="disabled" :value="modelValue.maxBenchPlayers" @input="number('maxBenchPlayers',$event)"></div>
      <div class="field"><label for="rule-staff">Cuerpo técnico en planilla</label><input id="rule-staff" type="number" inputmode="numeric" min="0" max="50" required :disabled="disabled" :value="modelValue.maxBenchStaff" @input="number('maxBenchStaff',$event)"></div>
      <div class="field"><label for="rule-registered">Máximo de inscriptos <span class="muted">(opcional)</span></label><input id="rule-registered" type="number" inputmode="numeric" min="1" max="500" :disabled="disabled" :value="modelValue.maxRegisteredPlayers ?? ''" @input="number('maxRegisteredPlayers',$event)"></div>
    </div>
    <div class="notice neutral" role="status" aria-live="polite"><span>Planilla de jugadores: <strong>{{ rosterTotal }}</strong> (cancha + banca). El cuerpo técnico se cuenta aparte.</span></div>
    <div><h2>Edad y documentos</h2><p class="small muted">Estos requisitos se revisarán en la lista de buena fe. No cargues datos personales aquí.</p></div>
    <div v-if="!modelValue.eligibility" class="stack"><div class="notice amber"><span>La elegibilidad todavía no está definida. Revisala antes de publicar.</span></div><button type="button" class="btn soft" :disabled="disabled" @click="startEligibility">Definir edad y documentos</button></div>
    <div v-else class="stack">
      <div class="choices grid" role="group" aria-label="Límite de edad"><button type="button" class="choice" :aria-pressed="!modelValue.eligibility.age" :disabled="disabled" @click="setAgeEnabled(false)">Sin límite de edad</button><button type="button" class="choice" :aria-pressed="!!modelValue.eligibility.age" :disabled="disabled" @click="setAgeEnabled(true)">Definir edad</button></div>
      <div v-if="modelValue.eligibility.age" class="stack">
        <div class="form-grid"><div class="field"><label for="rule-age-min">Edad mínima <span class="muted">(opcional)</span></label><input id="rule-age-min" type="number" inputmode="numeric" min="0" max="120" :disabled="disabled" :value="modelValue.eligibility.age.minYears ?? ''" @input="ageNumber('minYears',$event)"></div><div class="field"><label for="rule-age-max">Edad máxima <span class="muted">(opcional)</span></label><input id="rule-age-max" type="number" inputmode="numeric" min="0" max="120" :disabled="disabled" :value="modelValue.eligibility.age.maxYears ?? ''" @input="ageNumber('maxYears',$event)"></div></div>
        <div><span class="label">Calcular edad en</span><div class="choices grid mt" role="group" aria-label="Fecha de referencia de edad"><button type="button" class="choice" :aria-pressed="modelValue.eligibility.age.reference === 'match_date'" :disabled="disabled" @click="ageReference('match_date')">Fecha del partido</button><button type="button" class="choice" :aria-pressed="modelValue.eligibility.age.reference === 'fixed_date'" :disabled="disabled" @click="ageReference('fixed_date')">Fecha de corte fija</button></div></div>
        <div v-if="modelValue.eligibility.age.reference === 'fixed_date'" class="field"><label for="rule-age-date">Fecha de corte</label><input id="rule-age-date" type="date" :disabled="disabled" :value="modelValue.eligibility.age.fixedDate ?? ''" @input="ageDate($event)"></div>
        <div v-if="ageWarnings.length" class="notice error" role="alert"><p v-for="message in ageWarnings" :key="message">{{ message }}</p></div>
      </div>
      <div><span class="label">Documentos obligatorios</span><p class="small muted">Elegí sugerencias o agregá uno propio. Si no marcás ninguno, no se exigirán documentos adicionales.</p></div>
      <div class="choices grid" role="group" aria-label="Documentos sugeridos"><button v-for="label in suggestedDocuments" :key="label" type="button" class="choice" :aria-pressed="documentSelected(label)" :disabled="disabled" @click="toggleDocument(label)">{{ label }}</button></div>
      <div v-for="label in modelValue.eligibility.requiredDocuments.filter((item) => !suggestedDocuments.includes(item))" :key="label" class="between wrap"><span>{{ label }}</span><button type="button" class="btn" :disabled="disabled" :aria-label="`Quitar ${label}`" @click="toggleDocument(label)">Quitar</button></div>
      <div class="field"><label for="rule-custom-document">Otro documento</label><div class="copy-row"><input id="rule-custom-document" ref="documentInput" v-model="customDocument" maxlength="80" :disabled="disabled" placeholder="Ej. constancia de pase" @input="customDocumentError = ''"><button type="button" class="btn" :disabled="disabled" @click="addCustomDocument">Agregar</button></div><span v-if="customDocumentError" class="small error-text" role="alert">{{ customDocumentError }}</span></div>
      <div><span class="label">Comprobante de pase aprobado</span><p class="small muted">Se exige al revisar buena fe y al evaluar la convocatoria. El origen externo sigue siendo una declaración.</p><div class="choices grid mt" role="group" aria-label="Política de comprobante de pase"><button type="button" class="choice" :aria-pressed="!modelValue.eligibility.transferProof || modelValue.eligibility.transferProof.requiredFor === 'none'" :disabled="disabled" @click="transferProof('none')">No exigir</button><button type="button" class="choice" :aria-pressed="modelValue.eligibility.transferProof?.requiredFor === 'external'" :disabled="disabled" @click="transferProof('external')">Origen externo</button><button type="button" class="choice" :aria-pressed="modelValue.eligibility.transferProof?.requiredFor === 'all'" :disabled="disabled" @click="transferProof('all')">Todos</button></div></div>
      <p v-if="!modelValue.eligibility.age && !modelValue.eligibility.requiredDocuments.length" class="notice neutral">Sin restricciones adicionales de edad ni documentos. Esta decisión quedará en el reglamento publicado.</p>
    </div>
    <div id="rule-cards"><h2>Tarjetas, walkover y desempates</h2></div>
    <div v-if="!modelValue.advanced" class="stack"><div class="notice amber">Estos criterios todavía no están definidos. Podés guardar el borrador.</div><button type="button" class="btn soft" :disabled="disabled" @click="startAdvanced">Definir criterios deportivos</button></div>
    <div v-else class="stack">
      <div><h3>Tarjetas</h3><p class="small muted">La acumulación avisa para revisión; no sanciona automáticamente.</p></div>
      <div class="choices grid" role="group" aria-label="Tarjetas amarillas"><button type="button" class="choice" :aria-pressed="modelValue.advanced.discipline.yellowCards" :disabled="disabled" @click="setCard('yellowCards',true)">Con amarillas</button><button type="button" class="choice" :aria-pressed="!modelValue.advanced.discipline.yellowCards" :disabled="disabled" @click="setCard('yellowCards',false)">Sin amarillas</button></div>
      <div class="choices grid" role="group" aria-label="Tarjetas rojas"><button type="button" class="choice" :aria-pressed="modelValue.advanced.discipline.redCards" :disabled="disabled" @click="setCard('redCards',true)">Con rojas</button><button type="button" class="choice" :aria-pressed="!modelValue.advanced.discipline.redCards" :disabled="disabled" @click="setCard('redCards',false)">Sin rojas</button></div>
      <div v-if="modelValue.advanced.discipline.yellowCards" class="field"><label for="rule-yellow-limit">Avisar tras esta cantidad de amarillas <span class="muted">(opcional)</span></label><input id="rule-yellow-limit" type="number" inputmode="numeric" min="1" max="20" :disabled="disabled" :value="modelValue.advanced.discipline.yellowAccumulation ?? ''" @input="yellowAccumulation($event)"></div>
      <div v-if="modelValue.advanced.discipline.yellowCards && modelValue.advanced.discipline.redCards" class="choices grid" role="group" aria-label="Segunda amarilla"><button type="button" class="choice" :aria-pressed="modelValue.advanced.discipline.secondYellowRed" :disabled="disabled" @click="setCard('secondYellowRed',true)">Segunda amarilla: roja</button><button type="button" class="choice" :aria-pressed="!modelValue.advanced.discipline.secondYellowRed" :disabled="disabled" @click="setCard('secondYellowRed',false)">Revisión manual</button></div>
      <div v-if="modelValue.advanced.discipline.redCards" class="choices grid" role="group" aria-label="Revisión de roja"><button type="button" class="choice" :aria-pressed="modelValue.advanced.discipline.redReviewRequired" :disabled="disabled" @click="setCard('redReviewRequired',true)">Revisar roja</button><button type="button" class="choice" :aria-pressed="!modelValue.advanced.discipline.redReviewRequired" :disabled="disabled" @click="setCard('redReviewRequired',false)">Sin revisión exigida</button></div>
      <div v-for="card in modelValue.advanced.discipline.customCards || []" :key="card.code" class="directory-row"><span class="team-mark" :style="{background:card.color}" aria-hidden="true"></span><strong>{{ card.label }}</strong><span class="small muted">{{ card.suspensionMatches }} partidos sugeridos</span><button type="button" class="btn" :disabled="disabled" @click="removeCustomCard(card.code)">Quitar</button></div>
      <details class="optional-section" :open="focusCards"><summary>Agregar tarjeta</summary><div class="field mt"><label for="custom-card-name">Nombre</label><input id="custom-card-name" v-model="cardName" maxlength="40" placeholder="Ej. Azul"></div><div class="form-grid mt"><div class="field"><label for="custom-card-color">Color</label><input id="custom-card-color" v-model="cardColor" type="color"></div><div class="field"><label for="custom-card-suspension">Partidos sugeridos de suspensión</label><input id="custom-card-suspension" v-model.number="cardSuspension" type="number" min="0" max="50"></div></div><button type="button" class="btn mt" :disabled="disabled || cardName.trim().length<2" @click="addCustomCard">Agregar</button></details>
      <div><h3>Walkover</h3><p class="small muted">Marcador adjudicado separado del resultado jugado. Los puntos vacíos usan la puntuación de victoria/derrota.</p></div>
      <div class="choices grid" role="group" aria-label="Walkover"><button type="button" class="choice" :aria-pressed="!modelValue.advanced.walkover.enabled" :disabled="disabled" @click="setWalkover(false)">No previsto</button><button type="button" class="choice" :aria-pressed="modelValue.advanced.walkover.enabled" :disabled="disabled" @click="setWalkover(true)">Permitir walkover</button></div>
      <div v-if="modelValue.advanced.walkover.enabled" class="form-grid"><div class="field"><label for="walkover-winner">Goles adjudicados al ganador</label><input id="walkover-winner" type="number" inputmode="numeric" min="0" max="30" :disabled="disabled" :value="modelValue.advanced.walkover.winnerGoals ?? ''" @input="walkoverNumber('winnerGoals',$event)"></div><div class="field"><label for="walkover-loser">Goles adjudicados al perdedor</label><input id="walkover-loser" type="number" inputmode="numeric" min="0" max="30" :disabled="disabled" :value="modelValue.advanced.walkover.loserGoals ?? ''" @input="walkoverNumber('loserGoals',$event)"></div><div class="field"><label for="walkover-winner-points">Puntos del ganador <span class="muted">(opcional)</span></label><input id="walkover-winner-points" type="number" inputmode="numeric" min="0" max="10" :disabled="disabled" :value="modelValue.advanced.walkover.winnerPoints ?? ''" @input="walkoverNumber('winnerPoints',$event)"></div><div class="field"><label for="walkover-loser-points">Puntos del perdedor <span class="muted">(opcional)</span></label><input id="walkover-loser-points" type="number" inputmode="numeric" min="0" max="10" :disabled="disabled" :value="modelValue.advanced.walkover.loserPoints ?? ''" @input="walkoverNumber('loserPoints',$event)"></div></div>
      <div v-if="advancedWarnings.length" class="notice error" role="alert"><p v-for="message in advancedWarnings" :key="message">{{ message }}</p></div>
      <div><h3>Desempates</h3><p class="small muted">Los puntos totales van primero. Para «entre sí» se cuentan los partidos oficiales de todos los equipos aún empatados. Elegí los criterios siguientes y ordenalos; el sorteo documentado queda al final.</p></div>
      <div v-for="group in breakerGroups" :key="group.title"><span class="label">{{ group.title }}</span><div class="choices grid mt" role="group" :aria-label="group.title"><button v-for="value in group.values" :key="value" type="button" class="choice" :aria-pressed="modelValue.advanced.tiebreakers.includes(value)" :disabled="disabled || (modelValue.advanced.tiebreakers.length === 1 && modelValue.advanced.tiebreakers.includes(value))" @click="toggleBreaker(value)">{{ breakerLabels[value] }}</button></div></div>
      <ol class="stack ranking-list"><li v-for="(value,index) in modelValue.advanced.tiebreakers" :key="value"><span>{{ breakerLabels[value] }}</span><span class="copy-row"><button type="button" class="btn ranking-arrow" :aria-label="`Subir ${breakerLabels[value]}`" :disabled="disabled || index === 0 || value === 'manual_draw'" @click="moveBreaker(index,-1)">↑</button><button type="button" class="btn ranking-arrow" :aria-label="`Bajar ${breakerLabels[value]}`" :disabled="disabled || index === modelValue.advanced.tiebreakers.length - 1 || modelValue.advanced.tiebreakers[index + 1] === 'manual_draw'" @click="moveBreaker(index,1)">↓</button></span></li></ol>
    </div>
    <div><h2>Períodos</h2><p class="small muted">Podés cambiar nombres y duraciones, o agregar tiempo extra.</p></div>
    <div v-for="(item,index) in modelValue.periods" :key="index" class="period-row">
      <div class="field"><label :for="`period-name-${index}`">Tiempo {{ index + 1 }}</label><input :id="`period-name-${index}`" :value="item.name" maxlength="40" required :disabled="disabled" @input="period(index,'name',$event)"></div>
      <div class="field"><label :for="`period-minutes-${index}`">Minutos</label><input :id="`period-minutes-${index}`" type="number" inputmode="numeric" min="1" max="120" required :value="item.minutes" :disabled="disabled" @input="period(index,'minutes',$event)"></div>
      <button v-if="modelValue.periods.length > 1 && !disabled" type="button" class="btn" :aria-label="`Quitar ${item.name || `tiempo ${index + 1}`}`" @click="removePeriod(index)">Quitar</button>
    </div>
    <button v-if="modelValue.periods.length < 6 && !disabled" type="button" class="btn soft" @click="addPeriod">Agregar otro tiempo</button>
    <h2>Puntos de clasificación</h2>
    <div class="form-grid">
      <div class="field"><label for="points-win">Victoria</label><input id="points-win" type="number" inputmode="numeric" min="0" max="10" required :value="modelValue.points.win" :disabled="disabled" @input="points('win',$event)"></div>
      <div class="field"><label for="points-draw">Empate</label><input id="points-draw" type="number" inputmode="numeric" min="0" max="10" required :value="modelValue.points.draw" :disabled="disabled" @input="points('draw',$event)"></div>
      <div class="field"><label for="points-loss">Derrota</label><input id="points-loss" type="number" inputmode="numeric" min="0" max="10" required :value="modelValue.points.loss" :disabled="disabled" @input="points('loss',$event)"></div>
    </div>
  </div>
</template>
<style scoped>
.resolution-choices .choice:last-child{grid-column:1/-1}
</style>
