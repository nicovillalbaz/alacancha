import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPool, type DatabasePool } from './index.ts';

export async function migrate(pool: DatabasePool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(78124511)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = new URL('../migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()) {
      const source = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const existing = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (existing.rowCount) { if (existing.rows[0].checksum !== checksum) throw new Error(`La migración aplicada ${name} cambió.`); continue; }
      await client.query('BEGIN');
      try { await client.query(source); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]); await client.query('COMMIT'); }
      catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.query('SELECT pg_advisory_unlock(78124511)'); client.release(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio.');
  const pool = createPool(process.env.DATABASE_URL);
  try { await migrate(pool); console.log('Migraciones al día.'); } finally { await pool.end(); }
}
