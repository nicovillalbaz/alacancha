import { parseArgs } from 'node:util';
import { createPool, transaction } from '@torneos/db';
import { includeQuickPlayers } from '../apps/api/src/quick-good-faith.ts';
import { projectMatchJournal, type MatchJournalEvent } from '@torneos/shared';

const { values } = parseArgs({ options: {
  tournament: { type: 'string' },
  apply: { type: 'boolean' },
  expected: { type: 'string' },
} });
const slug = values.tournament;
const databaseUrl = process.env.DATABASE_URL;
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !databaseUrl) {
  throw new Error('Indicá DATABASE_URL y un alias con --tournament.');
}
if (values.apply && !/^\d+$/.test(values.expected ?? '')) {
  throw new Error('Indicá con --expected el conteo que verificaste en el ensayo.');
}

const pool = createPool(databaseUrl);
try {
  const report = await transaction(pool, async client => {
    if (!values.apply) await client.query('SET TRANSACTION READ ONLY');
    const { rows: cups } = await client.query<{ id: string; organization_id: string; actor: string }>(`SELECT t.id,t.organization_id,
      (SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id AND u.disabled_at IS NULL
        WHERE m.organization_id=t.organization_id AND m.status='active' AND m.role='tournament_admin' ORDER BY m.id LIMIT 1) actor
      FROM tournaments t WHERE t.public_slug=$1`, [slug]);
    if (cups.length !== 1 || !cups[0].actor) throw new Error('El torneo debe tener un alias único y un organizador activo.');
    const cup = cups[0];
    if (values.apply) await client.query(`SELECT e.id FROM team_entries e JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      WHERE e.organization_id=$1 AND ed.tournament_id=$2 ORDER BY e.id FOR UPDATE OF e`, [cup.organization_id, cup.id]);

    const { rows } = await client.query<{
      registration_id: string; entry_id: string; home_entry_id: string; away_entry_id: string; event_id: string; events: MatchJournalEvent[];
    }>(`SELECT pr.id registration_id,pr.entry_id,m.home_entry_id,m.away_entry_id,original.id event_id,official.snapshot->'events' events
      FROM audit_logs a JOIN player_registrations pr ON pr.id=a.resource_id AND pr.organization_id=a.organization_id
      JOIN draft_matches m ON m.id::text=a.after_data->>'matchId' AND m.organization_id=a.organization_id
        AND pr.entry_id IN (m.home_entry_id,m.away_entry_id) AND m.archived_at IS NULL
      JOIN matchdays md ON md.id=m.matchday_id AND md.organization_id=m.organization_id AND md.status='published' AND md.archived_at IS NULL
      JOIN categories c ON c.id=m.category_id AND c.organization_id=m.organization_id
      JOIN editions e ON e.id=c.edition_id AND e.organization_id=c.organization_id
      JOIN match_records r ON r.match_id=m.id AND r.organization_id=m.organization_id AND r.status='official'
      JOIN match_acta_snapshots official ON official.id=r.approval_id AND official.organization_id=r.organization_id AND official.kind='approved'
      JOIN match_record_events original ON original.organization_id=m.organization_id AND original.match_id=m.id
        AND original.client_event_id=pr.id AND original.registration_id=pr.id AND original.team_entry_id=pr.entry_id
      LEFT JOIN LATERAL (SELECT snapshot FROM good_faith_versions gf WHERE gf.organization_id=pr.organization_id AND gf.entry_id=pr.entry_id AND gf.status='approved'
        ORDER BY gf.version DESC LIMIT 1) roster ON true
      WHERE a.organization_id=$1 AND e.tournament_id=$2 AND a.action='match.quick_player_created' AND a.after_data->>'entryId'=pr.entry_id::text
        AND pr.status='approved' AND pr.reverted_at IS NULL
        AND NOT coalesce(roster.snapshot @> jsonb_build_array(jsonb_build_object('registrationId',pr.id)),false)
      ORDER BY pr.entry_id,pr.id`, [cup.organization_id, cup.id]);
    const missing = new Map<string, Set<string>>();
    for (const item of rows) {
      const event = projectMatchJournal(item.events, item.home_entry_id, item.away_entry_id).active
        .some(event => event.id === item.event_id && event.registrationId === item.registration_id && event.teamEntryId === item.entry_id);
      if (!event) continue;
      if (!missing.has(item.entry_id)) missing.set(item.entry_id, new Set());
      missing.get(item.entry_id)!.add(item.registration_id);
    }
    const registrations = [...missing.values()].reduce((total, ids) => total + ids.size, 0);
    if (values.apply && registrations !== Number(values.expected)) throw new Error('El conteo cambió desde el ensayo. Revisá antes de aplicar.');
    if (values.apply) {
      for (const [entry, ids] of missing) {
        if (!await includeQuickPlayers(client, cup.organization_id, entry, [...ids], cup.actor, 'Conciliación de altas aprobadas con evento vigente del acta oficial'))
          throw new Error('La lista cambió durante la corrección.');
      }
    }
    return { tournament: slug, applied: Boolean(values.apply), entries: missing.size, registrations };
  });
  console.log(JSON.stringify(report));
} finally {
  await pool.end();
}
