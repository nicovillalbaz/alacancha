import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { createPool } from '../packages/db/src/index.ts';
import { hashPassword } from '../apps/api/src/security.ts';

if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URL?.endsWith('/torneos_prod')) throw new Error('Entorno de producción inesperado.');
const username = process.argv[2];
if (!username || !/^[a-zA-Z0-9._-]{3,40}$/.test(username)) throw new Error('Usuario inválido.');
const secretPath = '/srv/torneos/first-login.txt';
const pool = createPool(process.env.DATABASE_URL);
try {
  const { rows: [{ count }] } = await pool.query('SELECT count(*)::int AS count FROM users');
  if (count !== 0) throw new Error('La base ya tiene usuarios. Alta automática cancelada.');
  const password = randomBytes(24).toString('base64url');
  const encoded = await hashPassword(password);
  writeFileSync(secretPath, `Usuario: ${username}\nContraseña temporal: ${password}\n`, { flag: 'wx', mode: 0o600 });
  try {
    await pool.query('INSERT INTO users(id, username, display_name, password_hash, platform_admin) VALUES($1,$2,$3,$4,true)', [randomUUID(), username, 'Superadministrador', encoded]);
  } catch (error) {
    unlinkSync(secretPath);
    throw error;
  }
  console.log('Superadministrador creado. La clave temporal quedó en un archivo local solo para root.');
} finally {
  await pool.end();
}
