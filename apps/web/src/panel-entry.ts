import { createApp } from 'vue';
import App from './App.vue';

export function mount(root: Element, initialSession?: Promise<Response | undefined>) {
  const app = createApp(App, { initialSession });
  app.mount(root);
  return () => app.unmount();
}
