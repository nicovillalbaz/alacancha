import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { projectRoot } from './local-env.mjs';
const bundled = process.env.USERPROFILE ? resolve(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe') : '';
const node = Number(process.versions.node.split('.')[0]) >= 24 ? process.execPath : bundled;
if (!node || !existsSync(node)) throw new Error('Se necesita Node 24 o superior. Instalalo o usá el runtime local disponible.');
const mode = process.argv[2];
const ts = (file) => ['--env-file=.env', '--import', 'tsx', file];
const commands = {
  migrate: ts('packages/db/src/migrate.ts'), seed: ts('packages/db/src/seed.ts'),
  'seed-ready': ts('scripts/seed-ready-tournament.ts'),
  'seed-journeys': ts('scripts/seed-demo-journeys.ts'),
  'seed-finished': ts('scripts/seed-finished-cups.ts'),
  'load-fcfs-draft': ts('scripts/load-fcfs-draft.ts'),
  'load-fcfs-shields': ts('scripts/load-fcfs-shields.ts'),
  'verify-finished': ts('scripts/verify-finished-cups.ts'),
  api: ts('apps/api/src/server.ts'), web: ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1'],
  'preview-pwa': ['node_modules/vite/bin/vite.js','preview','--config','apps/web/vite.config.ts','--host','127.0.0.1'],
  test: ['--env-file=.env', '--import', 'tsx', '--test', '--test-concurrency=1', ...process.argv.slice(3), 'tests/integration/access.test.ts', 'tests/backup-bundle.test.ts', 'tests/pwa.test.ts', 'tests/offline-events.test.ts', 'tests/position-competition.test.ts'],
  backup: ts('scripts/backup.ts'), 'restore-check': ts('scripts/restore-check.ts'), 'perf-check': ts('scripts/perf-check.ts'), 'perf-load': ts('scripts/perf-check.ts'), 'ops-check': ts('scripts/ops-check.ts'), worker: ts('apps/worker/src/index.ts'),
  'perf-scenario': ts('scripts/perf-scenario.ts'),
  'audit-routes': ts('scripts/audit-routes.ts'),
  'worker-loop': ts('apps/worker/src/loop.ts'),
};
function run(args) {
  const child = spawnSync(node, args, { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
  if (child.status !== 0) process.exit(child.status || 1);
}
if (mode === 'typecheck' || mode === 'build') {
  run(['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.server.json']);
  run(['node_modules/vue-tsc/bin/vue-tsc.js', '--noEmit', '-p', 'apps/web/tsconfig.json']);
  if (mode === 'build') run(['node_modules/vite/bin/vite.js', 'build', '--config', 'apps/web/vite.config.ts']);
} else if (mode === 'dev') {
  run(['scripts/local-postgres.mjs', 'start']);
  const children = [commands.api, commands.web,commands['worker-loop']].map((args) => spawn(node, args, { cwd: projectRoot, stdio: 'inherit', windowsHide: true }));
  const stop = () => children.forEach((child) => child.kill());
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  children.forEach((child) => child.on('exit', (code) => { stop(); process.exitCode = code || 0; }));
} else if (Object.hasOwn(commands, mode)) {if(mode==='perf-load'){process.env.PERF_REQUESTS='200';process.env.PERF_CONCURRENCY='8';}run(commands[mode]);}
else throw new Error('Comando local desconocido.');
