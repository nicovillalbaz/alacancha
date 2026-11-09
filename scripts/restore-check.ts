import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createPool } from '@torneos/db';
import { createBackup, decryptArchive, fingerprint, localConnection, pgTool } from './backup.ts';
import { extractBundle, fileDigest, isBundleV3 } from './backup-bundle.ts';

const started = Date.now();
const source = process.env.TEST_DATABASE_URL!;
if (new URL(source).pathname !== '/torneos_test' || process.env.NODE_ENV === 'production') throw new Error('El ensayo solo usa datos sintéticos de torneos_test.');
const parameters = localConnection(source);
const probe = createPool(source);
try { await probe.query('SELECT 1'); } finally { await probe.end(); }
const archivePath = process.env.BACKUP_FILE ? resolve(process.env.BACKUP_FILE) : (await createBackup(source, resolve('.local/test-media'), process.env.BACKUP_KEY!)).path;
const destination = `torneos_restore_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}_${randomUUID().slice(0, 8)}`;
if (!/^torneos_restore_\d{8}_[a-f0-9]{8}$/.test(destination)) throw new Error('Nombre de destino no autorizado.');
const area = resolve('.local/restore', destination);
await mkdir(resolve('.local/restore'), { recursive: true });
await mkdir(area, { recursive: false });
const dumpPath = resolve(area, 'database.dump');
const modern=await isBundleV3(archivePath);
const bundle=modern?await extractBundle(archivePath,area,process.env.BACKUP_KEY!):null;
const legacy=modern?null:decryptArchive(await readFile(archivePath),process.env.BACKUP_KEY!);
const snapshot=bundle?.snapshot||legacy!.snapshot;
const files=bundle?.files||legacy!.files;
if(legacy){
  await writeFile(dumpPath,Buffer.from(legacy.dump,'base64'),{flag:'wx',mode:0o600});
  await mkdir(resolve(area,'media'));
  for(const file of legacy.files)await writeFile(resolve(area,'media',file.filename),Buffer.from(file.bytes,'base64'),{flag:'wx'});
}
await pgTool('createdb', ['--no-password', '--template=template0', '--encoding=UTF8', destination], source);
await pgTool('pg_restore', ['--no-password', '--exit-on-error', '--no-owner', '--no-acl', '--dbname', destination, dumpPath], source);
const targetUrl = new URL(source); targetUrl.pathname = `/${destination}`;
const pool = createPool(targetUrl.toString());
try {
  const client=await pool.connect();let restored;
  try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET TIME ZONE 'UTC'");restored=await fingerprint(client,legacy?.version===1?Object.keys(snapshot):undefined);await client.query('COMMIT');}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  assert.deepEqual(restored, snapshot);
  if (!legacy || legacy.version === 2) {
    const { rows: referenced } = await pool.query("SELECT filename,checksum FROM media UNION ALL SELECT filename,checksum FROM player_documents UNION ALL SELECT filename,checksum FROM flyer_exports WHERE status='ready'");
    assert.deepEqual(new Map(files.map((file) => [file.filename, file.checksum])), new Map(referenced.map((file) => [file.filename, file.checksum])));
  }
  for(const file of files)assert.equal((await fileDigest(resolve(area,'media',file.filename))).checksum,file.checksum);
  const report = { source: process.env.BACKUP_FILE ? 'archivo-cifrado-proporcionado' : parameters.database, archiveVersion: bundle?.version||legacy!.version, destination, files: files.length, sameRowsAndChecksums: true, durationMs: Date.now() - started, tables: restored };
  await writeFile('.local/restore-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ destination, tables: Object.keys(restored).length, files: report.files, sameRowsAndChecksums: true, durationMs: report.durationMs }));
} finally { await pool.end(); }
