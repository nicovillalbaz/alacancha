<script setup lang="ts">
withDefaults(defineProps<{ name?: string }>(), { name: 'shield' });
const paths: Record<string, string> = {
  shield: '<path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Z"/><path d="m8 12 3 3 5-6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  exit: '<path d="M9 4H4v16h5m5-4 4-4-4-4m-5 4h13"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  trophy: '<path d="M7 4h10v7a5 5 0 0 1-10 0V4ZM7 6H4v3a4 4 0 0 0 3 4m10-7h3v3a4 4 0 0 1-3 4M12 16v4m-4 1h8"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h5m-5 4h9"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m9 8 3-2 3 2 1 4-4 3-4-3 1-4Zm3 7v6m-4-9-5 2m13-2 5 2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  chart: '<path d="M4 20V4m0 16h16M8 16l4-5 3 2 5-7"/>',
  close: '<path d="M5 5 19 19M19 5 5 19"/>',
  edit: '<path d="M12 20h9M4 17.5 16.7 4.8a2.1 2.1 0 0 1 3 3L7 20H4v-2.5Z"/>',
  arrows: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>',
  alert: '<path d="M12 3 2 21h20L12 3Zm0 6v5m0 4h.01"/>',
};
</script>
<template><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="paths[name] || paths.shield"></svg></template>
