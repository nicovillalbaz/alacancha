import type { DatabasePool } from '@torneos/db';

/** Consume eventos de publicaciones persistidas; el portal lee sus snapshots de PostgreSQL. */
export async function processFixtureOutbox(pool: DatabasePool, limit = 100): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Límite de outbox inválido.');
  const { rowCount } = await pool.query(`WITH pending AS (
    SELECT outbox.id FROM fixture_outbox outbox
    JOIN matchday_publications publication ON publication.id=outbox.publication_id AND publication.organization_id=outbox.organization_id
    WHERE outbox.delivered_at IS NULL
    ORDER BY outbox.created_at,outbox.id LIMIT $1
    FOR UPDATE OF outbox SKIP LOCKED
  )
  UPDATE fixture_outbox outbox SET delivered_at=now()
  FROM pending WHERE outbox.id=pending.id RETURNING outbox.id`, [limit]);
  return rowCount || 0;
}
