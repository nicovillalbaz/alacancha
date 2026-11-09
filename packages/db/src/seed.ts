import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../../../apps/api/src/security.ts';
import { createPool, transaction, type DatabasePool } from './index.ts';

export const demoPassword = 'TorneoDemo!2026';
export const seedIds = { a: '10000000-0000-4000-8000-000000000001', b: '10000000-0000-4000-8000-000000000002' };
export async function seed(pool: DatabasePool, connectionString: string) {
  const url = new URL(connectionString);
  if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || !['/torneos_local', '/torneos_test'].includes(url.pathname)) throw new Error('Los datos de muestra solo se permiten en las bases locales nombradas.');
  const encoded = await hashPassword(demoPassword);
  await transaction(pool, async (client) => {
    await client.query("INSERT INTO organizations(id,name,status) VALUES($1,'Liga de la Comunidad','active'),($2,'Liga del Río','active') ON CONFLICT DO NOTHING", [seedIds.a, seedIds.b]);
    const profiles = [
      { username: 'superadmin@ejemplo.test', name: 'Administración de muestra', owner: true, org: null, status: 'active', role: 'tournament_admin' },
      { username: 'ana@ejemplo.test', name: 'Ana Martínez', owner: false, org: seedIds.a, status: 'active', role: 'tournament_admin' },
      { username: 'carlos@ejemplo.test', name: 'Carlos Benítez', owner: false, org: seedIds.b, status: 'pending', role: 'tournament_admin' },
      { username: 'equipo@ejemplo.test', name: 'Julián Torres', owner: false, org: seedIds.a, status: 'active', role: 'team_admin' },
      { username: 'multiple@ejemplo.test', name: 'Cuenta con dos organizaciones', owner: false, org: seedIds.a, status: 'active', role: 'tournament_admin' },
    ];
    for (const profile of profiles) {
      await client.query('INSERT INTO users(id,username,display_name,password_hash,platform_admin) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [randomUUID(), profile.username, profile.name, encoded, profile.owner]);
      if (profile.org) {
        const { rows: [user] } = await client.query('SELECT id FROM users WHERE username=$1', [profile.username]);
        await client.query('INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [randomUUID(), profile.org, user.id, profile.role, profile.status]);
        if (profile.username.startsWith('multiple')) await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'tournament_admin','active') ON CONFLICT DO NOTHING", [randomUUID(), seedIds.b, user.id]);
      }
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL!;
  const pool = createPool(url);
  try { await seed(pool, url); console.log('Datos ficticios preparados; los existentes se conservaron. Accesos en docs/runbooks/desarrollo-local.md.'); } finally { await pool.end(); }
}
