import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { audit, transaction, type DatabasePool } from '@torneos/db';
import { projectMatchJournal, ruleSchema, type MatchJournalEvent } from '@torneos/shared';
import { disciplineDecisionPdf } from './discipline-pdf.ts';

type Actor = { user_id: string; platform_admin: boolean };
type Access = (request: FastifyRequest, organizationId: string, write?: boolean) => Promise<Actor>;
type TeamAccess = (request: FastifyRequest, organizationId: string, entryId: string) => Promise<Actor>;
type Reject = (status: number, code: string, message: string) => never;
const reason = z.string().trim().min(3).max(1000);
const date = z.iso.date();

export async function recordSuspensionService(client: PoolClient, organizationId: string, matchId: string | null = null, decisionId: string | null = null) {
  await client.query(`INSERT INTO suspension_service_history(id,organization_id,decision_id,match_id,approval_id,match_date)
    SELECT gen_random_uuid(),eligible.organization_id,eligible.decision_id,eligible.match_id,eligible.approval_id,eligible.match_date FROM (
    SELECT d.organization_id,d.id decision_id,d.suspension_matches,m.id match_id,r.approval_id,m.match_date,
      row_number() OVER (PARTITION BY d.id ORDER BY m.match_date,m.id) service_no
    FROM discipline_decisions d JOIN discipline_cases c ON c.organization_id=d.organization_id AND c.id=d.case_id
    JOIN draft_matches m ON m.organization_id=c.organization_id AND (m.home_entry_id=c.entry_id OR m.away_entry_id=c.entry_id)
    JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id AND r.approval_id IS NOT NULL
    JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id AND md.status='published'
    LEFT JOIN lineup_versions l ON l.organization_id=r.organization_id AND l.id=CASE WHEN m.home_entry_id=c.entry_id THEN r.home_lineup_id ELSE r.away_lineup_id END
    JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id
    WHERE d.organization_id=$1 AND d.suspension_unit='matches' AND d.status='active'
      AND ($3::uuid IS NULL OR d.id=$3)
      AND m.match_date>=d.starts_on AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(l.snapshot->'players',a.snapshot->'events','[]'::jsonb)) p WHERE p->>'registrationId'=c.registration_id::text)
    ) eligible WHERE eligible.service_no<=eligible.suspension_matches AND ($2::uuid IS NULL OR eligible.match_id=$2)
    ON CONFLICT (organization_id,decision_id,match_id,approval_id) DO NOTHING`,[organizationId,matchId,decisionId]);
}

export async function activeSuspensionReasons(pool: DatabasePool, organizationId: string, entryId: string, registrationId: string, asOf: string) {
  const { rows } = await pool.query(`SELECT d.id,d.suspension_unit,d.suspension_matches,to_char(d.starts_on,'YYYY-MM-DD') starts_on,to_char(d.ends_on,'YYYY-MM-DD') ends_on
    FROM discipline_decisions d JOIN discipline_cases c ON c.organization_id=d.organization_id AND c.id=d.case_id
    WHERE d.organization_id=$1 AND c.entry_id=$2 AND c.registration_id=$3 AND d.status='active' AND d.suspension_unit IS NOT NULL`, [organizationId, entryId, registrationId]);
  const blocked: string[] = [];
  for (const decision of rows) {
    if (asOf < decision.starts_on) continue;
    if (decision.suspension_unit === 'date_range') {
      if (asOf <= decision.ends_on) blocked.push(`Suspensión vigente hasta ${decision.ends_on}.`);
      continue;
    }
    const { rows: [served] } = await pool.query(`SELECT count(*)::int total FROM draft_matches m
      JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id AND r.approval_id IS NOT NULL
      JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id AND md.status='published'
      LEFT JOIN lineup_versions l ON l.organization_id=r.organization_id AND l.id=CASE WHEN m.home_entry_id=$2 THEN r.home_lineup_id ELSE r.away_lineup_id END
      JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id
      WHERE m.organization_id=$1 AND (m.home_entry_id=$2 OR m.away_entry_id=$2)
        AND m.match_date >= $4::date AND m.match_date < $5::date
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(l.snapshot->'players',a.snapshot->'events','[]'::jsonb)) p WHERE p->>'registrationId'=$3)`, [organizationId, entryId, registrationId, decision.starts_on, asOf]);
    const remaining = decision.suspension_matches - served.total;
    if (remaining > 0) blocked.push(`Suspensión vigente: faltan ${remaining} ${remaining === 1 ? 'partido' : 'partidos'} oficial${remaining === 1 ? '' : 'es'}.`);
  }
  return blocked;
}

