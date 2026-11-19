<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import PublicImage from './PublicImage.vue';

const props=withDefaults(defineProps<{name:string;teamId?:string;organizationId?:string;color?:string;hasShield?:boolean;size?:'sm'|'md'|'lg'}>(),{size:'md'});
const shield = computed(() => props.hasShield && props.teamId && props.organizationId
  ? `/api/v1/public/organizations/${props.organizationId}/teams/${props.teamId}/shield` : '');
const failed = shallowRef('');
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'•';}
</script>
<template>
  <span class="team-crest" :class="`team-crest-${size}`" :style="{'--team-color':color||'#365b70'}">
    <PublicImage v-if="shield&&failed!==shield" :src="shield" :loading="size==='lg'?'eager':'lazy'" @unavailable="failed=$event" />
    <span v-else aria-hidden="true">{{ initials(name) }}</span>
  </span>
</template>
<style scoped>
.team-crest{width:34px;height:34px;display:inline-grid;place-items:center;flex:none;overflow:hidden;border-radius:50%;background:var(--team-color);color:#fff;font-size:.62rem;font-weight:850;letter-spacing:.01em}
.team-crest img{width:100%;height:100%;object-fit:contain;background:#fff}
.team-crest-sm{width:27px;height:27px;font-size:.55rem}
.team-crest-lg{width:60px;height:60px;font-size:.86rem;box-shadow:0 0 0 4px #ffffff18}
</style>
