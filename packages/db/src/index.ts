import pg, { type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
export const createPool = (connectionString: string) => new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
export type DatabasePool = ReturnType<typeof createPool>;
export async function transaction<T>(pool: DatabasePool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function audit(client: Pick<PoolClient, 'query'>, actor: string, organization: string | null, action: string, resource: string, reason: string, before: unknown = null, after: unknown = null) {
  await client.query('INSERT INTO audit_logs(id,actor_id,organization_id,action,resource_id,reason,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), actor, organization, action, resource, reason, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]);
}
