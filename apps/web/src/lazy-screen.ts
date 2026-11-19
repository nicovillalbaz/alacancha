import { defineAsyncComponent,defineComponent,h } from 'vue';

const LoadingScreen = defineComponent(() => () => h('p', { class: 'small muted pad', role: 'status' }, 'Cargando…'));
const LoadError = defineComponent(() => () => h('div', { class: 'pad stack', role: 'alert' }, [
  h('p', 'No se pudo abrir esta vista.'),
  h('button', { class: 'btn', type: 'button', onClick: () => location.reload() }, 'Reintentar'),
]));
export const lazyScreen = (loader: () => Promise<{ default: import('vue').Component }>) => defineAsyncComponent({ loader, loadingComponent: LoadingScreen, errorComponent: LoadError, delay: 150 });
