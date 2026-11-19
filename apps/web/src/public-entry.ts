import { createApp } from 'vue';
import PublicApp from './PublicApp.vue';

export function mount(root: Element) {
  const app = createApp(PublicApp);
  app.mount(root);
  return () => app.unmount();
}
