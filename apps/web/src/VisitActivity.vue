<script setup lang="ts">
import { publicSectionLabels, type PublicVisitReport } from '@torneos/shared';

defineProps<{ report: PublicVisitReport | null; loading: boolean; error: string }>();
const number = new Intl.NumberFormat('es-PY');
</script>

<template>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <p v-if="loading && !report" class="loading" role="status">Cargando visitas…</p>
  <div v-if="report" class="stack">
    <section class="panel pad stack" aria-label="Sesiones del portal público">
      <div class="between wrap"><span>Visitas desde que se activó el conteo</span><strong>{{ number.format(report.total) }}</strong></div>
      <div class="between wrap"><span>Visitas en los últimos 30 días</span><strong>{{ number.format(report.recent) }}</strong></div>
    </section>
    <section class="panel pad">
      <h2>Copas más vistas</h2>
      <p class="small muted">Últimos 30 días</p>
      <p v-if="!report.cups.length" class="empty">Todavía no hay aperturas de copas.</p>
      <div v-for="cup in report.cups" :key="cup.id" class="audit-item">
        <div class="between wrap"><strong>{{ cup.name }}</strong><b>{{ number.format(cup.views) }}</b></div>
        <small>{{ cup.organization }}</small>
      </div>
    </section>
    <section class="panel pad">
      <h2>Secciones más abiertas</h2>
      <p class="small muted">Últimos 30 días · todas las copas</p>
      <p v-if="!report.sections.length" class="empty">Todavía no hay aperturas de secciones.</p>
      <div v-for="row in report.sections" :key="row.section" class="audit-item">
        <div class="between wrap"><span>{{ publicSectionLabels[row.section] }}</span><strong>{{ number.format(row.views) }}</strong></div>
      </div>
    </section>
  </div>
</template>
