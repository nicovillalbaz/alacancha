<script setup lang="ts">
import { shallowRef } from 'vue';

defineProps<{ src: string }>();
const failed = shallowRef('');
const emit = defineEmits<{ unavailable: [src: string] }>();

function unavailable(src: string) {
  failed.value = src;
  emit('unavailable', src);
}
</script>

<template>
  <img :src="failed === src ? undefined : `${src}?size=128`" width="128" height="128" alt="" @error="unavailable(src)">
</template>

<style scoped>
img:not([src]){visibility:hidden}
</style>
