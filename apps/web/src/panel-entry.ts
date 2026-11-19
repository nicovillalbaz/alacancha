import { createApp } from 'vue';
import App from './App.vue';
import type { FixtureStart } from './fixture-start.ts';

export function mount(root: Element, fixtureStart?: FixtureStart) {
  const app = createApp(App, { fixtureStart });
  app.mount(root);
  return () => app.unmount();
}
