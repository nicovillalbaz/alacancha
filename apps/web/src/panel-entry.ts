import { createApp } from 'vue';
import App from './App.vue';

export function mount(root: Element) {
  const app = createApp(App);
  app.mount(root);
  return () => app.unmount();
}
