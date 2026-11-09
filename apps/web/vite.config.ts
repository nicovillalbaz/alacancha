import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
const proxy = { '/api': 'http://127.0.0.1:4312', '/health': 'http://127.0.0.1:4312', '/ready': 'http://127.0.0.1:4312' };
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)), plugins: [vue()],
  server: { port: 4311, strictPort: true, host: '127.0.0.1', proxy },
  preview: { port: 4311, strictPort: true, host: '127.0.0.1', proxy },
  build: { outDir: 'dist', emptyOutDir: false },
});
