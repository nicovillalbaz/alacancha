<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const supportedPhone = ref(false);
const installed = ref(false);
const open = ref(false);
const isIos = ref(false);
const promptEvent = ref<InstallPromptEvent | null>(null);
let displayMode: MediaQueryList | null = null;

function refreshInstalled() {
  installed.value = !!displayMode?.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
  if (installed.value) open.value = false;
}
function onPrompt(event: Event) {
  event.preventDefault();
  promptEvent.value = event as InstallPromptEvent;
}
function onInstalled() { installed.value = true; open.value = false; promptEvent.value = null; }
async function install() {
  if (promptEvent.value) {
    const pending = promptEvent.value;
    promptEvent.value = null;
    try {
      await pending.prompt();
      const choice = await pending.userChoice;
      if (choice.outcome === 'accepted') onInstalled();
    } catch { open.value = true; }
    return;
  }
  open.value = true;
}
onMounted(() => {
  const agent = navigator.userAgent;
  isIos.value = /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
  supportedPhone.value = isIos.value || /Android/i.test(agent);
  displayMode = window.matchMedia('(display-mode: standalone)');
  displayMode.addEventListener('change', refreshInstalled);
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  refreshInstalled();
});
onUnmounted(() => {
  displayMode?.removeEventListener('change', refreshInstalled);
  window.removeEventListener('beforeinstallprompt', onPrompt);
  window.removeEventListener('appinstalled', onInstalled);
});
</script>

<template>
  <div v-if="(supportedPhone || promptEvent) && !installed" class="install-entry">
    <button type="button" class="install-trigger" aria-label="Instalar aplicación" @click="install"><span aria-hidden="true">↓</span> Instalar</button>
    <div v-if="open" class="install-backdrop" @click.self="open=false">
      <section role="dialog" aria-modal="true" aria-labelledby="install-title" class="install-sheet">
        <div class="install-head"><h2 id="install-title">Instalar aplicación</h2><button type="button" aria-label="Cerrar" @click="open=false">×</button></div>
        <p v-if="isIos">En Safari, tocá <strong>Compartir</strong> y después <strong>Añadir a pantalla de inicio</strong>.</p>
        <p v-else>En el menú <strong>⋮</strong> del navegador, tocá <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</p>
        <button type="button" class="install-close" @click="open=false">Entendido</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.install-entry{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:80}.install-trigger{display:flex;align-items:center;gap:5px;min-height:42px;padding:0 13px;border:1px solid #c8dfd2;border-radius:24px;background:#10583d;color:#fff;box-shadow:0 3px 14px #10252b30;font:700 .76rem system-ui;cursor:pointer}.install-trigger span{font-size:1.15rem;line-height:1}.install-backdrop{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:#081d20a8}.install-sheet{width:100%;max-width:480px;padding:18px 18px calc(18px + env(safe-area-inset-bottom));border-radius:18px 18px 0 0;background:#fff;color:#14242c;box-shadow:0 -8px 32px #061c2340}.install-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.install-head h2{margin:0;font-size:1.07rem}.install-head button{width:44px;height:44px;border:0;background:transparent;color:#314f47;font:1.6rem system-ui}.install-sheet p{margin:10px 0 17px;font-size:.88rem;line-height:1.5}.install-close{width:100%;min-height:46px;border:0;border-radius:8px;background:#10583d;color:#fff;font:700 .86rem system-ui}.install-trigger:focus-visible,.install-head button:focus-visible,.install-close:focus-visible{outline:3px solid #0cac70;outline-offset:3px}
</style>
