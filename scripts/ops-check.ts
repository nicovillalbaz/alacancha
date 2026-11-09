import { readdir, stat, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '@torneos/db';
import { localConnection } from './backup.ts';

const connection = process.env.DATABASE_URL!;
const parameters = localConnection(connection);
if (!['torneos_local', 'torneos_test'].includes(parameters.database)) throw new Error('Comprobación limitada a bases locales del proyecto.');
const pool = createPool(connection);
const backupDir = resolve(process.env.BACKUP_OUTPUT_DIR || '.local/backups');
const mediaDir = resolve(process.env.MEDIA_DIR || '.local/media');
const alerts: string[] = [];
try {
  const { rows: [jobs] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM flyer_exports WHERE status='queued' AND created_at<now()-interval '10 minutes') old_flyers,
    (SELECT count(*)::int FROM flyer_exports WHERE status='failed') failed_flyers,
    (SELECT count(*)::int FROM fixture_outbox WHERE delivered_at IS NULL AND created_at<now()-interval '10 minutes') old_fixture_outbox`);
  if (jobs.old_flyers) alerts.push(`${jobs.old_flyers} flyers en cola desde hace más de 10 minutos`);
  if (jobs.failed_flyers) alerts.push(`${jobs.failed_flyers} flyers fallidos acumulados`);
  if (jobs.old_fixture_outbox) alerts.push(`${jobs.old_fixture_outbox} publicaciones sin difundir desde hace más de 10 minutos`);
  let newestBackupHours: number | null = null;
  try {
    const files = (await readdir(backupDir)).filter((name) => /^torneos-\d+-[0-9a-f]{8}\.backup$/.test(name));
    const dates = await Promise.all(files.map(async (name) => (await stat(resolve(backupDir, name))).mtimeMs));
    if (dates.length) newestBackupHours = Math.round((Date.now() - Math.max(...dates)) / 36000) / 100;
  } catch { /* La ausencia del directorio se comunica como alerta. */ }
  if (newestBackupHours === null || newestBackupHours > 24) alerts.push('No hay un respaldo local reciente (<24 h)');
  let freeMediaGiB: number | null = null;
  try {
    const disk = await statfs(mediaDir);
    freeMediaGiB = Math.round(disk.bavail * disk.bsize / 2 ** 30 * 100) / 100;
    if (freeMediaGiB < 2) alerts.push('Quedan menos de 2 GiB libres para archivos');
  } catch { alerts.push('No se pudo medir el disco de archivos'); }
  const report = { at: new Date().toISOString(), database: parameters.database, jobs, newestBackupHours, freeMediaGiB, alerts, status: alerts.length ? 'attention' : 'ok' };
  console.log(JSON.stringify(report));
  if (alerts.length) process.exitCode = 2;
} finally { await pool.end(); }
