import { createPool } from '@torneos/db';
import { resolve } from 'node:path';
import { processFlyerJobs } from './flyers.ts';
import { processFixtureOutbox } from './fixture-outbox.ts';
const pool = createPool(process.env.DATABASE_URL!);
try {
  const sessions = await pool.query('UPDATE sessions SET revoked_at=now() WHERE revoked_at IS NULL AND expires_at<=now()');
  const invitations = await pool.query('UPDATE invitations SET revoked_at=now() WHERE revoked_at IS NULL AND used_at IS NULL AND expires_at<=now()');
  const fixtureEventsProcessed=await processFixtureOutbox(pool);
  const flyersProcessed=await processFlyerJobs(pool,resolve(process.env.MEDIA_DIR||'.local/media'),10);
  console.log(JSON.stringify({ expiredSessionsMarked: sessions.rowCount, expiredInvitationsMarked: invitations.rowCount,fixtureEventsProcessed,flyersProcessed }));
} finally { await pool.end(); }
