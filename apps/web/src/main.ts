import { createApp } from 'vue';
import App from './App.vue';
import '../../../packages/ui/src/styles.css';
createApp(App).mount('#app');
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { /* La web sigue funcionando sin instalación. */ }); });
}
