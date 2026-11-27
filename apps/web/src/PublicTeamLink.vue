<script setup lang="ts">
import { computed } from 'vue';
import { publicNavigationUrl, plainPublicClick } from './public-navigation.ts';

const props = defineProps<{ entryId?: string | null; name: string }>();
const emit = defineEmits<{ open: [entryId: string] }>();
const href = computed(() => props.entryId
  ? publicNavigationUrl(location.pathname, '', 'equipos', { kind: 'equipo', id: props.entryId }) : undefined);
function activate(event: MouseEvent) {
  if (!props.entryId || !plainPublicClick(event)) return;
  event.preventDefault();
  emit('open', props.entryId);
}
</script>

<template>
  <component :is="href ? 'a' : 'span'" :href="href" :aria-label="href ? `Ver equipo ${name}` : undefined" class="public-team-link" @click="activate">
    <slot />
  </component>
</template>

<style scoped>
.public-team-link{color:inherit;text-decoration:none;min-width:0}
a.public-team-link:hover{text-decoration:underline}
a.public-team-link:focus-visible{outline:2px solid #15a36c;outline-offset:2px;border-radius:3px}
</style>
