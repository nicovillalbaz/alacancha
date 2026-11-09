import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectRoot } from './local-env.mjs';

mkdirSync(resolve(projectRoot, '.local'), { recursive: true });
if (!existsSync(resolve(projectRoot, '.env'))) {
  const password = randomBytes(32).toString('hex');
  const lines = [
    'NODE_ENV=development', 'API_HOST=127.0.0.1', 'API_PORT=4312', 'WEB_ORIGIN=http://127.0.0.1:4311',
    `DATABASE_URL=postgresql://torneos_owner:${password}@127.0.0.1:55461/torneos_local`,
    `TEST_DATABASE_URL=postgresql://torneos_owner:${password}@127.0.0.1:55461/torneos_test`,
    `APP_SECRET=${randomBytes(32).toString('hex')}`, `BACKUP_KEY=${randomBytes(32).toString('hex')}`,
    'PG_BIN=C:/Program Files/PostgreSQL/16/bin', 'MEDIA_DIR=.local/media', '',
  ];
  writeFileSync(resolve(projectRoot, '.env'), lines.join('\n'), { flag: 'wx', mode: 0o600 });
}
const result = spawnSync(process.execPath, [resolve(projectRoot, 'scripts/local-postgres.mjs'), 'start'], { cwd: projectRoot, stdio: 'inherit', windowsHide: true });
if (result.status !== 0) process.exit(result.status || 1);
console.log('Entorno local preparado. Siguiente: npm run db:migrate y npm run db:seed.');
