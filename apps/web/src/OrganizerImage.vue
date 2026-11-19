<script lang="ts">
const approaching = new Map<Element, () => void>();
let observer: IntersectionObserver | undefined;

function observe(image: HTMLImageElement, show: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    show();
    return () => {};
  }
  observer ??= new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer!.unobserve(target);
      approaching.get(target)?.();
      approaching.delete(target);
    }
  }, { rootMargin: '320px' });
  approaching.set(image, show);
  observer.observe(image);
  return () => {
    observer!.unobserve(image);
    approaching.delete(image);
  };
}
</script>

<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { organizerImagesKey } from './organizer-images.ts';

const props = defineProps<{ src: string; alt?: string; loading?: 'eager' | 'lazy' }>();
const emit = defineEmits<{ unavailable: [src: string] }>();
const store = inject(organizerImagesKey)!;
const img = ref<HTMLImageElement>();
const visible = ref(props.loading !== 'lazy');
const objectUrl = ref(store.peek(props.src));
const remembered = ref(Boolean(objectUrl.value));
let stopObserving: (() => void) | undefined;

watch([() => props.src, store.revision, visible], async ([path, , ready], _, cleanup) => {
  const cached = store.peek(path);
  objectUrl.value = cached;
  remembered.value = Boolean(cached);
  if (cached || !ready) return;
  let active = true;
  cleanup(() => { active = false; });
  const url = await store.load(path);
  if (!active) return;
  objectUrl.value = url;
  if (!url) emit('unavailable', path);
}, { immediate: true });

onMounted(() => {
  if (!visible.value && img.value) stopObserving = observe(img.value, () => { visible.value = true; });
});
onUnmounted(() => stopObserving?.());
</script>

<template>
  <img ref="img" :src="objectUrl" :alt="alt || ''" :decoding="remembered ? 'sync' : 'auto'" @error="emit('unavailable',src)">
</template>

<style scoped>
img:not([src]){visibility:hidden}
</style>