export function registerDisciplineRoutes(app: FastifyInstance, pool: DatabasePool, organizationAccess: Access, teamAccess: TeamAccess, fail: Reject, uuid: (value: unknown) => string) {
  const root = '/api/v1/organizations/:id';
  const organizer = async (request: FastifyRequest, organizationId: string) => {
    const actor = await organizationAccess(request, organizationId, true);
    if (actor.platform_admin) fail(403, 'ORGANIZER_REQUIRED', 'La disciplina corresponde al organizador.');
    return actor;
  };
  const caseRow = async (organizationId: string, caseId: string) => {
    const { rows: [row] } = await pool.query(`SELECT c.*,t.name team_name,p.given_names,p.family_names,d.id decision_id,d.status decision_status,d.suspension_unit,d.suspension_matches,
      to_char(d.starts_on,'YYYY-MM-DD') starts_on,to_char(d.ends_on,'YYYY-MM-DD') ends_on,d.fine_catalog_id,d.fine_amount_guaranies,d.reason decision_reason,d.decided_at,d.revoke_reason,d.revoked_at
      FROM discipline_cases c JOIN team_entries e ON e.organization_id=c.organization_id AND e.id=c.entry_id JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
      LEFT JOIN player_registrations pr ON pr.organization_id=c.organization_id AND pr.id=c.registration_id
      LEFT JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
      LEFT JOIN discipline_decisions d ON d.organization_id=c.organization_id AND d.case_id=c.id
      WHERE c.organization_id=$1 AND c.id=$2`, [organizationId, caseId]);
    if (!row) fail(404, 'CASE_NOT_FOUND', 'No se encontró el expediente.');
    return { ...row, player_name: row.given_names ? `${row.given_names} ${row.family_names}` : null, given_names: undefined, family_names: undefined };
  };
  const action = async (client: PoolClient, organizationId: string, caseId: string, kind: string, text: string, actorId: string, detail: object = {}) => {
    await client.query('INSERT INTO discipline_case_actions(id,organization_id,case_id,kind,reason,detail,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), organizationId, caseId, kind, text, JSON.stringify(detail), actorId]);
  };
  app.post(`${root}/categories/:categoryId/discipline/proposals/rebuild`, async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizer(request, organizationId);
    const { rows: [ruleRow] } = await pool.query(`SELECT rv.rules FROM rule_versions rv
      LEFT JOIN fixture_phases fp ON fp.organization_id=rv.organization_id AND fp.category_id=rv.category_id
      WHERE rv.organization_id=$1 AND rv.category_id=$2 AND rv.status='published' AND rv.version=coalesce(fp.rule_version,(SELECT max(version) FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published'))`, [organizationId, category]);
    if (!ruleRow) fail(409, 'RULES_NOT_PUBLISHED', 'Publicá primero el reglamento de la categoría.');
    const rules = ruleSchema.parse(ruleRow.rules), threshold = rules.advanced?.discipline.yellowAccumulation ?? null;
    const { rows: matches } = await pool.query(`SELECT m.id,m.home_entry_id,m.away_entry_id,to_char(m.match_date,'YYYY-MM-DD') match_date,a.snapshot
      FROM draft_matches m JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id AND r.approval_id IS NOT NULL
      JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id
      WHERE m.organization_id=$1 AND m.category_id=$2 ORDER BY m.match_date,m.id`, [organizationId, category]);
    type Proposal = { key: string; entryId: string; registrationId: string | null; matchId: string; eventId: string; kind: string; summary: string; evidence: string | null };
    const proposals: Proposal[] = [], yellowCounts = new Map<string, number>();
    for (const match of matches) {
      const events = projectMatchJournal(match.snapshot.events as MatchJournalEvent[], match.home_entry_id, match.away_entry_id).active;
      for (const event of events) {
        if (!event.teamEntryId) continue;
        if (['red','second_yellow','incident','custom_card'].includes(event.kind)) {
          const card = event.kind === 'custom_card' ? rules.advanced?.discipline.customCards?.find(item => item.code === event.cardCode) : null;
          const summary = event.kind === 'red' ? 'Tarjeta roja para revisión' : event.kind === 'second_yellow' ? 'Segunda amarilla para revisión' : event.kind === 'custom_card' ? `${card?.label || 'Tarjeta'} para revisión${card?.suspensionMatches ? ` · ${card.suspensionMatches} partido(s) sugerido(s)` : ''}` : 'Incidencia para revisión';
          proposals.push({ key: `event:${event.id}`, entryId: event.teamEntryId, registrationId: event.registrationId, matchId: match.id, eventId: event.id, kind: event.kind, summary, evidence: event.incidentNote });
        }
        if (threshold && event.registrationId && ['yellow','second_yellow'].includes(event.kind)) {
          const key = `${event.teamEntryId}:${event.registrationId}`, count = (yellowCounts.get(key) || 0) + 1;
          yellowCounts.set(key, count);
          if (count % threshold === 0) proposals.push({ key: `yellow:${event.registrationId}:${count}`, entryId: event.teamEntryId, registrationId: event.registrationId, matchId: match.id, eventId: event.id, kind: 'yellow_accumulation', summary: `${count} amarillas acumuladas para revisión`, evidence: null });
        }
      }
    }
    return transaction(pool, async client => {
      let created = 0;
      for (const proposal of proposals) {
        const caseId = randomUUID();
        const { rowCount } = await client.query(`INSERT INTO discipline_cases(id,organization_id,category_id,entry_id,registration_id,match_id,event_id,source_key,source_kind,summary,evidence_note,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(organization_id,source_key) DO NOTHING`, [caseId, organizationId, category, proposal.entryId, proposal.registrationId, proposal.matchId, proposal.eventId, proposal.key, proposal.kind, proposal.summary, proposal.evidence, actor.user_id]);
        if (rowCount) { created++; await action(client, organizationId, caseId, 'proposed', proposal.summary, actor.user_id, { matchId: proposal.matchId, eventId: proposal.eventId }); }
        else await client.query('UPDATE discipline_cases SET source_valid=true WHERE organization_id=$1 AND source_key=$2', [organizationId, proposal.key]);
      }
      const { rowCount: invalidated } = await client.query(`UPDATE discipline_cases SET source_valid=false WHERE organization_id=$1 AND category_id=$2 AND source_kind<>'manual' AND source_valid AND NOT(source_key=ANY($3::text[]))`, [organizationId, category, proposals.map(item => item.key)]);
      await audit(client, actor.user_id, organizationId, 'discipline.proposals_rebuilt', category, 'Reconstrucción desde actas oficiales', null, { created, invalidated });
      return { created, invalidated, proposals: proposals.length };
    });
  });
  app.post(`${root}/categories/:categoryId/discipline/cases`, async (request, reply) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizer(request, organizationId);
    const input = z.object({ entryId: z.uuid(), registrationId: z.uuid().nullable(), summary: z.string().trim().min(3).max(500), evidenceNote: z.string().trim().min(3).max(1000).nullable() }).strict().parse(request.body);
    const { rows: [entry] } = await pool.query('SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND id=$3', [organizationId, category, input.entryId]);
    if (!entry) fail(404, 'ENTRY_NOT_FOUND', 'No se encontró el equipo de esta categoría.');
    if (input.registrationId && !(await pool.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3', [organizationId, input.entryId, input.registrationId])).rowCount) fail(404, 'PLAYER_NOT_FOUND', 'No se encontró el jugador de este equipo.');
    const caseId = randomUUID();
    await transaction(pool, async client => {
      await client.query('INSERT INTO discipline_cases(id,organization_id,category_id,entry_id,registration_id,source_key,source_kind,summary,evidence_note,created_by) VALUES($1,$2,$3,$4,$5,$6,\'manual\',$7,$8,$9)', [caseId, organizationId, category, input.entryId, input.registrationId, `manual:${caseId}`, input.summary, input.evidenceNote, actor.user_id]);
      await action(client, organizationId, caseId, 'proposed', input.summary, actor.user_id);
      await audit(client, actor.user_id, organizationId, 'discipline.case_created', caseId, input.summary, null, { entryId: input.entryId, registrationId: input.registrationId });
    });
    return reply.code(201).send(await caseRow(organizationId, caseId));
  });
  app.get(`${root}/categories/:categoryId/discipline/cases`, async request => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId); await organizer(request, organizationId);
    const { rows } = await pool.query('SELECT id FROM discipline_cases WHERE organization_id=$1 AND category_id=$2 ORDER BY created_at DESC,id DESC LIMIT 200', [organizationId, category]);
    return Promise.all(rows.map(row => caseRow(organizationId, row.id)));
  });
  app.get(`${root}/entries/:entryId/discipline`, async request => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId); await teamAccess(request, organizationId, entry);
    const { rows } = await pool.query('SELECT id FROM discipline_cases WHERE organization_id=$1 AND entry_id=$2 ORDER BY created_at DESC,id DESC LIMIT 200', [organizationId, entry]);
    const { rows: notices } = await pool.query('SELECT id,case_id,kind,created_at,read_at FROM discipline_notices WHERE organization_id=$1 AND entry_id=$2 ORDER BY created_at DESC LIMIT 100', [organizationId, entry]);
    return { cases: await Promise.all(rows.map(row => caseRow(organizationId, row.id))), notices };
  });
  app.get(`${root}/discipline/cases/:caseId`, async request => {
    const { id, caseId } = request.params as { id: string; caseId: string };
    const organizationId = uuid(id), caseIdValue = uuid(caseId), row = await caseRow(organizationId, caseIdValue);
    await teamAccess(request, organizationId, row.entry_id);
    const { rows: actions } = await pool.query('SELECT kind,reason,detail,created_at FROM discipline_case_actions WHERE organization_id=$1 AND case_id=$2 ORDER BY created_at,id', [organizationId, caseIdValue]);
    const { rows: serviceHistory } = await pool.query(`SELECT h.match_id,to_char(h.match_date,'YYYY-MM-DD') match_date,h.recorded_at,
      (r.approval_id=h.approval_id) current_approval FROM suspension_service_history h
      JOIN discipline_decisions d ON d.organization_id=h.organization_id AND d.id=h.decision_id
      JOIN match_records r ON r.organization_id=h.organization_id AND r.match_id=h.match_id
      WHERE h.organization_id=$1 AND d.case_id=$2 ORDER BY h.match_date,h.recorded_at`,[organizationId,caseIdValue]);
    return { ...row, actions, serviceHistory };
  });
  app.get(`${root}/discipline/cases/:caseId/resolution.pdf`, async (request, reply) => {
    const { id, caseId } = request.params as { id: string; caseId: string };
    const organizationId = uuid(id), target = uuid(caseId), row = await caseRow(organizationId, target);
    await teamAccess(request, organizationId, row.entry_id);
    if (!row.decision_id) fail(404, 'DECISION_NOT_FOUND', 'Este expediente aún no tiene resolución.');
    const suspension = row.suspension_unit === 'matches' ? `${row.suspension_matches} ${row.suspension_matches===1?'partido':'partidos'} desde ${row.starts_on}` : row.suspension_unit === 'date_range' ? `${row.starts_on} a ${row.ends_on}` : 'Sin suspensión';
    const pdf = disciplineDecisionPdf({ caseId: target, team: row.team_name, player: row.player_name, summary: row.summary, status: row.decision_status==='revoked'?'Revocada':'Vigente', reason: row.decision_reason, suspension, fine: row.fine_amount_guaranies === null ? 'Sin multa' : `Gs. ${row.fine_amount_guaranies}`, decidedAt: row.decided_at.toISOString(), revocationReason:row.revoke_reason,revokedAt:row.revoked_at?.toISOString()||null });
    return reply.header('Content-Type','application/pdf').header('Content-Disposition',`attachment; filename="resolucion-${target}.pdf"`).header('Cache-Control','private, no-store').send(pdf);
  });
  app.post(`${root}/discipline/cases/:caseId/review`, async request => {
    const { id, caseId } = request.params as { id: string; caseId: string };
    const organizationId = uuid(id), target = uuid(caseId), actor = await organizer(request, organizationId), input = z.object({ reason }).strict().parse(request.body);
    await transaction(pool, async client => {
      const { rows: [row] } = await client.query('SELECT status FROM discipline_cases WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, target]);
      if (!row) fail(404, 'CASE_NOT_FOUND', 'No se encontró el expediente.');
      if (!['proposed','review'].includes(row.status)) fail(409, 'CASE_LOCKED', 'Este expediente ya tiene una decisión.');
      await client.query("UPDATE discipline_cases SET status='review' WHERE organization_id=$1 AND id=$2", [organizationId, target]);
      await action(client, organizationId, target, 'reviewed', input.reason, actor.user_id);
    });
    return caseRow(organizationId, target);
  });
  app.post(`${root}/categories/:categoryId/discipline/fines`, async (request, reply) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizer(request, organizationId);
    const input = z.object({ code: z.string().regex(/^[A-Z0-9_]{2,30}$/), label: z.string().trim().min(3).max(120), amountGuaranies: z.number().int().min(0).max(1000000000) }).strict().parse(request.body);
    const result = await transaction(pool, async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`fine:${organizationId}:${category}:${input.code}`]);
      const { rows: [found] } = await client.query('SELECT id FROM categories WHERE organization_id=$1 AND id=$2', [organizationId, category]);
      if (!found) fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
      const { rows: [latest] } = await client.query('SELECT coalesce(max(version),0)::int version FROM discipline_fine_catalog WHERE organization_id=$1 AND category_id=$2 AND code=$3', [organizationId, category, input.code]);
      const item = { id: randomUUID(), code: input.code, version: latest.version + 1, label: input.label, amountGuaranies: input.amountGuaranies };
      await client.query('INSERT INTO discipline_fine_catalog(id,organization_id,category_id,code,version,label,amount_guaranies,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [item.id, organizationId, category, item.code, item.version, item.label, item.amountGuaranies, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'discipline.fine_catalogued', item.id, 'Catálogo deportivo versionado', null, item);
      return item;
    });
    return reply.code(201).send(result);
  });
  app.get(`${root}/categories/:categoryId/discipline/fines`, async request => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId); await organizer(request, organizationId);
    return (await pool.query('SELECT id,code,version,label,amount_guaranies FROM discipline_fine_catalog WHERE organization_id=$1 AND category_id=$2 ORDER BY code,version DESC', [organizationId, category])).rows;
  });
  app.post(`${root}/discipline/cases/:caseId/decision`, async (request, reply) => {
    const { id, caseId } = request.params as { id: string; caseId: string };
    const organizationId = uuid(id), target = uuid(caseId), actor = await organizer(request, organizationId);
    const suspension = z.discriminatedUnion('unit', [z.object({ unit: z.literal('matches'), matches: z.number().int().min(1).max(100), startsOn: date }).strict(), z.object({ unit: z.literal('date_range'), startsOn: date, endsOn: date }).strict().refine(value => value.endsOn >= value.startsOn, 'La fecha final debe ser posterior al inicio.')]);
    const input = z.object({ reason, suspension: suspension.nullable(), fineCatalogId: z.uuid().nullable() }).strict().parse(request.body);
    const result = await transaction(pool, async client => {
      const { rows: [row] } = await client.query('SELECT entry_id,registration_id,category_id,status,source_valid FROM discipline_cases WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, target]);
      if (!row) fail(404, 'CASE_NOT_FOUND', 'No se encontró el expediente.');
      if (!['proposed','review'].includes(row.status) || !row.source_valid) fail(409, 'CASE_NOT_DECIDABLE', 'Revisá el origen del expediente antes de decidir.');
      if (input.suspension && !row.registration_id) fail(409, 'PLAYER_REQUIRED', 'La suspensión necesita un jugador identificado.');
      let fine: { id: string; amount_guaranies: number } | null = null;
      if (input.fineCatalogId) {
        const { rows: [catalog] } = await client.query('SELECT id,amount_guaranies FROM discipline_fine_catalog WHERE organization_id=$1 AND category_id=$2 AND id=$3', [organizationId, row.category_id, input.fineCatalogId]);
        if (!catalog) fail(404, 'FINE_NOT_FOUND', 'Elegí una multa del catálogo de esta categoría.');
        fine = catalog;
      }
      const decisionId = randomUUID();
      await client.query(`INSERT INTO discipline_decisions(id,organization_id,case_id,suspension_unit,suspension_matches,starts_on,ends_on,fine_catalog_id,fine_amount_guaranies,reason,decided_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [decisionId, organizationId, target, input.suspension?.unit ?? null, input.suspension?.unit === 'matches' ? input.suspension.matches : null, input.suspension?.startsOn ?? null, input.suspension?.unit === 'date_range' ? input.suspension.endsOn : null, fine?.id ?? null, fine?.amount_guaranies ?? null, input.reason, actor.user_id]);
      if(input.suspension?.unit==='matches') await recordSuspensionService(client,organizationId,null,decisionId);
      await client.query("UPDATE discipline_cases SET status='decided' WHERE organization_id=$1 AND id=$2", [organizationId, target]);
      await action(client, organizationId, target, 'decided', input.reason, actor.user_id, { decisionId, suspension: input.suspension, fineCatalogId: fine?.id ?? null, amountGuaranies: fine?.amount_guaranies ?? null });
      await client.query("INSERT INTO discipline_notices(id,organization_id,case_id,entry_id,kind) VALUES($1,$2,$3,$4,'decision')", [randomUUID(), organizationId, target, row.entry_id]);
      await audit(client, actor.user_id, organizationId, 'discipline.decided', target, input.reason, null, { decisionId, suspension: input.suspension, fineCatalogId: fine?.id ?? null });
      return decisionId;
    });
    return reply.code(201).send({ id: result, case: await caseRow(organizationId, target) });
  });
  app.post(`${root}/discipline/cases/:caseId/appeal`, async request => {
    const { id, caseId } = request.params as { id: string; caseId: string };
    const organizationId = uuid(id), target = uuid(caseId), input = z.object({ reason }).strict().parse(request.body);
    const row = await caseRow(organizationId, target), actor = await teamAccess(request, organizationId, row.entry_id);
    const { rows: [membership] } = await pool.query("SELECT role FROM memberships WHERE organization_id=$1 AND user_id=$2 AND status='active'", [organizationId, actor.user_id]);
    if (membership?.role !== 'team_admin') fail(403, 'TEAM_ADMIN_REQUIRED', 'La apelación corresponde al administrador del equipo.');
    await transaction(pool, async client => {
      const { rows: [current] } = await client.query('SELECT status FROM discipline_cases WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, target]);
      if (current.status !== 'decided') fail(409, 'APPEAL_NOT_ALLOWED', 'Solo podés apelar una decisión vigente.');
      await client.query("UPDATE discipline_cases SET status='appealed' WHERE organization_id=$1 AND id=$2", [organizationId, target]);
      await action(client, organizationId, target, 'appealed', input.reason, actor.user_id);
      await audit(client, actor.user_id, organizationId, 'discipline.appealed', target, input.reason, { status: 'decided' }, { status: 'appealed' });
    });
    return caseRow(organizationId, target);
  });
  app.post(`${root}/discipline/cases/:caseId/appeal/resolve`, async request => {
    const { id, caseId } = request.params as { id: string; caseId: string };
    const organizationId = uuid(id), target = uuid(caseId), actor = await organizer(request, organizationId), input = z.object({ decision: z.enum(['confirm','revoke']), reason }).strict().parse(request.body);
    await transaction(pool, async client => {
      const { rows: [row] } = await client.query('SELECT status,entry_id FROM discipline_cases WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, target]);
      if (!row) fail(404, 'CASE_NOT_FOUND', 'No se encontró el expediente.');
      if (row.status !== 'appealed') fail(409, 'APPEAL_NOT_PENDING', 'No hay apelación pendiente.');
      if (input.decision === 'revoke') await client.query("UPDATE discipline_decisions SET status='revoked',revoked_by=$3,revoked_at=now(),revoke_reason=$4 WHERE organization_id=$1 AND case_id=$2 AND status='active'", [organizationId, target, actor.user_id, input.reason]);
      await client.query('UPDATE discipline_cases SET status=$3 WHERE organization_id=$1 AND id=$2', [organizationId, target, input.decision === 'revoke' ? 'revoked' : 'decided']);
      await action(client, organizationId, target, input.decision === 'revoke' ? 'revoked' : 'appeal_confirmed', input.reason, actor.user_id);
      await client.query('INSERT INTO discipline_notices(id,organization_id,case_id,entry_id,kind) VALUES($1,$2,$3,$4,$5)', [randomUUID(), organizationId, target, row.entry_id, input.decision === 'revoke' ? 'revocation' : 'appeal']);
      await audit(client, actor.user_id, organizationId, 'discipline.appeal_resolved', target, input.reason, { status: 'appealed' }, { decision: input.decision });
    });
    return caseRow(organizationId, target);
  });
  app.post(`${root}/entries/:entryId/discipline/notices/:noticeId/read`, async request => {
    const { id, entryId, noticeId } = request.params as { id: string; entryId: string; noticeId: string };
    const organizationId = uuid(id), entry = uuid(entryId), notice = uuid(noticeId), actor = await teamAccess(request, organizationId, entry);
    const { rows: [updated] } = await pool.query('UPDATE discipline_notices SET read_by=coalesce(read_by,$4),read_at=coalesce(read_at,now()) WHERE organization_id=$1 AND entry_id=$2 AND id=$3 RETURNING id,read_at', [organizationId, entry, notice, actor.user_id]);
    if (!updated) fail(404, 'NOTICE_NOT_FOUND', 'No se encontró la notificación.');
    return updated;
  });
}
