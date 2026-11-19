<script lang="ts">
const displayed = new Set<string>();
</script>

<script setup lang="ts">
import { computed, shallowRef } from 'vue';

const props = defineProps<{ src: string; loading?: 'eager' | 'lazy' }>();
const failed = shallowRef('');
const emit = defineEmits<{ unavailable: [src: string] }>();
const warm = computed(() => displayed.has(props.src));

function remember(src: string) {
  displayed.delete(src);
  displayed.add(src);
  if (displayed.size > 256) displayed.delete(displayed.values().next().value!);
}

function unavailable(src: string) {
  failed.value = src;
  emit('unavailable', src);
}
</script>

<template>
  <img :src="failed === src ? undefined : `${src}?size=128`" width="128" height="128" alt=""
    :loading="warm ? 'eager' : loading" :decoding="warm ? 'sync' : 'auto'"
    @load="remember(src)" @error="unavailable(src)">
</template>

<style scoped>
img:not([src]){visibility:hidden}
</style>
