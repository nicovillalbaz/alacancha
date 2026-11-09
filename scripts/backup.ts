import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createPool, type DatabasePool } from '@torneos/db';
import type { PoolClient } from 'pg';
import { encryptBundle, fileDigest, type BundleManifest } from './backup-bundle.ts';

const exec = promisify(execFile);
const header = Buffer.from('TORNEOS-BACKUP-1\n');
export interface Snapshot { [table: string]: { rows: number; checksum: string } }
export interface Archive { version: 1 | 2; createdAt: string; snapshot: Snapshot; dump: string; files: { filename: string; checksum: string; bytes: string }[] }
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const validFilename = (filename: string) => /^(?:[0-9a-f-]+\.(?:png|jpg|webp|pdf)|flyer-[0-9a-f-]+\.(?:png|jpg|pdf))$/.test(filename);
export function localConnection(connection: string) {
  const url = new URL(connection);
  if (url.hostname !== '127.0.0.1' || url.port !== '55461' || url.username !== 'torneos_owner') throw new Error('Esta herramienta solo opera sobre la instancia propia de desarrollo.');
  return { PGHOST: url.hostname, PGPORT: url.port, PGUSER: url.username, PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '5', database: url.pathname.slice(1) };
}
export async function pgTool(name: string, args: string[], connection: string) {
  const parameters = localConnection(connection);
  const path = resolve(process.env.PG_BIN!, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
  const result = await exec(path, args, { env: { ...process.env, ...parameters }, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'buffer', timeout: name === 'createdb' ? 60000 : 0 });
  return result.stdout;
}
export async function fingerprint(client: Pick<PoolClient, 'query'>, selectedTables?: string[]): Promise<Snapshot> {
  const tables = selectedTables ?? (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename as string);
  const result: Snapshot = {};
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('Nombre de tabla no admitido en respaldo.');
    await client.query(`DECLARE backup_fingerprint NO SCROLL CURSOR FOR SELECT to_jsonb(t) row FROM "${table}" t ORDER BY to_jsonb(t)::text`);
    const hash=createHash('sha256');hash.update('[');let count=0;
    try{for(;;){const {rows}=await client.query('FETCH FORWARD 500 FROM backup_fingerprint');if(!rows.length)break;for(const item of rows){if(count++)hash.update(',');hash.update(JSON.stringify(item.row));}}}
    finally{await client.query('CLOSE backup_fingerprint');}
    hash.update(']');result[table]={rows:count,checksum:hash.digest('hex')};
  }
  return result;
}
function backupKey(key: string) { if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('BACKUP_KEY debe tener 64 caracteres hexadecimales.'); return Buffer.from(key, 'hex'); }
export function decryptArchive(data: Buffer, key: string): Archive {
  if (!data.subarray(0, header.length).equals(header)) throw new Error('Formato de respaldo no admitido.');
  const offset = header.length;
  const decipher = createDecipheriv('aes-256-gcm', backupKey(key), data.subarray(offset, offset + 12));
  decipher.setAuthTag(data.subarray(offset + 12, offset + 28));
  const archive = JSON.parse(Buffer.concat([decipher.update(data.subarray(offset + 28)), decipher.final()]).toString('utf8')) as Archive;
  if (![1, 2].includes(archive.version) || !archive.snapshot || !Array.isArray(archive.files) || typeof archive.dump !== 'string') throw new Error('Respaldo incompleto.');
  for (const file of archive.files) if (!validFilename(file.filename) || sha(Buffer.from(file.bytes, 'base64')) !== file.checksum) throw new Error('Archivo de respaldo inválido.');
  return archive;
}
export async function createBackup(connection: string, mediaDirectory: string, key: string, outputDirectory = '.local/backups') {
  const parameters = localConnection(connection);
  if (!['torneos_local', 'torneos_test'].includes(parameters.database)) throw new Error('La fuente debe ser una base local autorizada.');
  backupKey(key);
  const pool = createPool(connection); const client = await pool.connect();
  const workDir=resolve(outputDirectory,`.working-${randomUUID()}`);
  try {
    await mkdir(workDir,{recursive:true});
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET TIME ZONE 'UTC'");
    const { rows: [exported] } = await client.query('SELECT pg_export_snapshot() snapshot');
    const dumpPath=resolve(workDir,'database.dump');
    await pgTool('pg_dump', ['--no-password', '--format=custom', '--no-owner', '--no-acl', `--snapshot=${exported.snapshot}`, '--dbname', parameters.database,'--file',dumpPath], connection);
    const dump=await fileDigest(dumpPath);
    const snapshot = await fingerprint(client);
    const { rows: media } = await client.query("SELECT filename,checksum FROM media UNION ALL SELECT filename,checksum FROM player_documents UNION ALL SELECT filename,checksum FROM flyer_exports WHERE status='ready' ORDER BY filename");
    const files: BundleManifest['files'] = [];
    const seen = new Set<string>();
    for (const file of media) {
      if (!validFilename(file.filename) || seen.has(file.filename)) throw new Error('Nombre de archivo de media inválido o duplicado.');
      seen.add(file.filename);
      const actual=await fileDigest(resolve(mediaDirectory,file.filename));
      if (actual.checksum !== file.checksum) throw new Error('Una imagen no coincide con su registro.');
      files.push({ filename: file.filename, checksum: file.checksum, size: actual.size });
    }
    const archive: BundleManifest = { version: 3, createdAt: new Date().toISOString(), snapshot, dump, files };
    await mkdir(outputDirectory, { recursive: true });
    const path = resolve(outputDirectory, `torneos-${Date.now()}-${randomUUID().slice(0, 8)}.backup`);
    await encryptBundle(path,archive,dumpPath,mediaDirectory,key);
    await client.query('COMMIT'); return { path, snapshot, files: files.length };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await rm(workDir,{recursive:true,force:true});client.release(); await pool.end(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await createBackup(process.env.DATABASE_URL!, resolve(process.env.MEDIA_DIR || '.local/media'), process.env.BACKUP_KEY!, process.env.BACKUP_OUTPUT_DIR || '.local/backups');
  console.log(`Respaldo cifrado creado: ${result.path}`);
}
