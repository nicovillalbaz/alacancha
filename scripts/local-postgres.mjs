import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { projectRoot, loadLocalEnv } from './local-env.mjs';

loadLocalEnv();
if (process.env.NODE_ENV !== 'development') throw new Error('Este script solo opera en desarrollo.');
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.port !== '55461' || url.pathname !== '/torneos_local' || url.username !== 'torneos_owner') throw new Error('La instancia local debe usar el ámbito exclusivo de este proyecto.');
const bin = process.env.PG_BIN;
const local = resolve(projectRoot, '.local');
const data = resolve(local, 'postgres');
const rel = relative(projectRoot, data);
if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Directorio fuera del proyecto.');
const executable = (name) => resolve(bin, process.platform === 'win32' ? `${name}.exe` : name);
const run = (name, args, options = {}) => execFileSync(executable(name), args, { cwd: projectRoot, windowsHide: true, timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
const command = process.argv[2] || 'start';
mkdirSync(local, { recursive: true });
if (command === 'stop') {
  if (existsSync(resolve(data, 'PG_VERSION'))) {
    let stopped = false;
    try { run('pg_ctl', ['-D', data, 'status']); }
    catch (error) {
      if (error.status !== 3) throw error;
      stopped = true;
    }
    if (stopped) console.log('La instancia de torneos no estaba ejecutándose.');
    else {
      run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
      console.log('Instancia de torneos detenida.');
    }
  }
  process.exit(0);
}
if (command !== 'start') throw new Error('Usar start o stop.');
if (!existsSync(executable('postgres'))) throw new Error('No se encontró PostgreSQL nativo. Configurá PG_BIN en .env.');
if (!existsSync(resolve(data, 'PG_VERSION'))) {
  const passwordFile = resolve(local, 'initdb-password');
  writeFileSync(passwordFile, decodeURIComponent(url.password), { mode: 0o600 });
  try { run('initdb', ['-D', data, '--encoding=UTF8', '--locale=C', '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--username=torneos_owner', `--pwfile=${passwordFile}`], { stdio: 'ignore' }); }
  finally { unlinkSync(passwordFile); }
}
let running = false;
try { run('pg_ctl', ['-D', data, 'status']); running = true; } catch { /* La instancia puede estar apagada. */ }
if (!running) run('pg_ctl', ['-D', data, '-l', resolve(local, 'postgres.log'), '-o', '-h 127.0.0.1 -p 55461', '-w', '-t', '600', 'start'], { stdio: 'ignore', timeout: 610000 });
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password), PGHOST: url.hostname, PGPORT: url.port, PGUSER: url.username, PGCONNECT_TIMEOUT: '5' };
let ready = false;
for(let attempt=0;attempt<600;attempt++){
  try{run('pg_isready',['-h',url.hostname,'-p',url.port],{env});ready=true;break;}
  catch{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000);}
}
if(!ready)throw new Error('PostgreSQL propio sigue recuperándose; revisá .local/postgres.log y reintentá.');
for (const name of ['torneos_local', 'torneos_test']) {
  const result = run('psql', ['--no-password', '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${name}'`], { env }).toString().trim();
  if (result !== '1') run('createdb', ['--encoding=UTF8', '--template=template0', name], { env });
}
mkdirSync(resolve(local, 'media'), { recursive: true });
console.log('PostgreSQL propio disponible en 127.0.0.1:55461. Bases local y test listas.');
