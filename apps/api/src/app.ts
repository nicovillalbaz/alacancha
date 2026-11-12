import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { z, ZodError } from 'zod';
import { randomUUID, randomInt, createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createPool, transaction, audit, type DatabasePool } from '@torneos/db';
import type { ServerResponse } from 'node:http';
import { accessSchema, organizationSchema, loginSchema, brandSchema, tokenSchema, acceptSchema, passwordSchema, tournamentSetupSchema, categoryAddSchema, ruleSchema, ruleEditSchema, publishSchema, teamCreateSchema, teamRenameSchema, teamEntrySchema, teamAdminSchema, teamPersonSchema, teamPublicationSchema, venueCreateSchema, sponsorCreateSchema, sponsorPublicationSchema, playerDraftSchema, goodFaithSubmitSchema, goodFaithReviewSchema, playerDocumentLabelSchema, playerEvidenceReviewSchema, movementDeclareSchema, restrictionCreateSchema, calendarDateSchema, draftMatchSchema, lineupSaveSchema, lineupTransitionSchema, lineupReviewSchema, playerImportPreviewSchema, playerImportCommitSchema, playerIdentityEditSchema, playerReuseSchema, matchdayCreateSchema, fixtureScheduleSchema, matchdayPublishSchema, positionBlueprintSchema, matchEventSchema, matchEventVoidSchema, matchPeriodCodes, projectMatchJournal, roundRobin, drawGroups, knockoutBracket, previewCompetitionBracket, type PlayerDraftInput, type CurrentUser, type MatchCaptureView, type MatchJournalEvent } from '@torneos/shared';
import { digest, opaqueToken, csrfFor, safeEquals, hashPassword, verifyPassword, documentFingerprint, encryptDocument, decryptDocument, normalizeDocument } from './security.ts';
import type { Config } from './config.ts';
import { approvedGoodFaithPdf } from './private-pdf.ts';
import { registerPrivateExports } from './private-exports.ts';
import { categoryStatistics, playerStatNames, withDocumentedTiebreaks } from './statistics.ts';
import { activeSuspensionReasons, recordSuspensionService, registerDisciplineRoutes } from './discipline.ts';
import { registerFlyerRoutes } from './flyers.ts';
import { registerTournamentPaymentRoutes } from './tournament-payments.ts';
import { registerFixtureProgressRoutes } from './fixture-progress-routes.ts';
import { registerFixtureRefereeRoutes } from './fixture-referees-routes.ts';
import { tieWinner, type ApprovedScore } from './fixture-progress.ts';
import { positionCompetitionState, syncPositionMatches } from './position-competition.ts';
import { registerPublicWebRoutes } from './public-web.ts';

interface Auth { session_id: string; user_id: string; organization_id: string | null; display_name: string; username: string; platform_admin: boolean; rawToken: string }
declare module 'fastify' { interface FastifyRequest { auth: Auth | null } }
class ApiError extends Error { constructor(public statusCode: number, public code: string, message: string) { super(message); } }
const fail = (status: number, code: string, message: string): never => { throw new ApiError(status, code, message); };
function imageFormat(data: Buffer, claimed: string) {
  let contentType = '', extension = '';
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0) { contentType = 'image/png'; extension = 'png'; }
  else if (data.length >= 4 && data[0] === 255 && data[1] === 216 && data[data.length - 2] === 255 && data[data.length - 1] === 217) { contentType = 'image/jpeg'; extension = 'jpg'; }
  else if (data.length >= 16 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') { contentType = 'image/webp'; extension = 'webp'; }
  if (!contentType || contentType !== claimed) fail(400, 'INVALID_IMAGE', 'Usá un archivo PNG, JPG o WebP válido de hasta 2 MB.');
  return { contentType, extension };
}
function evidenceFormat(data: Buffer, claimed: string) {
  if (data.length === 0) fail(400, 'EMPTY_FILE', 'El archivo está vacío.');
  if (claimed === 'application/pdf' && data.length > 8 && data.toString('ascii', 0, 5) === '%PDF-') return { contentType: 'application/pdf', extension: 'pdf' };
  return imageFormat(data, claimed);
}
function ageAt(birth: string, date: string) {
  const [year, month, day] = date.split('-').map(Number), [birthYear, birthMonth, birthDay] = birth.split('-').map(Number);
  return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0);
}
const uuid = (value: unknown) => z.uuid().parse(value);
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
const requireAuth = (request: FastifyRequest): Auth => request.auth || fail(401, 'SESSION_REQUIRED', 'Volvé a ingresar para continuar.');
const requireOwner = (request: FastifyRequest): Auth => {
  const auth = requireAuth(request);
  if (!auth.platform_admin) fail(403, 'OWNER_REQUIRED', 'Esta acción corresponde a la administración de la plataforma.');
  return auth;
};

export async function buildApp(config: Config, suppliedPool?: DatabasePool) {
  const pool = suppliedPool || createPool(config.databaseUrl);
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, trustProxy: config.production ? '127.0.0.1' : false });
  const openStreams = new Set<ServerResponse>();
  const trackStream = (stream: ServerResponse) => { openStreams.add(stream); stream.once('close', () => openStreams.delete(stream)); };
  app.addHook('preClose', async () => { for (const stream of openStreams) stream.end(); });
  app.decorateRequest('auth', null);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 } });
  const dummyHash = await hashPassword(opaqueToken());
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'lax' as const, path: '/', maxAge: 43200 };

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    const analyticsSources = /^G-[A-Z0-9]+$/.test(process.env.GA_MEASUREMENT_ID || '') ? " https://www.googletagmanager.com https://*.google-analytics.com" : '';
    reply.header('Content-Security-Policy', request.url.startsWith('/api/') || ['/health','/ready','/robots.txt','/sitemap.xml'].includes(request.url.split('?')[0]) ? "default-src 'none'; frame-ancestors 'none'" : `default-src 'self'; img-src 'self' data: blob:${analyticsSources}; connect-src 'self'${analyticsSources}; style-src 'self' 'unsafe-inline'; script-src 'self'${analyticsSources}; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`);
  });
  app.addHook('preHandler', async (request) => {
    const origin = request.headers.origin;
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutation && origin && origin !== config.origin) fail(403, 'ORIGIN_DENIED', 'El origen de la solicitud no está permitido.');
    const requestPath = request.url.split('?')[0];
    if (!mutation && (/^\/(?:assets|icons)\/[a-zA-Z0-9._-]+$/.test(requestPath) || ['/manifest.webmanifest','/sw.js','/analytics.js'].includes(requestPath))) return;
    const rawToken = request.cookies.torneos_session;
    if (rawToken && /^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
      const result = await pool.query(`SELECT s.id session_id,s.user_id,s.organization_id,u.display_name,u.username,u.platform_admin FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.disabled_at IS NULL`, [digest(rawToken)]);
      if (result.rowCount) request.auth = { ...result.rows[0], rawToken };
    }
    if (mutation && request.auth && !['/api/v1/auth/login', '/api/v1/invitations/inspect'].includes(request.routeOptions.url || '')) {
      const received = request.headers['x-csrf-token'];
      if (typeof received !== 'string' || !safeEquals(received, csrfFor(config.appSecret, request.auth.rawToken))) fail(403, 'CSRF_REQUIRED', 'Actualizá la pantalla e intentá de nuevo.');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const failureInfo = (typeof error === 'object' && error !== null ? error : {}) as { code?: string; statusCode?: number };
    const status = error instanceof ZodError ? 400 : error instanceof ApiError ? error.statusCode : failureInfo.code === '23505' ? 409 : failureInfo.statusCode && failureInfo.statusCode < 500 ? failureInfo.statusCode : 500;
    const code = error instanceof ZodError ? 'INVALID_INPUT' : error instanceof ApiError ? error.code : failureInfo.code === '23505' ? 'ALREADY_EXISTS' : failureInfo.statusCode === 429 ? 'TOO_MANY_ATTEMPTS' : 'REQUEST_FAILED';
    const route = (request.routeOptions.url || '(unmatched)').slice(0,180);
    const safeMessage = error instanceof ApiError ? error.message.slice(0,500) : error instanceof ZodError ? error.issues[0]?.message?.slice(0,500) : null;
    void pool.query('INSERT INTO technical_error_logs(id,source,organization_id,actor_id,request_id,operation,method,status_code,error_code,error_type,message) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [randomUUID(),'api',request.auth?.organization_id||null,request.auth?.user_id||null,String(request.id).slice(0,100),route,request.method,status,code,error instanceof Error?error.name:'Unknown',safeMessage]
    ).catch(logError=>console.error(JSON.stringify({event:'technical_error_log_failed',requestId:request.id,errorType:logError instanceof Error?logError.name:'Unknown'})));
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_INPUT', message: error.issues[0]?.message || 'Revisá los datos ingresados.' });
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    const failure = (typeof error === 'object' && error !== null ? error : {}) as { code?: string; statusCode?: number };
    if (failure.code === '23505') return reply.code(409).send({ code: 'ALREADY_EXISTS', message: 'Ese usuario o asignación ya existe. Revisá los datos.' });
    if (failure.statusCode === 429) return reply.code(429).send({ code: 'TOO_MANY_ATTEMPTS', message: 'Hubo demasiados intentos. Esperá unos minutos antes de volver a intentar.' });
    if (failure.statusCode === 413) return reply.code(413).send({ code: 'FILE_TOO_LARGE', message: 'La imagen debe pesar como máximo 2 MB.' });
    if (!failure.statusCode || failure.statusCode >= 500) console.error(JSON.stringify({ event: 'request_failed', requestId: request.id, method: request.method, route: request.routeOptions.url || '(unmatched)', errorType: error instanceof Error ? error.name : 'Unknown', errorCode: failure.code || null }));
    return reply.code(failure.statusCode && failure.statusCode < 500 ? failure.statusCode : 500).send({ code: 'REQUEST_FAILED', message: 'No se pudo completar la operación. Tus datos del formulario se conservan.' });
  });
  app.get('/api/v1/admin/error-logs',async request=>{
    requireOwner(request);
    const {rows}=await pool.query('SELECT id,occurred_at,source,organization_id,request_id,operation,method,status_code,error_code,error_type,message,resource_id FROM technical_error_logs ORDER BY occurred_at DESC,id DESC LIMIT 100');
    return rows;
  });

  async function currentUser(auth: Auth): Promise<CurrentUser> {
    const { rows } = await pool.query(`SELECT m.id,m.organization_id,o.name organization_name,o.status organization_status,m.status,m.role,m.version FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 ORDER BY o.name,m.id`, [auth.user_id]);
    return { id: auth.user_id, name: auth.display_name, username: auth.username, platformAdmin: auth.platform_admin, organizationId: auth.organization_id, memberships: rows, csrfToken: csrfFor(config.appSecret, auth.rawToken) };
  }
  async function organizationAccess(request: FastifyRequest, organizationId: string, write = false) {
    const auth = requireAuth(request);
    if (auth.platform_admin) fail(403, 'ORGANIZATION_ROLE_REQUIRED', 'La administración de la plataforma no hereda acceso a los datos del torneo.');
    const result = await pool.query(`SELECT m.role FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active' AND o.status='active'`, [auth.user_id, organizationId]);
    if (!result.rowCount || auth.organization_id !== organizationId || (write && result.rows[0].role !== 'tournament_admin')) fail(403, 'SCOPE_DENIED', 'No tenés permiso para operar en esta organización.');
    return auth;
  }
  async function organizationBrandAccess(request: FastifyRequest, organizationId: string, write = false) {
    const auth = requireAuth(request);
    if (auth.platform_admin) return requireOwner(request);
    return organizationAccess(request, organizationId, write);
  }
  async function teamAccess(request: FastifyRequest, organizationId: string, entryId: string, organizerOnly = false) {
    const auth = await organizationAccess(request, organizationId);
    const { rows: [membership] } = await pool.query("SELECT id,role FROM memberships WHERE user_id=$1 AND organization_id=$2 AND status='active'", [auth.user_id, organizationId]);
    if (membership?.role === 'tournament_admin') return auth;
    if (organizerOnly || membership?.role !== 'team_admin') fail(403, 'TEAM_SCOPE_DENIED', 'No tenés permiso para este equipo.');
    const { rowCount } = await pool.query('SELECT 1 FROM team_admin_assignments WHERE organization_id=$1 AND entry_id=$2 AND membership_id=$3 AND revoked_at IS NULL', [organizationId, entryId, membership.id]);
    if (!rowCount) fail(403, 'TEAM_SCOPE_DENIED', 'No tenés permiso para este equipo.');
    return auth;
  }
  async function checkRegistrationPolicy(client: PoolClient, organizationId: string, categoryId: string, details: Record<string,string>) {
    const { rows: [current] } = await client.query(`SELECT r.rules,to_char(now() AT TIME ZONE t.timezone,'YYYY-MM-DD') today
      FROM categories c JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      LEFT JOIN LATERAL (SELECT rules FROM rule_versions WHERE organization_id=c.organization_id AND category_id=c.id ORDER BY (status='published') DESC,version DESC LIMIT 1) r ON true
      WHERE c.organization_id=$1 AND c.id=$2`, [organizationId, categoryId]);
    const permitted = new Set((current?.rules?.eligibility?.registrationFields || []).map((field: { key: string }) => field.key));
    if (Object.keys(details).some((key) => !permitted.has(key))) fail(400, 'REGISTRATION_FIELD_UNKNOWN', 'La ficha contiene un campo no configurado en este reglamento.');
  }
  function requiredProof(eligibility: any, originKind: string) {
    const proof = eligibility?.transferProof;
    return proof && (proof.requiredFor === 'all' || (proof.requiredFor === 'external' && originKind === 'external')) ? proof.label as string : null;
  }
  async function assessEligibility(organizationId: string, entry: string, registration: string, asOf: string) {
    const { rows: [player] } = await pool.query(`SELECT pr.status,pr.origin_kind,to_char(p.birth_date,'YYYY-MM-DD') birth_date,e.category_id
      FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
      JOIN team_entries e ON e.organization_id=pr.organization_id AND e.id=pr.entry_id
      WHERE pr.organization_id=$1 AND pr.entry_id=$2 AND pr.id=$3 AND pr.reverted_at IS NULL`, [organizationId, entry, registration]);
    if (!player) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
    const blocked: string[] = [], warnings: string[] = [];
    if (player.status !== 'approved') blocked.push('La inscripción aún no está aprobada en buena fe.');
    const { rows: [rule] } = await pool.query("SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, player.category_id]);
    if (!rule) blocked.push('No hay reglamento publicado para la categoría.');
    const age = rule?.rules?.eligibility?.age;
    if (age) {
      const reference = age.reference === 'fixed_date' ? age.fixedDate : asOf;
      if (!reference || player.birth_date > reference) blocked.push('La fecha de nacimiento no cumple el corte de edad.');
      else {
        const years = ageAt(player.birth_date, reference);
        if ((age.minYears !== null && years < age.minYears) || (age.maxYears !== null && years > age.maxYears)) blocked.push(`Edad fuera del rango al ${reference}.`);
      }
    }
    const required = [...(rule?.rules?.eligibility?.requiredDocuments || [])];
    const proof = requiredProof(rule?.rules?.eligibility, player.origin_kind);
    if (proof && !required.some((label: string) => label.toLocaleLowerCase('es') === proof.toLocaleLowerCase('es'))) required.push(proof);
    if (required.length) {
      const { rows } = await pool.query(`SELECT DISTINCT ON (lower(label)) label,status FROM player_documents WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 ORDER BY lower(label),uploaded_at DESC,id DESC`, [organizationId, entry, registration]);
      for (const label of required as string[]) if (rows.find((item) => item.label.toLocaleLowerCase('es') === label.toLocaleLowerCase('es'))?.status !== 'approved') blocked.push(`Falta documento aprobado: ${label}.`);
    }
    const { rows: [movement] } = await pool.query("SELECT kind,status,to_char(starts_on,'YYYY-MM-DD') starts_on,to_char(ends_on,'YYYY-MM-DD') ends_on FROM player_movements WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 ORDER BY declared_at DESC,id DESC LIMIT 1", [organizationId, entry, registration]);
    if (movement) {
      if (movement.status !== 'approved') blocked.push('El movimiento declarado requiere aprobación.');
      else if (asOf < movement.starts_on || (movement.ends_on && asOf > movement.ends_on)) blocked.push(movement.kind === 'loan' ? 'Préstamo fuera de vigencia.' : 'Transferencia fuera de vigencia.');
    } else if (player.origin_kind === 'external') warnings.push('El origen externo es una declaración no verificada.');
    else if (player.origin_kind === 'unknown') warnings.push('No se declaró un equipo de origen.');
    const { rows: restrictions } = await pool.query("SELECT reason FROM player_restrictions WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 AND lifted_at IS NULL AND starts_on<=$4::date AND (ends_on IS NULL OR ends_on>=$4::date)", [organizationId, entry, registration, asOf]);
    for (const restriction of restrictions) blocked.push(`Restricción manual: ${restriction.reason}`);
    blocked.push(...await activeSuspensionReasons(pool, organizationId, entry, registration, asOf));
    return { registrationId: registration, asOf, status: blocked.length || warnings.length ? 'warning' as const : 'allowed' as const, reasons: [...blocked, ...warnings] };
  }
  async function lineupContext(organizationId: string, matchId: string, entry: string) {
    const { rows: [match] } = await pool.query("SELECT m.id,m.category_id,m.home_entry_id,m.away_entry_id,to_char(m.match_date,'YYYY-MM-DD') match_date FROM draft_matches m WHERE m.organization_id=$1 AND m.id=$2", [organizationId, matchId]);
    if (!match || (match.home_entry_id !== entry && match.away_entry_id !== entry)) fail(404, 'MATCH_NOT_FOUND', 'No se encontró un partido borrador de este equipo.');
    if (!match.match_date) fail(409, 'MATCH_UNSCHEDULED', 'Asigná una fecha al encuentro antes de preparar su planilla.');
    const { rows: [rule] } = await pool.query("SELECT version,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, match.category_id]);
    if (!rule) fail(409, 'RULES_NOT_PUBLISHED', 'Publicá primero el reglamento.');
    const parsed = ruleSchema.safeParse(rule.rules);
    if (!parsed.success) fail(409, 'RULES_INCOMPLETE', 'El reglamento publicado necesita revisión.');
    const { rows: [goodFaith] } = await pool.query("SELECT version,snapshot FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2 AND status='approved' ORDER BY version DESC LIMIT 1", [organizationId, entry]);
    if (!goodFaith) fail(409, 'GOOD_FAITH_REQUIRED', 'Aprobá la lista de buena fe antes de armar la planilla.');
    return { match, rule: { version: rule.version as number, config: parsed.data! }, goodFaith: { version: goodFaith.version as number, snapshot: goodFaith.snapshot as Array<{ registrationId: string }> } };
  }
  async function lineupMatchAccess(organizationId: string, matchId: string, entry: string) {
    const { rows: [match] } = await pool.query('SELECT 1 FROM draft_matches WHERE organization_id=$1 AND id=$2 AND (home_entry_id=$3 OR away_entry_id=$3)', [organizationId, matchId, entry]);
    if (!match) fail(404, 'MATCH_NOT_FOUND', 'No se encontró un partido borrador de este equipo.');
  }
  async function checkLineup(organizationId: string, matchId: string, entry: string, players: Array<{ registrationId: string; role: 'starter' | 'bench'; goalkeeper: boolean; captain: boolean }>, staffIds: string[], complete: boolean) {
    const context = await lineupContext(organizationId, matchId, entry), rules = context.rule.config;
    const starters = players.filter((player) => player.role === 'starter').length, bench = players.length - starters;
    const warnings: string[] = [];
    if (starters > rules.playersOnField) warnings.push(`Hay ${starters} titulares; el reglamento indica ${rules.playersOnField}.`);
    if (bench > rules.maxBenchPlayers) warnings.push(`Hay ${bench} suplentes; el reglamento indica ${rules.maxBenchPlayers}.`);
    if (staffIds.length > rules.maxBenchStaff) warnings.push(`Hay ${staffIds.length} integrantes del cuerpo técnico; el reglamento indica ${rules.maxBenchStaff}.`);
    if (complete && starters < rules.minimumToStart) warnings.push(`Hay ${starters} titulares; el reglamento indica al menos ${rules.minimumToStart}.`);
    const approved = new Set(context.goodFaith.snapshot.map((player) => player.registrationId));
    for (const player of players) if (!approved.has(player.registrationId)) fail(409, 'PLAYER_NOT_APPROVED', 'La planilla solo admite jugadores de una buena fe aprobada para este equipo.');
    if (staffIds.length) {
      const { rows } = await pool.query("SELECT id FROM team_staff WHERE organization_id=$1 AND entry_id=$2 AND status='confirmed' AND id=ANY($3::uuid[])", [organizationId, entry, staffIds]);
      if (rows.length !== staffIds.length) fail(409, 'STAFF_NOT_CONFIRMED', 'Elegí solo integrantes confirmados del cuerpo técnico de este equipo.');
    }
    for (const player of players) {
      const eligibility = await assessEligibility(organizationId, entry, player.registrationId, context.match.match_date);
      if (eligibility.status === 'warning') warnings.push(...eligibility.reasons);
    }
    return { context, warnings };
  }
  function importSignature(organizationId: string, entry: string, userId: string, rows: PlayerDraftInput[], stamp: string) {
    return createHmac('sha256', config.appSecret).update(JSON.stringify({ organizationId, entry, userId, rows, stamp })).digest('hex');
  }
  async function checkImportRows(db: any, organizationId: string, entry: string, rows: PlayerDraftInput[]) {
    const { rows: [participation] } = await db.query('SELECT category_id,status FROM team_entries WHERE organization_id=$1 AND id=$2', [organizationId, entry]);
    if (!participation || participation.status !== 'active') fail(404, 'NOT_FOUND', 'No se encontró una participación activa.');
    const { rows: [rule] } = await db.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1', [organizationId, participation.category_id]);
    const { rows: [count] } = await db.query('SELECT count(*)::int total FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND reverted_at IS NULL AND status<>\'rejected\'', [organizationId, entry]);
    const maximum = rule?.rules?.maxRegisteredPlayers;
    if (typeof maximum === 'number' && count.total + rows.length > maximum) fail(409, 'ROSTER_FULL', `El lote supera el máximo de ${maximum} jugadores.`);
    for (const row of rows) {
      if (row.birthDate > new Date().toISOString().slice(0,10)) fail(400, 'BIRTH_DATE_FUTURE', 'El lote contiene una fecha de nacimiento futura.');
      if (row.origin.kind === 'internal') {
        const { rowCount } = await db.query('SELECT 1 FROM teams WHERE organization_id=$1 AND id=$2', [organizationId, row.origin.teamId]);
        if (!rowCount) fail(400, 'ORIGIN_NOT_FOUND', 'Un equipo de origen no pertenece a esta organización.');
      }
      if (row.documentNumber && row.documentKind) {
        const fingerprint = documentFingerprint(config.appSecret, organizationId, row.documentKind, row.documentNumber);
        const { rowCount: duplicate } = await db.query('SELECT 1 FROM players WHERE organization_id=$1 AND document_kind=$2 AND document_fingerprint=$3', [organizationId, row.documentKind, fingerprint]);
        if (duplicate) fail(409, 'PLAYER_DUPLICATE', 'Un documento del lote ya figura en la organización. Revisá el archivo antes de importar.');
      }
      if (row.registrationNumber) {
        const { rowCount: card } = await db.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND lower(registration_number)=lower($3) AND reverted_at IS NULL', [organizationId, entry, row.registrationNumber]);
        if (card) fail(409, 'CARD_DUPLICATE', 'Un número de ficha del lote ya existe en este equipo.');
      }
    }
  }
  async function newInvitation(client: Parameters<Parameters<typeof transaction>[1]>[0], actor: string, userId: string, organizationId: string | null, purpose: 'invite' | 'recovery') {
    const token = opaqueToken();
    await client.query('UPDATE invitations SET revoked_at=now() WHERE user_id=$1 AND purpose=$2 AND organization_id IS NOT DISTINCT FROM $3 AND used_at IS NULL AND revoked_at IS NULL', [userId, purpose, organizationId]);
    const id = randomUUID();
    await client.query("INSERT INTO invitations(id,user_id,organization_id,purpose,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '48 hours',$6)", [id, userId, organizationId, purpose, digest(token), actor]);
    await audit(client, actor, organizationId, purpose === 'invite' ? 'invitation.created' : 'recovery.created', id, 'Enlace temporal administrado y entregado fuera del sistema');
    return { token, expiresInHours: 48, url: `${config.origin}/#/${purpose === 'invite' ? 'invitacion' : 'recuperacion'}/${token}` };
  }

  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => { try { await pool.query('SELECT 1'); return { status: 'ready' }; } catch { return reply.code(503).send({ status: 'unavailable' }); } });
  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const { rows: [user] } = await pool.query('SELECT * FROM users WHERE lower(username)=lower($1)', [input.username]);
    const valid = await verifyPassword(user?.password_hash || dummyHash, input.password);
    if (!user || !user.password_hash || user.disabled_at || !valid) fail(401, 'LOGIN_FAILED', 'El usuario o la contraseña no son correctos.');
    const token = opaqueToken();
    const sessionId = randomUUID();
    if (request.auth) await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [request.auth.session_id]);
    await pool.query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')", [sessionId, user.id, digest(token)]);
    reply.setCookie('torneos_session', token, cookieOptions);
    return currentUser({ session_id: sessionId, user_id: user.id, organization_id: null, display_name: user.display_name, username: user.username, platform_admin: user.platform_admin, rawToken: token });
  });
  app.get('/api/v1/auth/me', async (request) => currentUser(requireAuth(request)));
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const auth = requireAuth(request);
    await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [auth.session_id]);
    reply.clearCookie('torneos_session', { path: '/' });
    return reply.code(204).send();
  });
  app.post('/api/v1/auth/password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request) => {
    const actor = requireAuth(request);
    const { password } = z.object({ password: passwordSchema }).strict().parse(request.body);
    await transaction(pool, async (client) => {
      const { rows: [account] } = await client.query('SELECT id FROM users WHERE id=$1 AND disabled_at IS NULL FOR UPDATE', [actor.user_id]);
      if (!account) fail(401, 'SESSION_REQUIRED', 'Volvé a ingresar para continuar.');
      const { rowCount: activeSession } = await client.query('SELECT 1 FROM sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE', [actor.session_id, actor.user_id]);
      if (!activeSession) fail(401, 'SESSION_REQUIRED', 'Volvé a ingresar para continuar.');
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password), actor.user_id]);
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL', [actor.user_id, actor.session_id]);
      await client.query("UPDATE invitations SET revoked_at=now() WHERE user_id=$1 AND purpose='recovery' AND used_at IS NULL AND revoked_at IS NULL", [actor.user_id]);
      await audit(client, actor.user_id, null, 'password.changed', actor.user_id, 'Contraseña cambiada desde la cuenta');
    });
    return { updated: true };
  });
  app.post('/api/v1/auth/context', async (request) => {
    const auth = requireAuth(request);
    const { organizationId } = z.object({ organizationId: z.uuid() }).strict().parse(request.body);
    const result = await pool.query(`SELECT 1 FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active' AND o.status='active'`, [auth.user_id, organizationId]);
    if (!result.rowCount) fail(403, 'ACCESS_INACTIVE', 'El acceso a esta organización no está habilitado.');
    await pool.query('UPDATE sessions SET organization_id=$1 WHERE id=$2 AND revoked_at IS NULL', [organizationId, auth.session_id]);
    return currentUser({ ...auth, organization_id: organizationId });
  });

  app.get('/api/v1/admin/administrators', async (request) => {
    requireOwner(request);
    return (await pool.query(`SELECT m.id,m.organization_id,m.status,m.role,m.version,u.id user_id,u.display_name name,u.username,o.name organization_name,o.status organization_status FROM memberships m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id ORDER BY o.name,u.display_name LIMIT 200`)).rows;
  });
  app.get('/api/v1/admin/organizations', async (request) => { requireOwner(request); return (await pool.query('SELECT id,name,status,accent,version,logo_id FROM organizations ORDER BY name LIMIT 200')).rows; });
  app.post('/api/v1/admin/organizations', async (request, reply) => {
    const actor = requireOwner(request);
    const input = organizationSchema.parse(request.body);
    const creationFingerprint = digest(JSON.stringify({ name: input.name, administratorName: input.administratorName, username: input.username.toLowerCase() }));
    const result = await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,42))', [input.requestId]);
      const { rows: [existing] } = await client.query(`SELECT o.id organization_id,o.creation_fingerprint,m.id membership_id,m.user_id FROM organizations o JOIN memberships m ON m.organization_id=o.id AND m.role='tournament_admin' WHERE o.creation_key=$1 ORDER BY m.created_at LIMIT 1`, [input.requestId]);
      if (existing && existing.creation_fingerprint !== creationFingerprint) fail(409, 'REQUEST_CHANGED', 'Esta solicitud ya creó una organización. Revisala en Organizaciones antes de crear otra.');
      if (existing) return { organizationId: existing.organization_id, membershipId: existing.membership_id, reused: true, invitation: await newInvitation(client, actor.user_id, existing.user_id, existing.organization_id, 'invite') };
      const organizationId = randomUUID();
      await client.query("INSERT INTO organizations(id,name,status,creation_key,creation_fingerprint) VALUES($1,$2,'active',$3,$4)", [organizationId, input.name, input.requestId, creationFingerprint]);
      let { rows: [user] } = await client.query('SELECT id FROM users WHERE lower(username)=lower($1)', [input.username]);
      if (!user) { user = { id: randomUUID() }; await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$2,$3)', [user.id, input.username, input.administratorName]); }
      const membershipId = randomUUID();
      await client.query("INSERT INTO memberships(id,organization_id,user_id,role) VALUES($1,$2,$3,'tournament_admin')", [membershipId, organizationId, user.id]);
      await audit(client, actor.user_id, organizationId, 'organization.created', organizationId, 'Creación manual de organización y administrador', null, { name: input.name, membershipId });
      return { organizationId, membershipId, invitation: await newInvitation(client, actor.user_id, user.id, organizationId, 'invite') };
    });
    return reply.code(201).send(result);
  });
  app.post('/api/v1/admin/memberships/:id/access', async (request) => {
    const actor = requireOwner(request);
    const id = uuid((request.params as { id: string }).id);
    const input = accessSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [membership] } = await client.query('SELECT * FROM memberships WHERE id=$1 FOR UPDATE', [id]);
      if (!membership) fail(404, 'NOT_FOUND', 'No se encontró la asignación.');
      if (membership.version !== input.version) fail(409, 'STALE_VERSION', 'El acceso cambió en otra pantalla. Actualizá antes de confirmar.');
      const { rows: [updated] } = await client.query('UPDATE memberships SET status=$1,version=version+1 WHERE id=$2 RETURNING id,status,version', [input.status, id]);
      if (input.status !== 'active') await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND organization_id=$2 AND revoked_at IS NULL', [membership.user_id, membership.organization_id]);
      await audit(client, actor.user_id, membership.organization_id, 'membership.access_changed', id, input.reason, { status: membership.status, version: membership.version }, updated);
      return updated;
    });
  });
  app.post('/api/v1/admin/organizations/:id/access', async (request) => {
    const actor = requireOwner(request); const id = uuid((request.params as { id: string }).id); const input = accessSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [organization] } = await client.query('SELECT * FROM organizations WHERE id=$1 FOR UPDATE', [id]);
      if (!organization) fail(404, 'NOT_FOUND', 'No se encontró la organización.');
      if (organization.version !== input.version) fail(409, 'STALE_VERSION', 'La organización cambió. Actualizá antes de confirmar.');
      const { rows: [updated] } = await client.query('UPDATE organizations SET status=$1,version=version+1 WHERE id=$2 RETURNING id,status,version', [input.status, id]);
      if (input.status !== 'active') await client.query('UPDATE sessions SET revoked_at=now() WHERE organization_id=$1 AND revoked_at IS NULL', [id]);
      await audit(client, actor.user_id, id, 'organization.access_changed', id, input.reason, { status: organization.status }, updated); return updated;
    });
  });
  app.post('/api/v1/admin/memberships/:id/invitation', async (request) => {
    const actor = requireOwner(request); const id = uuid((request.params as { id: string }).id);
    return transaction(pool, async (client) => {
      const { rows: [membership] } = await client.query('SELECT user_id,organization_id FROM memberships WHERE id=$1 FOR UPDATE', [id]);
      if (!membership) fail(404, 'NOT_FOUND', 'No se encontró la asignación.');
      return newInvitation(client, actor.user_id, membership.user_id, membership.organization_id, 'invite');
    });
  });
  app.post('/api/v1/admin/users/:id/recovery', async (request) => {
    const actor = requireOwner(request); const userId = uuid((request.params as { id: string }).id); const { reason } = reasonSchema.parse(request.body);
    if (userId === actor.user_id) fail(409, 'SELF_RECOVERY', 'La recuperación propia requiere asistencia de otro administrador de plataforma.');
    return transaction(pool, async (client) => {
      const { rows: [user] } = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      if (!user) fail(404, 'NOT_FOUND', 'No se encontró el usuario.');
      await audit(client, actor.user_id, null, 'recovery.requested', userId, reason);
      return newInvitation(client, actor.user_id, userId, null, 'recovery');
    });
  });
  app.post('/api/v1/admin/users/:id/password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request) => {
    const actor = requireOwner(request);
    const userId = uuid((request.params as { id: string }).id);
    const { password } = z.object({ password: passwordSchema }).strict().parse(request.body);
    if (userId === actor.user_id) fail(409, 'USE_OWN_ACCOUNT', 'Cambiá tu contraseña desde Cuenta.');
    await transaction(pool, async (client) => {
      const { rows: [account] } = await client.query('SELECT id FROM users WHERE id=$1 AND platform_admin=false FOR UPDATE', [userId]);
      if (!account) fail(404, 'NOT_FOUND', 'No se encontró la cuenta.');
      await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password), userId]);
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
      await client.query("UPDATE invitations SET revoked_at=now() WHERE user_id=$1 AND purpose='recovery' AND used_at IS NULL AND revoked_at IS NULL", [userId]);
      await audit(client, actor.user_id, null, 'password.reset_by_admin', userId, 'Contraseña cambiada por superadmin');
    });
    return { updated: true };
  });
  app.get('/api/v1/admin/audit', async (request) => { requireOwner(request); return (await pool.query(`SELECT a.id,a.action,a.reason,a.before_data,a.after_data,a.created_at,u.display_name actor,o.name organization_name FROM audit_logs a JOIN users u ON u.id=a.actor_id LEFT JOIN organizations o ON o.id=a.organization_id ORDER BY a.created_at DESC,a.id LIMIT 100`)).rows; });

  app.post('/api/v1/invitations/inspect', async (request) => {
    const { token } = tokenSchema.parse(request.body);
    const { rows: [invitation] } = await pool.query(`SELECT i.purpose,u.display_name name,u.username,(u.password_hash IS NOT NULL) has_password,o.name organization_name FROM invitations i JOIN users u ON u.id=i.user_id LEFT JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()`, [digest(token)]);
    if (!invitation) fail(410, 'LINK_UNAVAILABLE', 'El enlace venció, ya se usó o fue reemplazado. Pedí uno nuevo a la administración.');
    return { ...invitation, currentUser: request.auth ? await currentUser(request.auth) : null };
  });
  app.post('/api/v1/invitations/accept', async (request) => {
    const input = acceptSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [invitation] } = await client.query(`SELECT i.*,u.password_hash FROM invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=$1 FOR UPDATE OF i,u`, [digest(input.token)]);
      if (!invitation || invitation.used_at || invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) fail(410, 'LINK_UNAVAILABLE', 'El enlace venció, ya se usó o fue reemplazado.');
      if (invitation.purpose === 'invite' && invitation.password_hash) {
        if (request.auth?.user_id !== invitation.user_id) fail(401, 'SIGN_IN_REQUIRED', 'Ingresá con tu cuenta para aceptar esta invitación.');
      } else {
        const password = passwordSchema.parse(input.password);
        await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password), invitation.user_id]);
      }
      await client.query('UPDATE invitations SET used_at=now() WHERE id=$1', [invitation.id]);
      if (invitation.purpose === 'invite' && invitation.organization_id) {
        const { rows: delegated } = await client.query("UPDATE memberships SET status='active',version=version+1 WHERE user_id=$1 AND organization_id=$2 AND role IN ('team_admin','operator') AND status='pending' RETURNING id,role", [invitation.user_id, invitation.organization_id]);
        for (const membership of delegated) await audit(client, invitation.user_id, invitation.organization_id, `${membership.role}.activated`, membership.id, 'Invitación aceptada');
      }
      if (invitation.purpose === 'recovery') await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [invitation.user_id]);
      await audit(client, invitation.user_id, invitation.organization_id, `${invitation.purpose}.accepted`, invitation.id, 'Enlace temporal de un uso aceptado');
      return { accepted: true, requiresLogin: invitation.purpose === 'recovery' || !request.auth };
    });
  });

  app.get('/api/v1/organizations/:id', async (request) => {
    const id = uuid((request.params as { id: string }).id); await organizationAccess(request, id);
    const { rows: [organization] } = await pool.query('SELECT id,name,status,accent,version,logo_id FROM organizations WHERE id=$1', [id]);
    if (!organization) fail(404, 'NOT_FOUND', 'No se encontró la organización.'); return organization;
  });
  app.patch('/api/v1/organizations/:id/branding', async (request) => {
    const id = uuid((request.params as { id: string }).id); const actor = await organizationBrandAccess(request, id, true); const input = brandSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [organization] } = await client.query('SELECT id,name,accent,version FROM organizations WHERE id=$1 FOR UPDATE', [id]);
      if (!organization || organization.version !== input.version) fail(409, 'STALE_VERSION', 'Los datos cambiaron en otra pantalla. Actualizá antes de guardar.');
      const { rows: [updated] } = await client.query('UPDATE organizations SET name=$1,accent=$2,version=version+1 WHERE id=$3 RETURNING id,name,status,accent,version,logo_id', [input.name, input.accent, id]);
      await audit(client, actor.user_id, id, 'organization.brand_changed', id, 'Actualización de nombre y acento', organization, { name: updated.name, accent: updated.accent }); return updated;
    });
  });
  app.post('/api/v1/organizations/:id/logo', async (request, reply) => {
    const id = uuid((request.params as { id: string }).id); const actor = await organizationBrandAccess(request, id, true);
    const file = await request.file(); if (!file) fail(400, 'FILE_REQUIRED', 'Elegí una imagen PNG, JPG o WebP.');
    const data = await file!.toBuffer();
    const { contentType, extension } = imageFormat(data, file!.mimetype);
    const mediaId = randomUUID(); const filename = `${mediaId}.${extension}`;
    await mkdir(config.mediaDir, { recursive: true }); await writeFile(resolve(config.mediaDir, filename), data, { flag: 'wx' });
    try {
      await transaction(pool, async (client) => {
        await client.query('INSERT INTO media(id,organization_id,filename,content_type,byte_length,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [mediaId,id,filename,contentType,data.length,digest(data),actor.user_id]);
        await client.query('UPDATE organizations SET logo_id=$1,version=version+1 WHERE id=$2', [mediaId,id]);
        await audit(client, actor.user_id, id, 'organization.logo_changed', mediaId, 'Logo privado cargado');
      });
    } catch (error) { await unlink(resolve(config.mediaDir, filename)); throw error; }
    return reply.code(201).send({ id: mediaId });
  });
  app.get('/api/v1/organizations/:id/logo', async (request, reply) => {
    const id = uuid((request.params as { id: string }).id); await organizationBrandAccess(request, id);
    const { rows: [media] } = await pool.query('SELECT m.filename,m.content_type FROM media m JOIN organizations o ON o.logo_id=m.id AND o.id=m.organization_id WHERE o.id=$1', [id]);
    if (!media) fail(404, 'NOT_FOUND', 'Esta organización todavía no tiene logo.');
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el archivo.');
    return reply.type(media.content_type).send(await readFile(resolve(config.mediaDir, media.filename)));
  });
  app.get('/api/v1/public/organizations/:id/logo', async (request, reply) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const { rows: [media] } = await pool.query(`SELECT m.filename,m.content_type FROM organizations o
      JOIN media m ON m.organization_id=o.id AND m.id=o.logo_id
      WHERE o.id=$1 AND o.status='active' AND (EXISTS (
        SELECT 1 FROM tournaments t JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id
        JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
        JOIN rule_versions r ON r.organization_id=c.organization_id AND r.category_id=c.id AND r.status='published'
        WHERE t.organization_id=o.id AND t.status='published' AND ed.status='published' AND c.status='published')
      OR EXISTS (SELECT 1 FROM tournaments t JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id
        JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
        JOIN fixture_position_blueprints b ON b.organization_id=c.organization_id AND b.category_id=c.id
        JOIN fixture_position_publications p ON p.organization_id=b.organization_id AND p.blueprint_id=b.id
        WHERE t.organization_id=o.id))`, [organizationId]);
    if (!media) fail(404, 'NOT_FOUND', 'No hay logo público para esta organización.');
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el archivo.');
    return reply.header('Cache-Control','public, max-age=60, stale-while-revalidate=300').type(media.content_type).send(await readFile(resolve(config.mediaDir, media.filename)));
  });

  const tournamentRows = `SELECT t.id,t.name,t.public_slug,t.timezone,t.status,(t.emblem_id IS NOT NULL) has_emblem,e.id edition_id,e.name edition_name,c.id category_id,c.name category_name,c.preset,c.team_limit,r.version rule_version,r.revision rule_revision,r.status rule_status,r.rules || jsonb_build_object('maxBenchStaff',COALESCE(r.rules->'maxBenchStaff','0'::jsonb),'substitutions',COALESCE(r.rules->'substitutions','null'::jsonb),'eligibility',COALESCE(r.rules->'eligibility','null'::jsonb),'advanced',COALESCE(r.rules->'advanced','null'::jsonb),'initialPhase',COALESCE(r.rules->'initialPhase','null'::jsonb)) rules
    FROM tournaments t JOIN editions e ON e.organization_id=t.organization_id AND e.tournament_id=t.id
    JOIN categories c ON c.organization_id=e.organization_id AND c.edition_id=e.id
    JOIN LATERAL (SELECT version,revision,status,rules FROM rule_versions rv WHERE rv.organization_id=c.organization_id AND rv.category_id=c.id AND ($3::boolean=false OR rv.status='published') ORDER BY version DESC LIMIT 1) r ON true
    WHERE t.organization_id=$1 AND ($2::uuid IS NULL OR t.id=$2) AND ($3::boolean=false OR (t.status='published' AND e.status='published' AND c.status='published'))
    ORDER BY t.created_at DESC,c.created_at,c.id LIMIT 200`;
  app.get('/api/v1/organizations/:id/tournaments', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    await organizationAccess(request, organizationId);
    return (await pool.query(tournamentRows, [organizationId, null, false])).rows;
  });
  app.get('/api/v1/organizations/:id/tournaments/:tournamentId', async (request) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id); await organizationAccess(request, organizationId);
    const result = await pool.query(tournamentRows, [organizationId, uuid(tournamentId), false]);
    if (!result.rowCount) fail(404, 'NOT_FOUND', 'No se encontró el torneo en esta organización.');
    return result.rows;
  });
  app.patch('/api/v1/organizations/:id/tournaments/:tournamentId/public-slug', async (request) => {
    const {id,tournamentId}=request.params as {id:string;tournamentId:string};
    const organizationId=uuid(id),tournament=uuid(tournamentId),actor=await organizationAccess(request,organizationId,true);
    const {slug}=z.object({slug:z.string().trim().min(3).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)}).strict().parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[current]}=await client.query('SELECT public_slug FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,tournament]);
      if(!current)fail(404,'NOT_FOUND','No se encontró este torneo.');
      const {rowCount:organizationAlias}=await client.query('SELECT 1 FROM organizations WHERE public_slug=$1',[slug]);
      if(organizationAlias)fail(409,'SLUG_TAKEN','Ese enlace ya está en uso.');
      if(current.public_slug===slug)return {slug,reused:true};
      await client.query('UPDATE tournaments SET public_slug=$1 WHERE organization_id=$2 AND id=$3',[slug,organizationId,tournament]);
      await audit(client,actor.user_id,organizationId,'tournament.public_slug_changed',tournament,'Enlace público actualizado',{slug:current.public_slug},{slug});
      return {slug,reused:false};
    });
  });
  app.post('/api/v1/organizations/:id/tournaments/:tournamentId/emblem', async (request, reply) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    const actor = await organizationAccess(request, organizationId, true);
    const { rows: [present] } = await pool.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2', [organizationId, tournament]);
    if (!present) fail(404, 'NOT_FOUND', 'No se encontró el torneo en tu organización.');
    const file = await request.file(); if (!file) fail(400, 'FILE_REQUIRED', 'Elegí una imagen PNG, JPG o WebP.');
    const data = await file!.toBuffer(); const { contentType, extension } = imageFormat(data, file!.mimetype);
    const mediaId = randomUUID(), filename = `${mediaId}.${extension}`;
    await mkdir(config.mediaDir, { recursive: true }); await writeFile(resolve(config.mediaDir, filename), data, { flag: 'wx' });
    try {
      await transaction(pool, async (client) => {
        await client.query('INSERT INTO media(id,organization_id,filename,content_type,byte_length,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [mediaId, organizationId, filename, contentType, data.length, digest(data), actor.user_id]);
        await client.query('UPDATE tournaments SET emblem_id=$1 WHERE organization_id=$2 AND id=$3', [mediaId, organizationId, tournament]);
        await audit(client, actor.user_id, organizationId, 'tournament.emblem_changed', tournament, 'Emblema del torneo cargado', null, { mediaId });
      });
    } catch (error) { await unlink(resolve(config.mediaDir, filename)); throw error; }
    return reply.code(201).send({ id: mediaId });
  });
  app.get('/api/v1/organizations/:id/tournaments/:tournamentId/emblem', async (request, reply) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    await organizationAccess(request, organizationId);
    const { rows: [media] } = await pool.query('SELECT m.filename,m.content_type FROM tournaments t JOIN media m ON m.organization_id=t.organization_id AND m.id=t.emblem_id WHERE t.organization_id=$1 AND t.id=$2', [organizationId, tournament]);
    if (!media) fail(404, 'NOT_FOUND', 'Este torneo aún no tiene emblema.');
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el archivo.');
    return reply.type(media.content_type).send(await readFile(resolve(config.mediaDir, media.filename)));
  });
  const flyerSettingsSchema = z.object({ revision:z.number().int().nonnegative(), template:z.enum(['forest','paper']), size:z.enum(['square','portrait','story','print']), format:z.enum(['png','jpg','pdf']), primaryColor:z.string().regex(/^#[0-9a-fA-F]{6}$/), accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict();
  const flyerSettingsQuery = `SELECT t.id tournament_id,coalesce(s.template_key,'forest') template,coalesce(s.size_code,'square') size,coalesce(s.format,'png') format,
    coalesce(s.primary_color,'#102B2B') primary_color,coalesce(s.accent_color,'#A9E1B9') accent_color,coalesce(s.revision,0) revision,
    coalesce(s.cup_logo_id,t.emblem_id) cup_logo_id,coalesce(s.organizer_logo_id,o.logo_id) organizer_logo_id,s.federation_logo_id
    FROM tournaments t JOIN organizations o ON o.id=t.organization_id LEFT JOIN tournament_flyer_settings s ON s.organization_id=t.organization_id AND s.tournament_id=t.id
    WHERE t.organization_id=$1 AND t.id=$2`;
  app.get('/api/v1/organizations/:id/tournaments/:tournamentId/flyer-settings', async (request) => {
    const {id,tournamentId}=request.params as {id:string;tournamentId:string},org=uuid(id),tournament=uuid(tournamentId);await organizationAccess(request,org);
    const {rows:[settings]}=await pool.query(flyerSettingsQuery,[org,tournament]);if(!settings)fail(404,'NOT_FOUND','No se encontró el torneo en tu organización.');return settings;
  });
  app.patch('/api/v1/organizations/:id/tournaments/:tournamentId/flyer-settings', async (request) => {
    const {id,tournamentId}=request.params as {id:string;tournamentId:string},org=uuid(id),tournament=uuid(tournamentId),actor=await organizationAccess(request,org,true),input=flyerSettingsSchema.parse(request.body);
    return transaction(pool,async(client)=>{
      const {rows:[owner]}=await client.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,tournament]);if(!owner)fail(404,'NOT_FOUND','No se encontró el torneo en tu organización.');
      const {rows:[current]}=await client.query('SELECT revision FROM tournament_flyer_settings WHERE organization_id=$1 AND tournament_id=$2 FOR UPDATE',[org,tournament]);
      if((current?.revision||0)!==input.revision)fail(409,'STALE_VERSION','El diseño cambió en otra pantalla. Actualizá antes de guardar.');
      await client.query(`INSERT INTO tournament_flyer_settings(organization_id,tournament_id,template_key,size_code,format,primary_color,accent_color)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (organization_id,tournament_id) DO UPDATE SET template_key=EXCLUDED.template_key,size_code=EXCLUDED.size_code,format=EXCLUDED.format,
        primary_color=EXCLUDED.primary_color,accent_color=EXCLUDED.accent_color,revision=tournament_flyer_settings.revision+1`,[org,tournament,input.template,input.size,input.format,input.primaryColor,input.accentColor]);
      await audit(client,actor.user_id,org,'flyer.settings_changed',tournament,'Diseño de flyers actualizado',null,{template:input.template,size:input.size,format:input.format,primaryColor:input.primaryColor,accentColor:input.accentColor});
      const {rows:[settings]}=await client.query(flyerSettingsQuery,[org,tournament]);return settings;
    });
  });
  const flyerLogoColumn={cup:'cup_logo_id',organizer:'organizer_logo_id',federation:'federation_logo_id'} as const;
  app.post('/api/v1/organizations/:id/tournaments/:tournamentId/flyer-settings/logos/:slot', async (request,reply) => {
    const {id,tournamentId,slot}=request.params as {id:string;tournamentId:string;slot:string},org=uuid(id),tournament=uuid(tournamentId),actor=await organizationAccess(request,org,true);
    if(!(slot in flyerLogoColumn))fail(400,'INVALID_SLOT','Logo desconocido.');const column=flyerLogoColumn[slot as keyof typeof flyerLogoColumn];
    const {rowCount:present}=await pool.query('SELECT 1 FROM tournaments WHERE organization_id=$1 AND id=$2',[org,tournament]);if(!present)fail(404,'NOT_FOUND','No se encontró el torneo en tu organización.');
    const file=await request.file();if(!file)fail(400,'FILE_REQUIRED','Elegí una imagen PNG, JPG o WebP.');const data=await file!.toBuffer(),{contentType,extension}=imageFormat(data,file!.mimetype);
    const mediaId=randomUUID(),filename=`${mediaId}.${extension}`;await mkdir(config.mediaDir,{recursive:true});await writeFile(resolve(config.mediaDir,filename),data,{flag:'wx'});
    try{await transaction(pool,async(client)=>{
      await client.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,tournament]);
      await client.query('INSERT INTO media(id,organization_id,filename,content_type,byte_length,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[mediaId,org,filename,contentType,data.length,digest(data),actor.user_id]);
      await client.query(`INSERT INTO tournament_flyer_settings(organization_id,tournament_id,${column}) VALUES($1,$2,$3)
        ON CONFLICT (organization_id,tournament_id) DO UPDATE SET ${column}=EXCLUDED.${column},revision=tournament_flyer_settings.revision+1`,[org,tournament,mediaId]);
      await audit(client,actor.user_id,org,'flyer.logo_changed',tournament,'Logo de flyer cargado',null,{slot,mediaId});
    });}catch(error){await unlink(resolve(config.mediaDir,filename));throw error;}
    return reply.code(201).send({id:mediaId,slot});
  });
  app.get('/api/v1/organizations/:id/tournaments/:tournamentId/flyer-settings/logos/:slot', async (request,reply) => {
    const {id,tournamentId,slot}=request.params as {id:string;tournamentId:string;slot:string},org=uuid(id),tournament=uuid(tournamentId);await organizationAccess(request,org);
    if(!(slot in flyerLogoColumn))fail(400,'INVALID_SLOT','Logo desconocido.');const column=flyerLogoColumn[slot as keyof typeof flyerLogoColumn];
    const {rows:[settings]}=await pool.query(flyerSettingsQuery,[org,tournament]);if(!settings)fail(404,'NOT_FOUND','No se encontró el torneo en tu organización.');const mediaId=settings[column];if(!mediaId)fail(404,'NOT_FOUND','Este logo aún no está cargado.');
    const {rows:[media]}=await pool.query('SELECT filename,content_type FROM media WHERE organization_id=$1 AND id=$2',[org,mediaId]);if(!media||!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename))fail(404,'NOT_FOUND','Este logo no está disponible.');
    return reply.type(media.content_type).send(await readFile(resolve(config.mediaDir,media.filename)));
  });
  app.get('/api/v1/public/organizations/:id/tournaments/:tournamentId/emblem', async (request, reply) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    const { rows: [media] } = await pool.query(`SELECT m.filename,m.content_type FROM tournaments t
      JOIN organizations o ON o.id=t.organization_id AND o.status='active'
      JOIN media m ON m.organization_id=t.organization_id AND m.id=t.emblem_id
      WHERE t.organization_id=$1 AND t.id=$2 AND (EXISTS (SELECT 1 FROM editions ed JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
        JOIN rule_versions r ON r.organization_id=c.organization_id AND r.category_id=c.id AND r.status='published'
        WHERE ed.organization_id=t.organization_id AND ed.tournament_id=t.id AND ed.status='published' AND c.status='published' AND t.status='published')
      OR EXISTS (SELECT 1 FROM editions ed JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
        JOIN fixture_position_blueprints b ON b.organization_id=c.organization_id AND b.category_id=c.id
        JOIN fixture_position_publications p ON p.organization_id=b.organization_id AND p.blueprint_id=b.id
        WHERE ed.organization_id=t.organization_id AND ed.tournament_id=t.id))`, [organizationId, tournament]);
    if (!media) fail(404, 'NOT_FOUND', 'No hay emblema público para este torneo.');
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el archivo.');
    return reply.header('Cache-Control','public, max-age=60, stale-while-revalidate=300').type(media.content_type).send(await readFile(resolve(config.mediaDir, media.filename)));
  });
  app.post('/api/v1/organizations/:id/tournaments', async (request, reply) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const actor = await organizationAccess(request, organizationId, true);
    const input = tournamentSetupSchema.parse(request.body);
    const configuredCards=new Set((input.rules.advanced?.discipline.customCards||[]).map(card=>card.code));
    if(Object.keys(input.paymentRates?.customCardRates||{}).some(code=>!configuredCards.has(code)))fail(400,'CARD_UNKNOWN','La tarifa corresponde a una tarjeta que no está en este reglamento.');
    try { new Intl.DateTimeFormat('es-PY', { timeZone: input.timezone }).format(); }
    catch { fail(400, 'INVALID_TIMEZONE', 'Elegí una zona horaria válida.'); }
    const fingerprint = digest(JSON.stringify({ organizationId, ...input, requestId: undefined }));
    const result = await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,43))', [input.requestId]);
      const { rows: [existing] } = await client.query('SELECT id,organization_id,creation_fingerprint FROM tournaments WHERE request_key=$1', [input.requestId]);
      if (existing) {
        if (existing.organization_id !== organizationId || existing.creation_fingerprint !== fingerprint) fail(409, 'REQUEST_CHANGED', 'Esta solicitud ya creó otro torneo. Revisá la lista antes de crear uno nuevo.');
        const { rows: [initial] } = await client.query('SELECT c.id FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id WHERE e.organization_id=$1 AND e.tournament_id=$2 ORDER BY c.created_at,c.id LIMIT 1', [organizationId, existing.id]);
        return { tournamentId: existing.id, categoryId: initial.id, reused: true };
      }
      const tournamentId = randomUUID(), editionId = randomUUID(), categoryId = randomUUID(), ruleId = randomUUID();
      await client.query('INSERT INTO tournaments(id,organization_id,name,timezone,request_key,creation_fingerprint,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [tournamentId, organizationId, input.name, input.timezone, input.requestId, fingerprint, actor.user_id]);
      await client.query('INSERT INTO editions(id,organization_id,tournament_id,name) VALUES($1,$2,$3,$4)', [editionId, organizationId, tournamentId, input.editionName]);
      await client.query('INSERT INTO categories(id,organization_id,edition_id,name,preset,team_limit) VALUES($1,$2,$3,$4,$5,$6)', [categoryId, organizationId, editionId, input.categoryName, input.preset, input.teamLimit]);
      await client.query('INSERT INTO rule_versions(id,organization_id,category_id,version,rules,created_by) VALUES($1,$2,$3,1,$4,$5)', [ruleId, organizationId, categoryId, JSON.stringify(input.rules), actor.user_id]);
      const customCardRates=Object.fromEntries(Object.entries(input.paymentRates?.customCardRates||{}).map(([code,amount])=>[`${categoryId}:${code}`,amount]));
      await client.query('INSERT INTO tournament_payment_rates(id,organization_id,tournament_id,version,yellow_guaranies,red_guaranies,custom_card_rates,created_by) VALUES($1,$2,$3,1,$4,$5,$6,$7)', [randomUUID(),organizationId,tournamentId,input.paymentRates?.yellowGuaranies ?? 0,input.paymentRates?.redGuaranies ?? 0,JSON.stringify(customCardRates),actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'tournament.created', tournamentId, 'Torneo y reglamento inicial en borrador', null, { editionId, categoryId, preset: input.preset });
      return { tournamentId, editionId, categoryId, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/tournaments/:tournamentId/categories', async (request, reply) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = categoryAddSchema.parse(request.body);
    const fingerprint = digest(JSON.stringify({ organizationId, tournament, ...input, requestId: undefined }));
    const result = await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,45))', [input.requestId]);
      const { rows: [existing] } = await client.query('SELECT id,organization_id,creation_fingerprint FROM categories WHERE request_key=$1', [input.requestId]);
      if (existing) {
        if (existing.organization_id !== organizationId || existing.creation_fingerprint !== fingerprint) fail(409, 'REQUEST_CHANGED', 'Esta solicitud ya creó otra categoría. Revisá el torneo.');
        return { categoryId: existing.id, reused: true };
      }
      const { rows: [current] } = await client.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, tournament]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró el torneo en esta organización.');
      let { rows: [edition] } = await client.query('SELECT id FROM editions WHERE organization_id=$1 AND tournament_id=$2 AND name=$3', [organizationId, tournament, input.editionName]);
      if (!edition) { edition = { id: randomUUID() }; await client.query('INSERT INTO editions(id,organization_id,tournament_id,name) VALUES($1,$2,$3,$4)', [edition.id, organizationId, tournament, input.editionName]); }
      const categoryId = randomUUID(), ruleId = randomUUID();
      await client.query('INSERT INTO categories(id,organization_id,edition_id,name,preset,team_limit,request_key,creation_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [categoryId, organizationId, edition.id, input.categoryName, input.preset, input.teamLimit, input.requestId, fingerprint]);
      await client.query('INSERT INTO rule_versions(id,organization_id,category_id,version,rules,created_by) VALUES($1,$2,$3,1,$4,$5)', [ruleId, organizationId, categoryId, JSON.stringify(input.rules), actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'category.created', categoryId, 'Categoría y reglamento en borrador', null, { tournamentId: tournament, editionId: edition.id, preset: input.preset });
      return { categoryId, editionId: edition.id, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/rules/draft', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = ruleEditSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [categoryRow] } = await client.query('SELECT id FROM categories WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, category]);
      if (!categoryRow) fail(404, 'NOT_FOUND', 'No se encontró la categoría en esta organización.');
      const { rowCount: fixedFormat }=await client.query('SELECT 1 FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2', [organizationId,category]);
      if(fixedFormat && (input.rules.initialPhase!==null || input.rules.competitionPlan!==null)) fail(409,'FORMAT_LOCKED','El formato de esta Copa está fijado en su plan de posiciones. Podés editar las demás reglas.');
      const { rows: [latest] } = await client.query('SELECT id,version,revision,status FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE', [organizationId, category]);
      if (!latest || latest.revision !== input.expectedRevision) fail(409, 'STALE_VERSION', 'El reglamento cambió. Actualizá antes de guardar.');
      if (latest.status === 'draft') {
        const { rows: [updated] } = await client.query('UPDATE rule_versions SET rules=$1,revision=revision+1 WHERE id=$2 RETURNING id,version,revision,status,rules', [JSON.stringify(input.rules), latest.id]);
        await audit(client, actor.user_id, organizationId, 'rules.draft_changed', updated.id, input.reason, { version: latest.version, revision: latest.revision }, { version: updated.version, revision: updated.revision });
        return updated;
      }
      const ruleId = randomUUID();
      const { rows: [created] } = await client.query('INSERT INTO rule_versions(id,organization_id,category_id,version,rules,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version,revision,status,rules', [ruleId, organizationId, category, latest.version + 1, JSON.stringify(input.rules), actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'rules.draft_created', ruleId, input.reason, { publishedVersion: latest.version }, { draftVersion: created.version });
      return created;
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/rules/publish', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = publishSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [categoryRow] } = await client.query('SELECT c.id,c.edition_id,c.team_limit,e.tournament_id FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id WHERE c.organization_id=$1 AND c.id=$2 FOR UPDATE OF c', [organizationId, category]);
      if (!categoryRow) fail(404, 'NOT_FOUND', 'No se encontró la categoría en esta organización.');
      const { rowCount: fixedFormat }=await client.query('SELECT 1 FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2', [organizationId,category]);
      if(fixedFormat && !input.fixedFormatConfirmed) fail(409,'FORMAT_CONFIRMATION_REQUIRED','Revisá y confirmá los puntos y desempates de esta Copa antes de publicar su reglamento.');
      const { rows: [latest] } = await client.query('SELECT id,version,revision,status,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE', [organizationId, category]);
      if (!latest || latest.status !== 'draft' || latest.revision !== input.expectedRevision) fail(409, 'STALE_VERSION', 'El borrador cambió o ya fue publicado. Actualizá antes de publicar.');
      const validated = ruleSchema.safeParse(latest.rules);
      if (!validated.success) fail(400, 'INVALID_RULES', 'El borrador tiene límites incompatibles. Revisá la planilla y los cambios antes de publicar.');
      if (!validated.data?.substitutions) fail(400, 'SUBSTITUTIONS_REQUIRED', 'Elegí cómo se permiten los cambios antes de publicar el reglamento.');
      if (!validated.data?.eligibility) fail(400, 'ELIGIBILITY_REQUIRED', 'Definí los requisitos de edad y documentos, aunque no haya restricciones adicionales.');
      const age = validated.data?.eligibility?.age;
      if (age && age.minYears === null && age.maxYears === null) fail(400, 'AGE_LIMIT_REQUIRED', 'Indicá una edad mínima o máxima, o quitá el límite de edad.');
      if (age?.reference === 'fixed_date' && !age.fixedDate) fail(400, 'AGE_DATE_REQUIRED', 'Elegí una fecha de corte válida antes de publicar.');
      if (!validated.data?.advanced) fail(400, 'ADVANCED_RULES_REQUIRED', 'Definí tarjetas, walkover y desempates antes de publicar.');
      const phase = validated.data?.initialPhase;
      if (!fixedFormat && !phase) fail(400, 'INITIAL_PHASE_REQUIRED', 'Elegí la fase inicial antes de publicar.');
      if (!fixedFormat && phase?.mode === 'groups' && categoryRow.team_limit !== null && phase.groupCount! * 2 > categoryRow.team_limit) fail(400, 'GROUP_LIMIT', 'El límite de equipos no alcanza para dos equipos por grupo.');
      const qualification = validated.data?.competitionPlan?.qualification;
      if (!fixedFormat && categoryRow.team_limit !== null && qualification) {
        const planned = qualification.from === 'direct' ? qualification.entrants : qualification.from === 'league' ? qualification.top : (phase?.groupCount ?? 0) * qualification.perGroup + qualification.bestRemaining;
        if (planned > categoryRow.team_limit) fail(400, 'QUALIFICATION_LIMIT', 'Los clasificados previstos superan el límite de equipos de la categoría.');
      }
      const { rows: [published] } = await client.query("UPDATE rule_versions SET status='published',effective_at=now() WHERE id=$1 RETURNING id,version,revision,status,effective_at", [latest.id]);
      await client.query("UPDATE categories SET status='published' WHERE id=$1", [category]);
      await client.query("UPDATE editions SET status='published' WHERE id=$1", [categoryRow.edition_id]);
      await client.query("UPDATE tournaments SET status='published',published_at=COALESCE(published_at,now()) WHERE id=$1", [categoryRow.tournament_id]);
      const visibleTeams=await client.query("UPDATE team_entries SET public_visible=true WHERE organization_id=$1 AND category_id=$2 AND status='active'", [organizationId,category]);
      await audit(client, actor.user_id, organizationId, 'rules.published', latest.id, input.reason, null, { categoryId: category, version: latest.version, visibleTeams: visibleTeams.rowCount, fixedFormatConfirmed:!!input.fixedFormatConfirmed });
      return published;
    });
  });
  app.get('/api/v1/organizations/:id/tournaments/:tournamentId/resources', async (request) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    await organizationAccess(request, organizationId);
    const present = await pool.query('SELECT 1 FROM tournaments WHERE organization_id=$1 AND id=$2', [organizationId, tournament]);
    if (!present.rowCount) fail(404, 'NOT_FOUND', 'No se encontró el torneo en esta organización.');
    const [venues, sponsors] = await Promise.all([
      pool.query('SELECT v.id,v.name,v.city,tv.created_at FROM tournament_venues tv JOIN venues v ON v.organization_id=tv.organization_id AND v.id=tv.venue_id WHERE tv.organization_id=$1 AND tv.tournament_id=$2 AND tv.archived_at IS NULL ORDER BY v.name,v.id', [organizationId, tournament]),
      pool.query('SELECT s.id,s.name,ts.public_visible,ts.created_at FROM tournament_sponsors ts JOIN sponsors s ON s.organization_id=ts.organization_id AND s.id=ts.sponsor_id WHERE ts.organization_id=$1 AND ts.tournament_id=$2 AND ts.archived_at IS NULL ORDER BY s.name,s.id', [organizationId, tournament]),
    ]);
    return { venues: venues.rows, sponsors: sponsors.rows };
  });
  app.post('/api/v1/organizations/:id/tournaments/:tournamentId/venues', async (request, reply) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = venueCreateSchema.parse(request.body), venueId = randomUUID();
    await transaction(pool, async (client) => {
      const present = await client.query('SELECT 1 FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, tournament]);
      if (!present.rowCount) fail(404, 'NOT_FOUND', 'No se encontró el torneo en esta organización.');
      await client.query('INSERT INTO venues(id,organization_id,name,city) VALUES($1,$2,$3,$4)', [venueId, organizationId, input.name, input.city]);
      await client.query('INSERT INTO tournament_venues(organization_id,tournament_id,venue_id,created_by) VALUES($1,$2,$3,$4)', [organizationId, tournament, venueId, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'venue.added', venueId, 'Sede asociada al torneo', null, { tournamentId: tournament, name: input.name });
    });
    return reply.code(201).send({ id: venueId });
  });
  app.post('/api/v1/organizations/:id/tournaments/:tournamentId/sponsors', async (request, reply) => {
    const { id, tournamentId } = request.params as { id: string; tournamentId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = sponsorCreateSchema.parse(request.body), sponsorId = randomUUID();
    await transaction(pool, async (client) => {
      const present = await client.query('SELECT 1 FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, tournament]);
      if (!present.rowCount) fail(404, 'NOT_FOUND', 'No se encontró el torneo en esta organización.');
      await client.query('INSERT INTO sponsors(id,organization_id,name) VALUES($1,$2,$3)', [sponsorId, organizationId, input.name]);
      await client.query('INSERT INTO tournament_sponsors(organization_id,tournament_id,sponsor_id,created_by) VALUES($1,$2,$3,$4)', [organizationId, tournament, sponsorId, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'sponsor.added', sponsorId, 'Patrocinador privado asociado al torneo', null, { tournamentId: tournament, name: input.name });
    });
    return reply.code(201).send({ id: sponsorId, publicVisible: false });
  });
  app.post('/api/v1/organizations/:id/tournaments/:tournamentId/sponsors/:sponsorId/publication', async (request) => {
    const { id, tournamentId, sponsorId } = request.params as { id: string; tournamentId: string; sponsorId: string };
    const organizationId = uuid(id), tournament = uuid(tournamentId), sponsor = uuid(sponsorId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = sponsorPublicationSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT public_visible FROM tournament_sponsors WHERE organization_id=$1 AND tournament_id=$2 AND sponsor_id=$3 AND archived_at IS NULL FOR UPDATE', [organizationId, tournament, sponsor]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró el patrocinador en este torneo.');
      if (current.public_visible === input.publicVisible) return { id: sponsor, publicVisible: current.public_visible, reused: true };
      await client.query('UPDATE tournament_sponsors SET public_visible=$4 WHERE organization_id=$1 AND tournament_id=$2 AND sponsor_id=$3', [organizationId, tournament, sponsor, input.publicVisible]);
      await audit(client, actor.user_id, organizationId, 'sponsor.publication_changed', sponsor, input.reason, { tournamentId: tournament, publicVisible: current.public_visible }, { tournamentId: tournament, publicVisible: input.publicVisible });
      return { id: sponsor, publicVisible: input.publicVisible };
    });
  });
  for (const kind of ['venues', 'sponsors'] as const) {
    const table = kind === 'venues' ? 'tournament_venues' : 'tournament_sponsors';
    const idColumn = kind === 'venues' ? 'venue_id' : 'sponsor_id';
    app.post(`/api/v1/organizations/:id/tournaments/:tournamentId/${kind}/:resourceId/archive`, async (request) => {
      const { id, tournamentId, resourceId } = request.params as { id: string; tournamentId: string; resourceId: string };
      const organizationId = uuid(id), tournament = uuid(tournamentId), resource = uuid(resourceId);
      const actor = await organizationAccess(request, organizationId, true);
      const { reason } = reasonSchema.parse(request.body);
      return transaction(pool, async (client) => {
        const { rows: [current] } = await client.query(`SELECT archived_at FROM ${table} WHERE organization_id=$1 AND tournament_id=$2 AND ${idColumn}=$3 FOR UPDATE`, [organizationId, tournament, resource]);
        if (!current) fail(404, 'NOT_FOUND', 'No se encontró el recurso en este torneo.');
        if (current.archived_at) return { id: resource, archived: true, reused: true };
        await client.query(`UPDATE ${table} SET archived_at=now() WHERE organization_id=$1 AND tournament_id=$2 AND ${idColumn}=$3`, [organizationId, tournament, resource]);
        await audit(client, actor.user_id, organizationId, `${kind}.archived`, resource, reason, { tournamentId: tournament, archived: false }, { tournamentId: tournament, archived: true });
        return { id: resource, archived: true };
      });
    });
  }
  const publicTournamentCondition = `(t.status='published' AND EXISTS (SELECT 1 FROM editions ed JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
    JOIN rule_versions r ON r.organization_id=c.organization_id AND r.category_id=c.id AND r.status='published'
    WHERE ed.organization_id=t.organization_id AND ed.tournament_id=t.id AND ed.status='published' AND c.status='published'))
    OR EXISTS (SELECT 1 FROM editions pe JOIN categories pc ON pc.organization_id=pe.organization_id AND pc.edition_id=pe.id
    JOIN fixture_position_blueprints pb ON pb.organization_id=pc.organization_id AND pb.category_id=pc.id
    JOIN fixture_position_publications pp ON pp.organization_id=pb.organization_id AND pp.blueprint_id=pb.id
    WHERE pe.organization_id=t.organization_id AND pe.tournament_id=t.id)`;
  app.get('/api/v1/public/organizations', async () => {
    const { rows } = await pool.query(`SELECT o.id,o.name,o.public_slug,(o.logo_id IS NOT NULL) has_logo,count(*)::int tournament_count,
      CASE WHEN count(*)=1 THEN (array_agg(t.id))[1] ELSE NULL END single_tournament_id,
      CASE WHEN count(*)=1 THEN max(t.public_slug) ELSE NULL END single_tournament_slug
      FROM organizations o JOIN tournaments t ON t.organization_id=o.id
      WHERE o.status='active' AND (${publicTournamentCondition})
      GROUP BY o.id ORDER BY o.name,o.id LIMIT 500`);
    return rows;
  });
  app.get('/api/v1/public/tournaments', async (request) => {
    const { q } = z.object({ q: z.string().trim().max(80).default('') }).strict().parse(request.query);
    const term = q.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const { rows } = await pool.query(`SELECT t.id,t.name,t.public_slug,(t.emblem_id IS NOT NULL) has_emblem,o.id organization_id,o.name organization_name,o.public_slug organization_slug
      FROM tournaments t JOIN organizations o ON o.id=t.organization_id
      WHERE o.status='active'
        AND ($1='' OR position($1 in translate(lower(t.name),'áéíóúüñ','aeiouun'))>0)
        AND (${publicTournamentCondition})
      ORDER BY t.created_at DESC,t.id LIMIT 100`, [term]);
    return rows;
  });
  app.get('/api/v1/public/tournaments/by-slug/:slug', async (request) => {
    const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).parse((request.params as {slug:string}).slug);
    const {rows:[found]}=await pool.query(`SELECT t.id,t.name,t.public_slug,t.organization_id,o.public_slug organization_slug FROM tournaments t
      JOIN organizations o ON o.id=t.organization_id WHERE t.public_slug=$1 AND o.status='active' AND (${publicTournamentCondition})`,[slug]);
    if(!found)fail(404,'NOT_FOUND','No se encontró este torneo público.');
    return found;
  });
  app.get('/api/v1/public/organizations/:id/tournaments', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const { rows: [organization] } = await pool.query("SELECT id,name,accent,logo_id,public_slug FROM organizations WHERE id=$1 AND status='active'", [organizationId]);
    if (!organization) fail(404, 'NOT_FOUND', 'No se encontró contenido público de esta organización.');
    const { rows } = await pool.query(tournamentRows, [organizationId, null, true]);
    const { rows: teams } = await pool.query(`SELECT t.id,t.name,t.color,(t.shield_id IS NOT NULL) has_shield,e.id entry_id,e.category_id FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments tr ON tr.organization_id=ed.organization_id AND tr.id=ed.tournament_id WHERE e.organization_id=$1 AND e.status='active' AND e.public_visible AND c.status='published' AND ed.status='published' AND tr.status='published' ORDER BY t.name LIMIT 200`, [organizationId]);
    const { rows: sponsors } = await pool.query(`SELECT ts.tournament_id,s.id,s.name FROM tournament_sponsors ts JOIN sponsors s ON s.organization_id=ts.organization_id AND s.id=ts.sponsor_id JOIN tournaments t ON t.organization_id=ts.organization_id AND t.id=ts.tournament_id WHERE ts.organization_id=$1 AND ts.archived_at IS NULL AND ts.public_visible AND t.status='published' ORDER BY s.name LIMIT 200`, [organizationId]);
    return { organization, tournaments: rows, teams, sponsors };
  });
  app.get('/api/v1/public/organizations/:id/draws', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const { rows } = await pool.query(`SELECT DISTINCT ON (t.id) t.id tournament_id,t.name tournament_name,t.public_slug,(t.emblem_id IS NOT NULL) has_emblem,c.id category_id,c.name category_name,pp.revision,pp.snapshot,pp.published_at
      FROM fixture_position_publications pp JOIN fixture_position_blueprints bp ON bp.organization_id=pp.organization_id AND bp.id=pp.blueprint_id
      JOIN categories c ON c.organization_id=bp.organization_id AND c.id=bp.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id JOIN organizations o ON o.id=t.organization_id
      WHERE pp.organization_id=$1 AND o.status='active' ORDER BY t.id,pp.revision DESC,pp.published_at DESC`, [organizationId]);
    return rows;
  });
  app.get('/api/v1/public/organizations/:id/draws/:categoryId/competition',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};
    const organizationId=uuid(id),category=uuid(categoryId);
    const {rowCount}=await pool.query(`SELECT 1 FROM fixture_position_blueprints b JOIN fixture_position_publications p ON p.organization_id=b.organization_id AND p.blueprint_id=b.id
      JOIN organizations o ON o.id=b.organization_id AND o.status='active' WHERE b.organization_id=$1 AND b.category_id=$2 LIMIT 1`,[organizationId,category]);
    if(!rowCount)fail(404,'DRAW_NOT_PUBLIC','No se encontró una Copa pública.');
    const state=await positionCompetitionState(pool,organizationId,category,true);
    if(!state?.rulesPublished||!state.preparedMatches)return {available:false};
    const names=await playerStatNames(pool,organizationId,state.playerTotals.map(player=>player.registrationId));
    return {available:true,competition:state.competition,results:state.results,matches:state.matches.filter(match=>match.day_status==='published'),players:state.playerTotals.filter(player=>names.get(player.registrationId)?.publicName).map(player=>({...player,name:names.get(player.registrationId)!.name})),defense:state.defense,titleTie:state.titleTie,titleExtra:state.titleExtra&&state.titleExtra.dayStatus==='published'?state.titleExtra:state.titleExtra?.decision==='no_extra'?state.titleExtra:null};
  });
  app.get('/api/v1/public/organizations/:id/draws/:categoryId/teams/:entryId/players',async request=>{
    const {id,categoryId,entryId}=request.params as {id:string;categoryId:string;entryId:string};
    const organizationId=uuid(id),category=uuid(categoryId),entry=uuid(entryId);
    const {rows:[publication]}=await pool.query(`SELECT p.snapshot FROM fixture_position_publications p
      JOIN fixture_position_blueprints b ON b.organization_id=p.organization_id AND b.id=p.blueprint_id
      JOIN organizations o ON o.id=p.organization_id AND o.status='active'
      WHERE p.organization_id=$1 AND b.category_id=$2 ORDER BY p.revision DESC LIMIT 1`,[organizationId,category]);
    const publicTeams=publication?.snapshot?.teams as Array<{entry_id:string}>|undefined;
    if(!publicTeams?.some(team=>team.entry_id===entry))fail(404,'TEAM_NOT_PUBLIC','No se encontró el equipo público.');
    const {rows}=await pool.query(`SELECT p.given_names,p.family_names FROM player_registrations pr
      JOIN team_entries e ON e.organization_id=pr.organization_id AND e.id=pr.entry_id
      JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
      JOIN player_publications pub ON pub.organization_id=pr.organization_id AND pub.registration_id=pr.id AND pub.visible
      WHERE pr.organization_id=$1 AND pr.entry_id=$2 AND e.category_id=$3 AND e.status='active'
        AND pr.status<>'rejected' AND pr.reverted_at IS NULL
      ORDER BY p.given_names,p.family_names,pr.id LIMIT 500`,[organizationId,entry,category]);
    return rows.map(player=>({name:`${player.given_names} ${player.family_names}`}));
  });
  app.get('/api/v1/public/organizations/:id/draws/teams/:teamId/shield', async (request, reply) => {
    const { id, teamId } = request.params as { id:string; teamId:string };
    const organizationId=uuid(id),team=uuid(teamId);
    const { rows:[media] }=await pool.query(`SELECT m.filename,m.content_type FROM teams t JOIN organizations o ON o.id=t.organization_id AND o.status='active'
      JOIN media m ON m.organization_id=t.organization_id AND m.id=t.shield_id
      WHERE t.organization_id=$1 AND t.id=$2 AND EXISTS (SELECT 1 FROM fixture_position_publications p WHERE p.organization_id=t.organization_id AND (p.snapshot->'slots' @> jsonb_build_array(jsonb_build_object('team_id',t.id)) OR p.snapshot->'teams' @> jsonb_build_array(jsonb_build_object('team_id',t.id))) LIMIT 1)`,[organizationId,team]);
    if(!media)fail(404,'NOT_FOUND','No hay escudo público para este equipo.');
    if(!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename))fail(500,'INVALID_FILE','No se pudo abrir el archivo.');
    return reply.header('Cache-Control','public, max-age=60, stale-while-revalidate=300').type(media.content_type).send(await readFile(resolve(config.mediaDir,media.filename)));
  });

  app.get('/api/v1/organizations/:id/categories', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    await organizationAccess(request, organizationId, true);
    return (await pool.query('SELECT c.id,c.name category_name,c.team_limit,e.name edition_name,t.name tournament_name FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id JOIN tournaments t ON t.organization_id=e.organization_id AND t.id=e.tournament_id WHERE c.organization_id=$1 ORDER BY t.name,e.name,c.name LIMIT 200', [organizationId])).rows;
  });
  const teamRows = `SELECT t.id,t.name,t.color,(t.shield_id IS NOT NULL) has_shield,e.id entry_id,e.category_id,e.status,e.public_visible,c.name category_name,ed.name edition_name,tr.name tournament_name,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',cm.id,'name',cm.name,'title',cm.title,'status',cm.status,'valid_from',to_char(cm.valid_from,'YYYY-MM-DD'),'valid_until',to_char(cm.valid_until,'YYYY-MM-DD'),'ended_at',cm.ended_at) ORDER BY cm.created_at) FROM commission_members cm WHERE cm.organization_id=e.organization_id AND cm.entry_id=e.id),'[]'::jsonb) commission,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'role',s.role,'status',s.status) ORDER BY s.created_at) FROM team_staff s WHERE s.organization_id=e.organization_id AND s.entry_id=e.id),'[]'::jsonb) staff,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',u.display_name,'username',u.username,'status',m.status,'assignment',CASE WHEN a.revoked_at IS NULL THEN 'active' ELSE 'revoked' END,'revoked_at',a.revoked_at) ORDER BY a.created_at) FROM team_admin_assignments a JOIN memberships m ON m.organization_id=a.organization_id AND m.id=a.membership_id JOIN users u ON u.id=m.user_id WHERE a.organization_id=e.organization_id AND a.entry_id=e.id AND ($3::boolean OR a.revoked_at IS NULL)),'[]'::jsonb) administrators
    FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
    JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id
    JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
    JOIN tournaments tr ON tr.organization_id=ed.organization_id AND tr.id=ed.tournament_id
    WHERE e.organization_id=$1 AND ($2::uuid IS NULL OR t.id=$2) AND ($3::boolean OR EXISTS(SELECT 1 FROM team_admin_assignments a WHERE a.organization_id=e.organization_id AND a.entry_id=e.id AND a.membership_id=$4 AND a.revoked_at IS NULL))
    ORDER BY t.name,c.name,e.id LIMIT 200`;
  async function teamScope(request: FastifyRequest, organizationId: string) {
    const auth = await organizationAccess(request, organizationId);
    const { rows: [member] } = await pool.query("SELECT id,role FROM memberships WHERE organization_id=$1 AND user_id=$2 AND status='active'", [organizationId, auth.user_id]);
    if (member?.role === 'tournament_admin') return { organizer: true, membershipId: member.id as string };
    if (member?.role === 'team_admin') {
      const { rowCount } = await pool.query('SELECT 1 FROM team_admin_assignments WHERE organization_id=$1 AND membership_id=$2 AND revoked_at IS NULL LIMIT 1', [organizationId, member.id]);
      if (rowCount) return { organizer: false, membershipId: member.id as string };
    }
    return fail(403, 'TEAM_SCOPE_DENIED', 'No tenés permiso para consultar equipos.');
  }
  app.get('/api/v1/organizations/:id/review-inbox', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const scope = await teamScope(request, organizationId);
    const { offset } = z.object({ offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().parse(request.query);
    const { rows } = await pool.query(`WITH visible AS (
      SELECT e.id entry_id,t.id team_id,t.name team_name,c.id category_id
      FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
      JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id
      WHERE e.organization_id=$1 AND ($2::boolean OR EXISTS (
        SELECT 1 FROM team_admin_assignments a WHERE a.organization_id=e.organization_id
          AND a.entry_id=e.id AND a.membership_id=$3 AND a.revoked_at IS NULL))
    ), tasks AS (
      SELECT g.id,g.entry_id,'good_faith' kind,g.status state,
        'Lista de buena fe · versión '||g.version summary,g.submitted_at created_at,
        CASE WHEN g.status='submitted' THEN 'organizer' ELSE 'team' END owner,
        'buena-fe/'||g.entry_id target
      FROM good_faith_versions g JOIN visible v ON v.entry_id=g.entry_id
      WHERE g.organization_id=$1 AND g.version=(SELECT max(x.version) FROM good_faith_versions x WHERE x.organization_id=g.organization_id AND x.entry_id=g.entry_id)
        AND (($2::boolean AND g.status='submitted') OR (NOT $2::boolean AND g.status IN ('observed','rejected')))
      UNION ALL
      SELECT c.id,c.entry_id,'commission',c.status,'Comisión · '||c.name||' · '||c.title,c.created_at,'organizer','equipo/'||v.team_id
      FROM commission_members c JOIN visible v ON v.entry_id=c.entry_id
      WHERE c.organization_id=$1 AND $2::boolean AND c.status='proposed'
      UNION ALL
      SELECT d.id,d.entry_id,'document',d.status,'Documento pendiente · '||d.label||' · '||p.given_names||' '||p.family_names,d.uploaded_at,'organizer','jugador/'||d.entry_id||'/'||d.registration_id
      FROM player_documents d JOIN visible v ON v.entry_id=d.entry_id
      JOIN player_registrations r ON r.organization_id=d.organization_id AND r.id=d.registration_id
      JOIN players p ON p.organization_id=r.organization_id AND p.id=r.player_id
      WHERE d.organization_id=$1 AND $2::boolean AND d.status='uploaded'
      UNION ALL
      SELECT m.id,m.entry_id,'movement',m.status,'Procedencia declarada · '||p.given_names||' '||p.family_names,m.declared_at,'organizer','jugador/'||m.entry_id||'/'||m.registration_id
      FROM player_movements m JOIN visible v ON v.entry_id=m.entry_id
      JOIN player_registrations r ON r.organization_id=m.organization_id AND r.id=m.registration_id
      JOIN players p ON p.organization_id=r.organization_id AND p.id=r.player_id
      WHERE m.organization_id=$1 AND $2::boolean AND m.status='declared'
      UNION ALL
      SELECT r.id,r.entry_id,'registration',r.status,'Origen externo · '||p.given_names||' '||p.family_names,r.updated_at,'team','jugador/'||r.entry_id||'/'||r.id
      FROM player_registrations r JOIN visible v ON v.entry_id=r.entry_id
      JOIN players p ON p.organization_id=r.organization_id AND p.id=r.player_id
      WHERE r.organization_id=$1 AND NOT $2::boolean AND r.origin_kind='external' AND r.status IN ('draft','observed','rejected') AND r.reverted_at IS NULL
      UNION ALL
      SELECT c.id,c.entry_id,'discipline',c.status,'Expediente · '||c.summary,c.created_at,'organizer','disciplina/'||c.entry_id
      FROM discipline_cases c JOIN visible v ON v.entry_id=c.entry_id
      WHERE c.organization_id=$1 AND $2::boolean AND c.status IN ('proposed','review','appealed')
      UNION ALL
      SELECT n.id,n.entry_id,'notice','unread','Notificación disciplinaria · '||n.kind,n.created_at,'team','disciplina/'||n.entry_id
      FROM discipline_notices n JOIN visible v ON v.entry_id=n.entry_id
      WHERE n.organization_id=$1 AND NOT $2::boolean AND n.read_at IS NULL
      UNION ALL
      SELECT r.id,m.home_entry_id,'acta',r.status,'Acta · '||h.name||' vs '||a.name,s.created_at,'organizer','partido/'||m.category_id||'/'||m.id
      FROM match_records r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
      JOIN teams h ON h.organization_id=m.organization_id AND h.id=(SELECT team_id FROM team_entries WHERE organization_id=m.organization_id AND id=m.home_entry_id)
      JOIN teams a ON a.organization_id=m.organization_id AND a.id=(SELECT team_id FROM team_entries WHERE organization_id=m.organization_id AND id=m.away_entry_id)
      JOIN match_acta_snapshots s ON s.organization_id=r.organization_id AND s.id=r.submission_id
      WHERE r.organization_id=$1 AND $2::boolean AND r.status='submitted'
      UNION ALL
      SELECT r.id,v.entry_id,'acta_signoff',r.status,'Conformidad de acta · '||h.name||' vs '||a.name,s.created_at,'team','acta-equipo/'||v.entry_id||'/'||m.id
      FROM match_records r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
      JOIN visible v ON v.entry_id IN (m.home_entry_id,m.away_entry_id)
      JOIN teams h ON h.organization_id=m.organization_id AND h.id=(SELECT team_id FROM team_entries WHERE organization_id=m.organization_id AND id=m.home_entry_id)
      JOIN teams a ON a.organization_id=m.organization_id AND a.id=(SELECT team_id FROM team_entries WHERE organization_id=m.organization_id AND id=m.away_entry_id)
      JOIN match_acta_snapshots s ON s.organization_id=r.organization_id AND s.id=r.submission_id
      WHERE r.organization_id=$1 AND NOT $2::boolean AND r.status='submitted' AND NOT EXISTS (
        SELECT 1 FROM match_acta_signoffs f WHERE f.organization_id=r.organization_id AND f.snapshot_id=r.submission_id AND f.entry_id=v.entry_id)
    ) SELECT tasks.*,v.team_name,NULL::timestamptz due_at FROM tasks
      JOIN visible v ON v.entry_id=tasks.entry_id ORDER BY tasks.created_at DESC,tasks.id LIMIT 101 OFFSET $4`,
      [organizationId, scope.organizer, scope.membershipId, offset]);
    return { items: rows.slice(0,100), hasMore: rows.length > 100 };
  });
  app.get('/api/v1/organizations/:id/teams', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const scope = await teamScope(request, organizationId);
    return (await pool.query(teamRows, [organizationId, null, scope.organizer, scope.membershipId])).rows;
  });
  app.get('/api/v1/organizations/:id/teams/:teamId', async (request) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const organizationId = uuid(id); const scope = await teamScope(request, organizationId);
    const { rows } = await pool.query(teamRows, [organizationId, uuid(teamId), scope.organizer, scope.membershipId]);
    if (!rows.length) fail(404, 'NOT_FOUND', 'No se encontró este equipo en tu ámbito.');
    return rows;
  });
  app.patch('/api/v1/organizations/:id/teams/:teamId', async (request) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const organizationId = uuid(id), team = uuid(teamId);
    const actor = await organizationAccess(request, organizationId, true);
    const { name } = teamRenameSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT name FROM teams WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, team]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró este equipo en tu organización.');
      if (current.name === name) return { id: team, name, reused: true };
      const { rowCount } = await client.query('SELECT 1 FROM teams WHERE organization_id=$1 AND id<>$2 AND lower(name)=lower($3)', [organizationId, team, name]);
      if (rowCount) fail(409, 'TEAM_NAME_EXISTS', 'Ya existe un equipo con ese nombre en esta organización.');
      await client.query('UPDATE teams SET name=$1 WHERE organization_id=$2 AND id=$3', [name, organizationId, team]);
      await audit(client, actor.user_id, organizationId, 'team.renamed', team, 'Nombre del equipo corregido', { name: current.name }, { name });
      return { id: team, name, reused: false };
    });
  });
  app.post('/api/v1/organizations/:id/teams', async (request, reply) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const actor = await organizationAccess(request, organizationId, true);
    const input = teamCreateSchema.parse(request.body);
    const fingerprint = digest(JSON.stringify({ organizationId, ...input, requestId: undefined }));
    const result = await transaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,44))', [input.requestId]);
      const { rows: [existing] } = await client.query('SELECT id,organization_id,creation_fingerprint FROM teams WHERE request_key=$1', [input.requestId]);
      if (existing) {
        if (existing.organization_id !== organizationId || existing.creation_fingerprint !== fingerprint) fail(409, 'REQUEST_CHANGED', 'Esta solicitud ya creó otro equipo. Revisá la lista.');
        const { rows: [entry] } = await client.query('SELECT id FROM team_entries WHERE organization_id=$1 AND team_id=$2 AND category_id=$3', [organizationId, existing.id, input.categoryId]);
        return { teamId: existing.id, entryId: entry.id, reused: true };
      }
      const { rows: [category] } = await client.query('SELECT id,team_limit FROM categories WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, input.categoryId]);
      if (!category) fail(404, 'NOT_FOUND', 'No se encontró la categoría en esta organización.');
      if (category.team_limit !== null) {
        const { rows: [count] } = await client.query("SELECT count(*)::int total FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active'", [organizationId, input.categoryId]);
        if (count.total >= category.team_limit) fail(409, 'TEAM_LIMIT', 'La categoría ya llegó al límite de equipos.');
      }
      const teamId = randomUUID(), entryId = randomUUID();
      await client.query('INSERT INTO teams(id,organization_id,name,color,request_key,creation_fingerprint,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [teamId, organizationId, input.name, input.color, input.requestId, fingerprint, actor.user_id]);
      await client.query('INSERT INTO team_entries(id,organization_id,team_id,category_id) VALUES($1,$2,$3,$4)', [entryId, organizationId, teamId, input.categoryId]);
      await audit(client, actor.user_id, organizationId, 'team.created', teamId, 'Equipo creado e inscripto en categoría', null, { entryId, categoryId: input.categoryId });
      return { teamId, entryId, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/teams/:teamId/entries', async (request, reply) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const organizationId = uuid(id), team = uuid(teamId);
    const actor = await organizationAccess(request, organizationId, true);
    const { categoryId } = teamEntrySchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rows: [category] } = await client.query('SELECT id,team_limit FROM categories WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, categoryId]);
      if (!category) fail(404, 'NOT_FOUND', 'No se encontró la categoría en esta organización.');
      const { rows: [currentTeam] } = await client.query('SELECT id FROM teams WHERE organization_id=$1 AND id=$2', [organizationId, team]);
      if (!currentTeam) fail(404, 'NOT_FOUND', 'No se encontró este equipo.');
      const { rows: [existing] } = await client.query('SELECT id FROM team_entries WHERE organization_id=$1 AND team_id=$2 AND category_id=$3', [organizationId, team, categoryId]);
      if (existing) return { entryId: existing.id, reused: true };
      if (category.team_limit !== null) {
        const { rows: [count] } = await client.query("SELECT count(*)::int total FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active'", [organizationId, categoryId]);
        if (count.total >= category.team_limit) fail(409, 'TEAM_LIMIT', 'La categoría ya llegó al límite de equipos.');
      }
      const entryId = randomUUID();
      await client.query('INSERT INTO team_entries(id,organization_id,team_id,category_id) VALUES($1,$2,$3,$4)', [entryId, organizationId, team, categoryId]);
      await audit(client, actor.user_id, organizationId, 'team.entry_added', entryId, 'Equipo inscrito en otra categoría', null, { teamId: team, categoryId });
      return { entryId, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/administrators', async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = teamAdminSchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rows: [entryRow] } = await client.query('SELECT id FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      if (!entryRow) fail(404, 'NOT_FOUND', 'No se encontró esta participación.');
      let { rows: [person] } = await client.query('SELECT id,password_hash FROM users WHERE lower(username)=lower($1)', [input.username]);
      if (!person) { person = { id: randomUUID(), password_hash: null }; await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$2,$3)', [person.id, input.username, input.name]); }
      let { rows: [membership] } = await client.query('SELECT id,role,status FROM memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE', [organizationId, person.id]);
      if (membership && membership.role !== 'team_admin') fail(409, 'ROLE_CONFLICT', 'Esta persona ya tiene otro rol en la organización. Revisá su acceso.');
      if (!membership) { membership = { id: randomUUID(), role: 'team_admin', status: 'pending' }; await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'team_admin','pending')", [membership.id, organizationId, person.id]); }
      const { rows: [existing] } = await client.query('SELECT revoked_at FROM team_admin_assignments WHERE organization_id=$1 AND entry_id=$2 AND membership_id=$3 FOR UPDATE', [organizationId, entry, membership.id]);
      if (existing && !existing.revoked_at) return { membershipId: membership.id, alreadyAssigned: true, invitation: null };
      if (existing) await client.query('UPDATE team_admin_assignments SET revoked_at=NULL,revoked_by=NULL,revocation_reason=NULL,assigned_by=$4,created_at=now() WHERE organization_id=$1 AND entry_id=$2 AND membership_id=$3', [organizationId, entry, membership.id, actor.user_id]);
      else await client.query('INSERT INTO team_admin_assignments(organization_id,entry_id,membership_id,assigned_by) VALUES($1,$2,$3,$4)', [organizationId, entry, membership.id, actor.user_id]);
      await audit(client, actor.user_id, organizationId, existing ? 'team_admin.reassigned' : 'team_admin.assigned', membership.id, 'Administrador asignado a una participación', existing ? { entryId: entry, assignment: 'revoked' } : null, { entryId: entry, assignment: 'active' });
      const invitation = membership.status === 'pending' ? await newInvitation(client, actor.user_id, person.id, organizationId, 'invite') : null;
      return { membershipId: membership.id, alreadyAssigned: false, invitation };
    });
    return reply.code(result.alreadyAssigned ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/administrators/:membershipId/revoke', async (request) => {
    const { id, entryId, membershipId } = request.params as { id: string; entryId: string; membershipId: string };
    const organizationId = uuid(id), entry = uuid(entryId), membership = uuid(membershipId);
    const actor = await organizationAccess(request, organizationId, true);
    const { reason } = reasonSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT revoked_at FROM team_admin_assignments WHERE organization_id=$1 AND entry_id=$2 AND membership_id=$3 FOR UPDATE', [organizationId, entry, membership]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró esa asignación en esta participación.');
      if (current.revoked_at) return { entryId: entry, membershipId: membership, assignment: 'revoked', reused: true };
      await client.query('UPDATE team_admin_assignments SET revoked_at=now(),revoked_by=$4,revocation_reason=$5 WHERE organization_id=$1 AND entry_id=$2 AND membership_id=$3', [organizationId, entry, membership, actor.user_id, reason]);
      const { rowCount: otherAssignments } = await client.query('SELECT 1 FROM team_admin_assignments WHERE organization_id=$1 AND membership_id=$2 AND revoked_at IS NULL LIMIT 1', [organizationId, membership]);
      if (!otherAssignments) await client.query("UPDATE invitations SET revoked_at=now() WHERE organization_id=$1 AND user_id=(SELECT user_id FROM memberships WHERE organization_id=$1 AND id=$2) AND purpose='invite' AND used_at IS NULL AND revoked_at IS NULL", [organizationId, membership]);
      await audit(client, actor.user_id, organizationId, 'team_admin.revoked', membership, reason, { entryId: entry, assignment: 'active' }, { entryId: entry, assignment: 'revoked' });
      return { entryId: entry, membershipId: membership, assignment: 'revoked' };
    });
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/publication', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = teamPublicationSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT id,public_visible FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró esta participación.');
      if (current.public_visible === input.publicVisible) return { entryId: entry, publicVisible: current.public_visible, reused: true };
      await client.query('UPDATE team_entries SET public_visible=$1 WHERE id=$2', [input.publicVisible, entry]);
      await audit(client, actor.user_id, organizationId, 'team.publication_changed', entry, input.reason, { publicVisible: current.public_visible }, { publicVisible: input.publicVisible });
      return { entryId: entry, publicVisible: input.publicVisible };
    });
  });
  app.post('/api/v1/organizations/:id/teams/:teamId/shield', async (request, reply) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const organizationId = uuid(id), team = uuid(teamId);
    const actor = await organizationAccess(request, organizationId, true);
    const { rows: [present] } = await pool.query('SELECT id FROM teams WHERE organization_id=$1 AND id=$2', [organizationId, team]);
    if (!present) fail(404, 'NOT_FOUND', 'No se encontró este equipo.');
    const file = await request.file(); if (!file) fail(400, 'FILE_REQUIRED', 'Elegí una imagen PNG, JPG o WebP.');
    const data = await file!.toBuffer(); const { contentType, extension } = imageFormat(data, file!.mimetype);
    const mediaId = randomUUID(), filename = `${mediaId}.${extension}`;
    await mkdir(config.mediaDir, { recursive: true }); await writeFile(resolve(config.mediaDir, filename), data, { flag: 'wx' });
    try {
      await transaction(pool, async (client) => {
        await client.query('INSERT INTO media(id,organization_id,filename,content_type,byte_length,checksum,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [mediaId, organizationId, filename, contentType, data.length, digest(data), actor.user_id]);
        await client.query('UPDATE teams SET shield_id=$1 WHERE organization_id=$2 AND id=$3', [mediaId, organizationId, team]);
        await audit(client, actor.user_id, organizationId, 'team.shield_changed', team, 'Escudo del equipo cargado');
      });
    } catch (error) { await unlink(resolve(config.mediaDir, filename)); throw error; }
    return reply.code(201).send({ id: mediaId });
  });
  app.get('/api/v1/organizations/:id/teams/:teamId/shield', async (request, reply) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const organizationId = uuid(id), team = uuid(teamId);
    const scope = await teamScope(request, organizationId);
    const allowed = await pool.query(teamRows, [organizationId, team, scope.organizer, scope.membershipId]);
    if (!allowed.rowCount) fail(404, 'NOT_FOUND', 'No se encontró este equipo en tu ámbito.');
    const { rows: [media] } = await pool.query('SELECT m.filename,m.content_type FROM teams t JOIN media m ON m.organization_id=t.organization_id AND m.id=t.shield_id WHERE t.organization_id=$1 AND t.id=$2', [organizationId, team]);
    if (!media) fail(404, 'NOT_FOUND', 'Este equipo aún no tiene escudo.');
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el archivo.');
    return reply.type(media.content_type).send(await readFile(resolve(config.mediaDir, media.filename)));
  });
  app.get('/api/v1/public/organizations/:id/teams/:teamId/shield', async (request, reply) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const organizationId = uuid(id), team = uuid(teamId);
    const { rows: [media] } = await pool.query(`SELECT m.filename,m.content_type FROM teams t JOIN media m ON m.organization_id=t.organization_id AND m.id=t.shield_id JOIN team_entries e ON e.organization_id=t.organization_id AND e.team_id=t.id JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments tr ON tr.organization_id=ed.organization_id AND tr.id=ed.tournament_id JOIN organizations o ON o.id=t.organization_id WHERE t.organization_id=$1 AND t.id=$2 AND o.status='active' AND e.status='active' AND e.public_visible AND c.status='published' AND ed.status='published' AND tr.status='published' LIMIT 1`, [organizationId, team]);
    if (!media) fail(404, 'NOT_FOUND', 'No hay escudo público para este equipo.');
    if (!/^[0-9a-f-]+\.(png|jpg|webp)$/.test(media.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el archivo.');
    return reply.header('Cache-Control','public, max-age=60, stale-while-revalidate=300').type(media.content_type).send(await readFile(resolve(config.mediaDir, media.filename)));
  });
  for (const kind of ['commission','staff'] as const) {
    const table = kind === 'commission' ? 'commission_members' : 'team_staff';
    const titleColumn = kind === 'commission' ? 'title' : 'role';
    app.post(`/api/v1/organizations/:id/entries/:entryId/${kind}`, async (request, reply) => {
      const { id, entryId } = request.params as { id: string; entryId: string };
      const organizationId = uuid(id), entry = uuid(entryId);
      const actor = await teamAccess(request, organizationId, entry);
      const input = kind === 'commission'
        ? teamPersonSchema.extend({ validFrom: calendarDateSchema.nullable().optional(), validUntil: calendarDateSchema.nullable().optional() }).refine(value => !value.validUntil || (value.validFrom && value.validUntil >= value.validFrom), 'La vigencia final debe ser posterior al inicio.').parse(request.body)
        : teamPersonSchema.parse(request.body);
      const personId = randomUUID();
      const direct = ((await pool.query("SELECT 1 FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role='tournament_admin' AND status='active'", [organizationId, actor.user_id])).rowCount ?? 0) > 0;
      await transaction(pool, async (client) => {
        const { rows: [present] } = await client.query('SELECT id FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
        if (!present) fail(404, 'NOT_FOUND', 'No se encontró la participación.');
        if (kind === 'commission') await client.query(`INSERT INTO commission_members(id,organization_id,entry_id,name,title,proposed_by,valid_from,valid_until,status,confirmed_by,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [personId, organizationId, entry, input.name, input.role, actor.user_id, 'validFrom' in input ? input.validFrom || null : null, 'validUntil' in input ? input.validUntil || null : null, direct ? 'confirmed' : 'proposed', direct ? actor.user_id : null, direct ? new Date() : null]);
        else await client.query(`INSERT INTO team_staff(id,organization_id,entry_id,name,role,proposed_by,status,confirmed_by,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [personId, organizationId, entry, input.name, input.role, actor.user_id, direct ? 'confirmed' : 'proposed', direct ? actor.user_id : null, direct ? new Date() : null]);
        await audit(client, actor.user_id, organizationId, `${kind}.${direct ? 'confirmed' : 'proposed'}`, personId, direct ? 'Integrante agregado por el organizador' : 'Integrante propuesto para revisión', null, { entryId: entry, role: input.role });
      });
      return reply.code(201).send({ id: personId, status: direct ? 'confirmed' : 'proposed' });
    });
    app.post(`/api/v1/organizations/:id/${kind}/:personId/confirm`, async (request) => {
      const { id, personId } = request.params as { id: string; personId: string };
      const organizationId = uuid(id), person = uuid(personId);
      const reason = reasonSchema.parse(request.body).reason;
      const actor = await organizationAccess(request, organizationId, true);
      return transaction(pool, async (client) => {
        const { rows: [current] } = await client.query(`SELECT id,status,entry_id${kind === 'commission' ? ',ended_at' : ''} FROM ${table} WHERE organization_id=$1 AND id=$2 FOR UPDATE`, [organizationId, person]);
        if (!current) fail(404, 'NOT_FOUND', 'No se encontró el integrante en esta organización.');
        if (kind === 'commission' && current.ended_at) fail(409, 'COMMISSION_ENDED', 'Esta designación ya terminó. Creá una propuesta nueva.');
        if (current.status === 'confirmed') return { id: person, status: 'confirmed', reused: true };
        const { rows: [updated] } = await client.query(`UPDATE ${table} SET status='confirmed',confirmed_by=$1,confirmed_at=now() WHERE id=$2 RETURNING id,status`, [actor.user_id, person]);
        await audit(client, actor.user_id, organizationId, `${kind}.confirmed`, person, reason, { status: current.status }, { status: 'confirmed', entryId: current.entry_id });
        return updated;
      });
    });
  }
  app.post('/api/v1/organizations/:id/commission/:personId/end', async (request) => {
    const { id, personId } = request.params as { id: string; personId: string };
    const organizationId = uuid(id), person = uuid(personId);
    const reason = reasonSchema.parse(request.body).reason;
    const actor = await organizationAccess(request, organizationId, true);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT entry_id,status,ended_at FROM commission_members WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, person]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró la designación.');
      if (current.status !== 'confirmed') fail(409, 'COMMISSION_PENDING', 'Confirmá primero la designación.');
      if (current.ended_at) return { id: person, ended: true, reused: true };
      await client.query('UPDATE commission_members SET ended_at=now(),ended_by=$3,end_reason=$4 WHERE organization_id=$1 AND id=$2', [organizationId, person, actor.user_id, reason]);
      await audit(client, actor.user_id, organizationId, 'commission.ended', person, reason, { entryId: current.entry_id, ended: false }, { entryId: current.entry_id, ended: true });
      return { id: person, ended: true };
    });
  });
  registerPrivateExports(app, pool, teamAccess, fail, uuid);
  app.get('/api/v1/organizations/:id/entries/:entryId/players', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    await teamAccess(request, organizationId, entry);
    const { rowCount } = await pool.query('SELECT 1 FROM team_entries WHERE organization_id=$1 AND id=$2', [organizationId, entry]);
    if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la participación del equipo.');
    const { rows } = await pool.query(`SELECT pr.id,pr.player_id,pr.entry_id,p.given_names,p.family_names,p.document_kind,p.document_last_four,to_char(p.birth_date,'YYYY-MM-DD') birth_date,p.revision identity_revision,pr.registration_number,pr.details,pr.origin_kind,CASE WHEN pr.origin_kind='internal' THEN origin.name ELSE pr.origin_team_name END origin_team_name,pr.origin_city,pr.origin_league,pr.status,pr.revision
      FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
      LEFT JOIN teams origin ON origin.organization_id=pr.organization_id AND origin.id=pr.origin_team_id
      WHERE pr.organization_id=$1 AND pr.entry_id=$2 AND pr.reverted_at IS NULL ORDER BY p.family_names,p.given_names,pr.id LIMIT 500`, [organizationId, entry]);
    return rows;
  });
  app.get('/api/v1/organizations/:id/origin-teams', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    await teamScope(request, organizationId);
    const { rows } = await pool.query("SELECT DISTINCT t.id,t.name FROM teams t JOIN team_entries e ON e.organization_id=t.organization_id AND e.team_id=t.id AND e.status='active' WHERE t.organization_id=$1 ORDER BY t.name LIMIT 500", [organizationId]);
    return rows;
  });
  app.get('/api/v1/organizations/:id/players/search', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id); await organizationAccess(request, organizationId, true);
    const { q } = z.object({ q: z.string().trim().min(2).max(80) }).strict().parse(request.query);
    const { rows } = await pool.query("SELECT id,given_names,family_names,document_kind,document_last_four,to_char(birth_date,'YYYY-MM-DD') birth_date,revision FROM players WHERE organization_id=$1 AND (given_names ILIKE '%'||$2||'%' OR family_names ILIKE '%'||$2||'%' OR document_last_four=$2) ORDER BY family_names,given_names LIMIT 20", [organizationId, q]);
    return rows;
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players', async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    const actor = await teamAccess(request, organizationId, entry);
    const input = playerDraftSchema.parse(request.body);
    if (input.birthDate > new Date().toISOString().slice(0, 10)) fail(400, 'BIRTH_DATE_FUTURE', 'La fecha de nacimiento no puede ser futura.');
    const fingerprint = input.documentKind && input.documentNumber ? documentFingerprint(config.appSecret, organizationId, input.documentKind, input.documentNumber) : null;
    const playerId = randomUUID(), registrationId = randomUUID();
    await transaction(pool, async (client) => {
      const { rows: [participation] } = await client.query('SELECT id,team_id,category_id,status FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      if (!participation || participation.status !== 'active') fail(404, 'NOT_FOUND', 'No se encontró una participación activa del equipo.');
      const { rows: [rule] } = await client.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1', [organizationId, participation.category_id]);
      await checkRegistrationPolicy(client, organizationId, participation.category_id, input.details);
      const maximum = rule?.rules?.maxRegisteredPlayers;
      if (typeof maximum === 'number') {
        const { rows: [count] } = await client.query('SELECT count(*)::int total FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND reverted_at IS NULL AND status<>\'rejected\'', [organizationId, entry]);
        if (count.total >= maximum) fail(409, 'ROSTER_FULL', `La nómina de esta categoría admite hasta ${maximum} jugadores.`);
      }
      if (input.origin.kind === 'internal') {
        const { rowCount } = await client.query('SELECT 1 FROM teams WHERE organization_id=$1 AND id=$2', [organizationId, input.origin.teamId]);
        if (!rowCount) fail(400, 'ORIGIN_NOT_FOUND', 'El equipo de origen no pertenece a esta organización.');
      }
      if (fingerprint) {
        const { rowCount: duplicate } = await client.query('SELECT 1 FROM players WHERE organization_id=$1 AND document_kind=$2 AND document_fingerprint=$3', [organizationId, input.documentKind, fingerprint]);
        if (duplicate) fail(409, 'PLAYER_DUPLICATE', 'Este documento ya está registrado en la organización. Solicitá revisión antes de crear otra ficha.');
      }
      const normalized = input.documentNumber ? normalizeDocument(input.documentNumber) : null;
      await client.query('INSERT INTO players(id,organization_id,given_names,family_names,document_kind,document_ciphertext,document_fingerprint,document_last_four,birth_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [playerId, organizationId, input.givenNames, input.familyNames, input.documentKind, input.documentNumber ? encryptDocument(config.appSecret, input.documentNumber) : null, fingerprint, normalized?.slice(-4) ?? null, input.birthDate, actor.user_id]);
      const origin = input.origin;
      await client.query('INSERT INTO player_registrations(id,organization_id,entry_id,player_id,registration_number,origin_kind,origin_team_id,origin_team_name,origin_city,origin_league,created_by,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [registrationId, organizationId, entry, playerId, input.registrationNumber, origin.kind, origin.kind === 'internal' ? origin.teamId : null, origin.kind === 'external' ? origin.teamName : null, origin.kind === 'external' || origin.kind === 'internal' ? origin.city : null, origin.kind === 'external' || origin.kind === 'internal' ? origin.league : null, actor.user_id, JSON.stringify(input.details)]);
      await audit(client, actor.user_id, organizationId, 'player.draft_created', registrationId, 'Jugador agregado como borrador privado', null, { entryId: entry, playerId });
    });
    return reply.code(201).send({ id: registrationId, playerId, status: 'draft' });
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/reuse', async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId), actor = await organizationAccess(request, organizationId, true);
    const input = playerReuseSchema.parse(request.body), registrationId = randomUUID();
    await transaction(pool, async (client) => {
      const { rows: [participation] } = await client.query("SELECT category_id FROM team_entries WHERE organization_id=$1 AND id=$2 AND status='active' FOR UPDATE", [organizationId, entry]);
      if (!participation) fail(404, 'NOT_FOUND', 'No se encontró una participación activa.');
      const { rowCount: identity } = await client.query('SELECT 1 FROM players WHERE organization_id=$1 AND id=$2', [organizationId, input.playerId]);
      if (!identity) fail(404, 'NOT_FOUND', 'No se encontró la identidad en esta organización.');
      const { rowCount: existing } = await client.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND player_id=$3', [organizationId, entry, input.playerId]);
      if (existing) fail(409, 'ALREADY_REGISTERED', 'Esta persona ya tiene inscripción en el equipo.');
      const { rows: [rule] } = await client.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1', [organizationId, participation.category_id]);
      await checkRegistrationPolicy(client, organizationId, participation.category_id, input.details);
      if (typeof rule?.rules?.maxRegisteredPlayers === 'number') {
        const { rows: [count] } = await client.query("SELECT count(*)::int total FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND reverted_at IS NULL AND status<>'rejected'", [organizationId, entry]);
        if (count.total >= rule.rules.maxRegisteredPlayers) fail(409, 'ROSTER_FULL', 'La nómina de la categoría está llena.');
      }
      if (input.origin.kind === 'internal') {
        const { rowCount } = await client.query('SELECT 1 FROM teams WHERE organization_id=$1 AND id=$2', [organizationId, input.origin.teamId]);
        if (!rowCount) fail(400, 'ORIGIN_NOT_FOUND', 'El equipo de origen no pertenece a esta organización.');
      }
      const origin = input.origin;
      await client.query('INSERT INTO player_registrations(id,organization_id,entry_id,player_id,registration_number,origin_kind,origin_team_id,origin_team_name,origin_city,origin_league,created_by,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [registrationId, organizationId, entry, input.playerId, input.registrationNumber, origin.kind, origin.kind === 'internal' ? origin.teamId : null, origin.kind === 'external' ? origin.teamName : null, origin.kind === 'external' || origin.kind === 'internal' ? origin.city : null, origin.kind === 'external' || origin.kind === 'internal' ? origin.league : null, actor.user_id, JSON.stringify(input.details)]);
      await audit(client, actor.user_id, organizationId, 'player.identity_reused', registrationId, input.reason, null, { entryId: entry, playerId: input.playerId });
    });
    return reply.code(201).send({ id: registrationId, playerId: input.playerId, status: 'draft' });
  });
  app.patch('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/identity', async (request) => {
    const { id, entryId, registrationId } = request.params as { id: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId), actor = await teamAccess(request, organizationId, entry);
    const input = playerIdentityEditSchema.parse(request.body);
    if (input.birthDate > new Date().toISOString().slice(0,10)) fail(400, 'BIRTH_DATE_FUTURE', 'La fecha de nacimiento no puede ser futura.');
    return transaction(pool, async (client) => {
      const { rows: [registrationRow] } = await client.query('SELECT player_id FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3 AND reverted_at IS NULL FOR UPDATE', [organizationId, entry, registration]);
      if (!registrationRow) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
      const { rows: [usage] } = await client.query('SELECT count(*)::int total FROM player_registrations WHERE organization_id=$1 AND player_id=$2 AND reverted_at IS NULL', [organizationId, registrationRow.player_id]);
      if (usage.total > 1) await organizationAccess(request, organizationId, true);
      const { rows: [current] } = await client.query("SELECT revision,given_names,family_names,document_kind,document_ciphertext,document_last_four,to_char(birth_date,'YYYY-MM-DD') birth_date FROM players WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, registrationRow.player_id]);
      if (current.revision !== input.expectedRevision) fail(409, 'STALE_VERSION', 'La identidad cambió. Actualizá antes de guardar.');
      const before = { givenNames: current.given_names, familyNames: current.family_names, birthDate: current.birth_date, documentKind: current.document_kind as string | null, documentNumber: current.document_ciphertext ? decryptDocument(config.appSecret, current.document_ciphertext) : null };
      const after = { givenNames: input.givenNames, familyNames: input.familyNames, birthDate: input.birthDate, documentKind: input.documentKind || before.documentKind, documentNumber: input.documentNumber || before.documentNumber };
      const changed = (['givenNames','familyNames','birthDate','documentKind','documentNumber'] as const).filter((key) => before[key] !== after[key]);
      if (!changed.length) fail(409, 'NO_CHANGE', 'No hay cambios de identidad para guardar.');
      const fingerprint = after.documentKind && after.documentNumber ? documentFingerprint(config.appSecret, organizationId, after.documentKind, after.documentNumber) : null;
      const normalized = after.documentNumber ? normalizeDocument(after.documentNumber) : null;
      await client.query('UPDATE players SET given_names=$1,family_names=$2,birth_date=$3,document_kind=$4,document_ciphertext=$5,document_fingerprint=$6,document_last_four=$7,revision=revision+1 WHERE organization_id=$8 AND id=$9', [after.givenNames, after.familyNames, after.birthDate, after.documentKind, after.documentNumber ? encryptDocument(config.appSecret, after.documentNumber) : null, fingerprint, normalized?.slice(-4) ?? null, organizationId, registrationRow.player_id]);
      const revision = current.revision + 1, changeId = randomUUID();
      await client.query('INSERT INTO player_identity_changes(id,organization_id,player_id,revision,before_ciphertext,after_ciphertext,changed_fields,reason,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [changeId, organizationId, registrationRow.player_id, revision, encryptDocument(config.appSecret, JSON.stringify(before)), encryptDocument(config.appSecret, JSON.stringify(after)), changed, input.reason, actor.user_id]);
      await client.query("UPDATE player_registrations SET status='observed',revision=revision+1,updated_at=now() WHERE organization_id=$1 AND player_id=$2 AND status='approved'", [organizationId, registrationRow.player_id]);
      await audit(client, actor.user_id, organizationId, 'player.identity_changed', registrationRow.player_id, input.reason, { revision: current.revision, fields: changed }, { revision, fields: changed });
      return { playerId: registrationRow.player_id, revision, changedFields: changed };
    });
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/identity/history', async (request) => {
    const { id, entryId, registrationId } = request.params as { id: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId); await teamAccess(request, organizationId, entry);
    const { rows: [identity] } = await pool.query('SELECT player_id FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3', [organizationId, entry, registration]);
    if (!identity) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
    const { rows } = await pool.query('SELECT id,revision,changed_fields,reason,changed_at,before_ciphertext,after_ciphertext FROM player_identity_changes WHERE organization_id=$1 AND player_id=$2 ORDER BY revision DESC LIMIT 20', [organizationId, identity.player_id]);
    const safe = (ciphertext: string) => { const value = JSON.parse(decryptDocument(config.appSecret, ciphertext)); return { givenNames: value.givenNames, familyNames: value.familyNames, birthDate: value.birthDate, documentKind: value.documentKind, documentLastFour: value.documentNumber ? normalizeDocument(value.documentNumber).slice(-4) : null }; };
    return rows.map((row) => ({ id: row.id, revision: row.revision, changed_fields: row.changed_fields, reason: row.reason, changed_at: row.changed_at, before: safe(row.before_ciphertext), after: safe(row.after_ciphertext) }));
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/import/preview', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId), actor = await teamAccess(request, organizationId, entry);
    const input = playerImportPreviewSchema.parse(request.body);
    await checkImportRows(pool, organizationId, entry, input.rows);
    const stamp = Date.now().toString(36);
    return { count: input.rows.length, previewToken: `${stamp}.${importSignature(organizationId, entry, actor.user_id, input.rows, stamp)}`, expiresInMinutes: 15 };
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/import', async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId), actor = await teamAccess(request, organizationId, entry);
    const input = playerImportCommitSchema.parse(request.body);
    const [stamp, signature] = input.previewToken.split('.');
    const time = parseInt(stamp || '', 36);
    if (!Number.isSafeInteger(time) || time > Date.now() || Date.now() - time > 15 * 60_000 || !signature || !safeEquals(signature, importSignature(organizationId, entry, actor.user_id, input.rows, stamp))) fail(409, 'PREVIEW_EXPIRED', 'La vista previa cambió o venció. Revisá de nuevo el archivo.');
    const batchId = randomUUID();
    await transaction(pool, async (client) => {
      await client.query('SELECT 1 FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      await checkImportRows(client, organizationId, entry, input.rows);
      const { rows: [importEntry] } = await client.query('SELECT category_id FROM team_entries WHERE organization_id=$1 AND id=$2', [organizationId, entry]);
      if (!importEntry) fail(404, 'NOT_FOUND', 'No se encontró la participación del equipo.');
      for (const row of input.rows) await checkRegistrationPolicy(client, organizationId, importEntry.category_id, row.details);
      await client.query('INSERT INTO player_import_batches(id,organization_id,entry_id,row_count,reason,created_by) VALUES($1,$2,$3,$4,$5,$6)', [batchId, organizationId, entry, input.rows.length, input.reason, actor.user_id]);
      for (const row of input.rows) {
        const playerId = randomUUID(), registrationId = randomUUID(), origin = row.origin, normalized = row.documentNumber ? normalizeDocument(row.documentNumber) : null;
        await client.query('INSERT INTO players(id,organization_id,given_names,family_names,document_kind,document_ciphertext,document_fingerprint,document_last_four,birth_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [playerId, organizationId, row.givenNames, row.familyNames, row.documentKind, row.documentNumber ? encryptDocument(config.appSecret, row.documentNumber) : null, row.documentKind && row.documentNumber ? documentFingerprint(config.appSecret, organizationId, row.documentKind, row.documentNumber) : null, normalized?.slice(-4) ?? null, row.birthDate, actor.user_id]);
        await client.query('INSERT INTO player_registrations(id,organization_id,entry_id,player_id,registration_number,origin_kind,origin_team_id,origin_team_name,origin_city,origin_league,created_by,import_batch_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)', [registrationId, organizationId, entry, playerId, row.registrationNumber, origin.kind, origin.kind === 'internal' ? origin.teamId : null, origin.kind === 'external' ? origin.teamName : null, origin.kind === 'external' || origin.kind === 'internal' ? origin.city : null, origin.kind === 'external' || origin.kind === 'internal' ? origin.league : null, actor.user_id, batchId, JSON.stringify(row.details)]);
      }
      await audit(client, actor.user_id, organizationId, 'player_import.committed', batchId, input.reason, null, { entryId: entry, count: input.rows.length });
    });
    return reply.code(201).send({ id: batchId, count: input.rows.length, status: 'imported' });
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/players/import-batches', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId); await teamAccess(request, organizationId, entry);
    return (await pool.query('SELECT id,status,row_count,reason,created_at,reverted_at FROM player_import_batches WHERE organization_id=$1 AND entry_id=$2 ORDER BY created_at DESC LIMIT 20', [organizationId, entry])).rows;
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/import-batches/:batchId/revert', async (request) => {
    const { id, entryId, batchId } = request.params as { id: string; entryId: string; batchId: string };
    const organizationId = uuid(id), entry = uuid(entryId), batch = uuid(batchId), actor = await teamAccess(request, organizationId, entry);
    const { reason } = reasonSchema.parse(request.body);
    return transaction(pool, async (client) => {
      await client.query('SELECT 1 FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      const { rows: [current] } = await client.query('SELECT status FROM player_import_batches WHERE organization_id=$1 AND entry_id=$2 AND id=$3 FOR UPDATE', [organizationId, entry, batch]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró el lote.');
      if (current.status !== 'imported') fail(409, 'ALREADY_REVERTED', 'El lote ya fue revertido.');
      const { rows: registrations } = await client.query('SELECT id,status FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND import_batch_id=$3', [organizationId, entry, batch]);
      if (registrations.some((row) => row.status !== 'draft')) fail(409, 'IMPORT_IN_USE', 'El lote ya tiene jugadores revisados; no puede revertirse.');
      const ids = new Set(registrations.map((row) => row.id));
      const { rows: versions } = await client.query('SELECT snapshot FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2', [organizationId, entry]);
      if (versions.some((version) => version.snapshot.some((player: { registrationId: string }) => ids.has(player.registrationId)))) fail(409, 'IMPORT_IN_USE', 'El lote figura en una versión de buena fe y no puede revertirse.');
      await client.query('UPDATE player_registrations SET reverted_at=now(),revision=revision+1,updated_at=now() WHERE organization_id=$1 AND entry_id=$2 AND import_batch_id=$3', [organizationId, entry, batch]);
      await client.query("UPDATE player_import_batches SET status='reverted',reverted_at=now(),reverted_by=$1,revert_reason=$2 WHERE id=$3", [actor.user_id, reason, batch]);
      await audit(client, actor.user_id, organizationId, 'player_import.reverted', batch, reason, { status: 'imported' }, { status: 'reverted', entryId: entry, count: registrations.length });
      return { id: batch, status: 'reverted' };
    });
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/evidence', async (request) => {
    const { id, entryId, registrationId } = request.params as { id: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId);
    await teamAccess(request, organizationId, entry);
    const { rowCount } = await pool.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3', [organizationId, entry, registration]);
    if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
    const [documents, movements, restrictions] = await Promise.all([
      pool.query('SELECT id,registration_id,label,content_type,byte_length,status,uploaded_at,review_reason FROM player_documents WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 ORDER BY uploaded_at DESC,id DESC', [organizationId, entry, registration]),
      pool.query("SELECT id,registration_id,kind,to_char(starts_on,'YYYY-MM-DD') starts_on,to_char(ends_on,'YYYY-MM-DD') ends_on,status,reason,review_reason FROM player_movements WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 ORDER BY declared_at DESC,id DESC", [organizationId, entry, registration]),
      pool.query("SELECT id,registration_id,to_char(starts_on,'YYYY-MM-DD') starts_on,to_char(ends_on,'YYYY-MM-DD') ends_on,reason,lifted_at FROM player_restrictions WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 ORDER BY created_at DESC,id DESC", [organizationId, entry, registration]),
    ]);
    return { documents: documents.rows, movements: movements.rows, restrictions: restrictions.rows };
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/documents/:label', async (request, reply) => {
    const { id, entryId, registrationId, label } = request.params as { id: string; entryId: string; registrationId: string; label: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId), documentLabel = playerDocumentLabelSchema.parse(label);
    const actor = await teamAccess(request, organizationId, entry);
    const { rowCount } = await pool.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3', [organizationId, entry, registration]);
    if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
    const file = await request.file(); if (!file) fail(400, 'FILE_REQUIRED', 'Elegí un PDF o imagen.');
    const data = await file!.toBuffer(), { contentType, extension } = evidenceFormat(data, file!.mimetype);
    const documentId = randomUUID(), filename = `${documentId}.${extension}`;
    await mkdir(config.mediaDir, { recursive: true }); await writeFile(resolve(config.mediaDir, filename), data, { flag: 'wx' });
    try {
      await transaction(pool, async (client) => {
        const { rowCount: exists } = await client.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3 FOR UPDATE', [organizationId, entry, registration]);
        if (!exists) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
        await client.query('INSERT INTO player_documents(id,organization_id,entry_id,registration_id,label,filename,content_type,byte_length,checksum,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [documentId, organizationId, entry, registration, documentLabel, filename, contentType, data.length, digest(data), actor.user_id]);
        await audit(client, actor.user_id, organizationId, 'player_document.uploaded', documentId, 'Evidencia privada agregada', null, { entryId: entry, registrationId: registration, label: documentLabel, byteLength: data.length });
      });
    } catch (error) { await unlink(resolve(config.mediaDir, filename)); throw error; }
    return reply.code(201).send({ id: documentId, status: 'uploaded' });
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/documents/:documentId/file', async (request, reply) => {
    const { id, entryId, registrationId, documentId } = request.params as { id: string; entryId: string; registrationId: string; documentId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId), document = uuid(documentId);
    await teamAccess(request, organizationId, entry);
    const { rows: [file] } = await pool.query('SELECT filename,content_type FROM player_documents WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 AND id=$4', [organizationId, entry, registration, document]);
    if (!file) fail(404, 'NOT_FOUND', 'No se encontró el documento.');
    if (!/^[0-9a-f-]+\.(pdf|png|jpg|webp)$/.test(file.filename)) fail(500, 'INVALID_FILE', 'No se pudo abrir el documento.');
    return reply.header('Content-Disposition', `attachment; filename="evidencia.${file.filename.split('.').pop()}"`).type(file.content_type).send(await readFile(resolve(config.mediaDir, file.filename)));
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/documents/:documentId/review', async (request) => {
    const { id, entryId, registrationId, documentId } = request.params as { id: string; entryId: string; registrationId: string; documentId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId), document = uuid(documentId);
    const actor = await organizationAccess(request, organizationId, true), input = playerEvidenceReviewSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT status,label FROM player_documents WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 AND id=$4 FOR UPDATE', [organizationId, entry, registration, document]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró el documento.');
      if (current.status !== 'uploaded') fail(409, 'ALREADY_REVIEWED', 'Esta evidencia ya tiene una decisión.');
      const { rows: [result] } = await client.query('UPDATE player_documents SET status=$1,review_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 RETURNING id,status,review_reason', [input.decision, input.reason, actor.user_id, document]);
      await audit(client, actor.user_id, organizationId, `player_document.${input.decision}`, document, input.reason, { status: current.status }, { status: input.decision, entryId: entry, registrationId: registration, label: current.label });
      return result;
    });
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/movements', async (request, reply) => {
    const { id, entryId, registrationId } = request.params as { id: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId);
    const actor = await teamAccess(request, organizationId, entry), input = movementDeclareSchema.parse(request.body);
    const movementId = randomUUID();
    await transaction(pool, async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3 FOR UPDATE', [organizationId, entry, registration]);
      if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
      const { rows: [previous] } = await client.query('SELECT status FROM player_movements WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 ORDER BY declared_at DESC,id DESC LIMIT 1', [organizationId, entry, registration]);
      if (previous && previous.status !== 'rejected') fail(409, 'MOVEMENT_EXISTS', 'Este movimiento ya fue declarado. Solicitá revisión del organizador.');
      await client.query('INSERT INTO player_movements(id,organization_id,entry_id,registration_id,kind,starts_on,ends_on,reason,declared_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [movementId, organizationId, entry, registration, input.kind, input.startsOn, input.endsOn, input.reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'player_movement.declared', movementId, input.reason, null, { entryId: entry, registrationId: registration, kind: input.kind, startsOn: input.startsOn, endsOn: input.endsOn });
    });
    return reply.code(201).send({ id: movementId, status: 'declared' });
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/movements/:movementId/review', async (request) => {
    const { id, entryId, registrationId, movementId } = request.params as { id: string; entryId: string; registrationId: string; movementId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId), movement = uuid(movementId);
    const actor = await organizationAccess(request, organizationId, true), input = playerEvidenceReviewSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT status FROM player_movements WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 AND id=$4 FOR UPDATE', [organizationId, entry, registration, movement]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró el movimiento.');
      if (current.status !== 'declared') fail(409, 'ALREADY_REVIEWED', 'Este movimiento ya tiene una decisión.');
      const { rows: [result] } = await client.query('UPDATE player_movements SET status=$1,review_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 RETURNING id,status,review_reason', [input.decision, input.reason, actor.user_id, movement]);
      await audit(client, actor.user_id, organizationId, `player_movement.${input.decision}`, movement, input.reason, { status: current.status }, { status: input.decision, entryId: entry, registrationId: registration });
      return result;
    });
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/restrictions', async (request, reply) => {
    const { id, entryId, registrationId } = request.params as { id: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId);
    const actor = await organizationAccess(request, organizationId, true), input = restrictionCreateSchema.parse(request.body);
    const restrictionId = randomUUID();
    await transaction(pool, async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3 FOR UPDATE', [organizationId, entry, registration]);
      if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
      await client.query('INSERT INTO player_restrictions(id,organization_id,entry_id,registration_id,starts_on,ends_on,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [restrictionId, organizationId, entry, registration, input.startsOn, input.endsOn, input.reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'player_restriction.created', restrictionId, input.reason, null, { entryId: entry, registrationId: registration, startsOn: input.startsOn, endsOn: input.endsOn });
    });
    return reply.code(201).send({ id: restrictionId });
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/restrictions/:restrictionId/lift', async (request) => {
    const { id, entryId, registrationId, restrictionId } = request.params as { id: string; entryId: string; registrationId: string; restrictionId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId), restriction = uuid(restrictionId);
    const actor = await organizationAccess(request, organizationId, true), { reason } = reasonSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [current] } = await client.query('SELECT lifted_at FROM player_restrictions WHERE organization_id=$1 AND entry_id=$2 AND registration_id=$3 AND id=$4 FOR UPDATE', [organizationId, entry, registration, restriction]);
      if (!current) fail(404, 'NOT_FOUND', 'No se encontró la restricción.');
      if (current.lifted_at) fail(409, 'ALREADY_LIFTED', 'La restricción ya fue levantada.');
      await client.query('UPDATE player_restrictions SET lifted_at=now(),lifted_by=$1,lift_reason=$2 WHERE id=$3', [actor.user_id, reason, restriction]);
      await audit(client, actor.user_id, organizationId, 'player_restriction.lifted', restriction, reason, { entryId: entry, registrationId: registration, active: true }, { active: false });
      return { id: restriction, lifted: true };
    });
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/players/:registrationId/eligibility', async (request) => {
    const { id, entryId, registrationId } = request.params as { id: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), entry = uuid(entryId), registration = uuid(registrationId);
    await teamAccess(request, organizationId, entry);
    const { date } = z.object({ date: calendarDateSchema }).strict().parse(request.query);
    return assessEligibility(organizationId, entry, registration, date);
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/good-faith', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    await teamAccess(request, organizationId, entry);
    const { rowCount } = await pool.query('SELECT 1 FROM team_entries WHERE organization_id=$1 AND id=$2', [organizationId, entry]);
    if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la participación del equipo.');
    const { rows } = await pool.query('SELECT id,entry_id,version,status,snapshot,submit_reason,submitted_at,review_reason,reviewed_at FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 20', [organizationId, entry]);
    return rows;
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/good-faith/:version/pdf', async (request, reply) => {
    const { id, entryId, version } = request.params as { id: string; entryId: string; version: string };
    const organizationId = uuid(id), entry = uuid(entryId), number = z.coerce.number().int().positive().parse(version);
    const actor = await teamAccess(request, organizationId, entry);
    const { rows: [record] } = await pool.query(`SELECT gf.snapshot,gf.reviewed_at,t.name tournament_name,ed.name edition_name,c.name category_name,team.name team_name
      FROM good_faith_versions gf JOIN team_entries e ON e.organization_id=gf.organization_id AND e.id=gf.entry_id
      JOIN teams team ON team.organization_id=e.organization_id AND team.id=e.team_id JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      WHERE gf.organization_id=$1 AND gf.entry_id=$2 AND gf.version=$3 AND gf.status='approved'`, [organizationId, entry, number]);
    if (!record) fail(404, 'NOT_FOUND', 'Solo una versión aprobada puede exportarse.');
    const pdf = approvedGoodFaithPdf({ tournament: record.tournament_name, edition: record.edition_name, category: record.category_name, team: record.team_name, version: number, reviewedAt: new Date(record.reviewed_at).toISOString(), players: record.snapshot });
    await transaction(pool, client => audit(client, actor.user_id, organizationId, 'private_export.downloaded', entry, 'Descarga privada de lista aprobada', null, { kind: 'good-faith', format: 'pdf', version: number, bytes: pdf.length }));
    return reply.header('Cache-Control', 'private, no-store').header('Content-Disposition', `attachment; filename="buena-fe-v${number}.pdf"`).type('application/pdf').send(pdf);
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/good-faith/submit', async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    const actor = await teamAccess(request, organizationId, entry);
    const input = goodFaithSubmitSchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rows: [participation] } = await client.query('SELECT id,category_id,status FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      if (!participation || participation.status !== 'active') fail(404, 'NOT_FOUND', 'No se encontró una participación activa del equipo.');
      const { rows: [latest] } = await client.query('SELECT version,status FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 1', [organizationId, entry]);
      if ((latest?.version || 0) !== input.expectedVersion) fail(409, 'STALE_VERSION', 'La lista cambió. Actualizá antes de presentarla.');
      if (latest?.status === 'submitted') fail(409, 'REVIEW_PENDING', 'La lista presentada todavía espera revisión.');
      const { rows } = await client.query(`SELECT pr.id registration_id,pr.player_id,p.given_names,p.family_names,to_char(p.birth_date,'YYYY-MM-DD') birth_date,pr.registration_number,pr.origin_kind
        FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
        WHERE pr.organization_id=$1 AND pr.entry_id=$2 AND pr.reverted_at IS NULL AND pr.status<>'rejected' ORDER BY pr.created_at,pr.id`, [organizationId, entry]);
      const actual = rows.map((row) => row.registration_id).sort(), selected = [...input.registrationIds].sort();
      if (actual.length !== selected.length || actual.some((id, index) => id !== selected[index])) fail(409, 'ROSTER_CHANGED', 'Los jugadores cambiaron. Actualizá la lista antes de presentarla.');
      const { rows: [rule] } = await client.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1', [organizationId, participation.category_id]);
      if (typeof rule?.rules?.maxRegisteredPlayers === 'number' && rows.length > rule.rules.maxRegisteredPlayers) fail(409, 'ROSTER_FULL', 'La lista supera el cupo vigente.');
      const snapshot = rows.map((row) => ({ registrationId: row.registration_id, playerId: row.player_id, givenNames: row.given_names, familyNames: row.family_names, birthDate: row.birth_date, registrationNumber: row.registration_number, originKind: row.origin_kind }));
      const version = (latest?.version || 0) + 1, versionId = randomUUID();
      await client.query('INSERT INTO good_faith_versions(id,organization_id,entry_id,version,snapshot,submit_reason,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [versionId, organizationId, entry, version, JSON.stringify(snapshot), input.reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'good_faith.submitted', versionId, input.reason, null, { entryId: entry, version, players: snapshot.length });
      return { id: versionId, version, status: 'submitted' };
    });
    return reply.code(201).send(result);
  });
  app.post('/api/v1/organizations/:id/entries/:entryId/good-faith/review', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId);
    const actor = await organizationAccess(request, organizationId, true);
    const input = goodFaithReviewSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [participation] } = await client.query('SELECT id,category_id FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entry]);
      if (!participation) fail(404, 'NOT_FOUND', 'No se encontró la participación del equipo.');
      const { rows: [latest] } = await client.query('SELECT id,version,status,snapshot FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE', [organizationId, entry]);
      if (!latest || latest.version !== input.version || latest.status !== 'submitted') fail(409, 'STALE_VERSION', 'La lista ya fue revisada o cambió. Actualizá antes de decidir.');
      if (input.decision === 'approved') {
        const { rows: [rule] } = await client.query("SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, participation.category_id]);
        if (!rule) fail(409, 'RULES_NOT_PUBLISHED', 'Publicá primero el reglamento de esta categoría.');
        const parsedRule = ruleSchema.safeParse(rule.rules);
        if (!parsedRule.success || !parsedRule.data.substitutions || !parsedRule.data.eligibility || !parsedRule.data.advanced) fail(409, 'RULES_INCOMPLETE', 'Revisá el reglamento publicado antes de aprobar jugadores.');
      }
      const { rows: [reviewed] } = await client.query('UPDATE good_faith_versions SET status=$1,review_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 RETURNING id,version,status,review_reason,reviewed_at', [input.decision, input.reason, actor.user_id, latest.id]);
      if (input.decision === 'approved') await client.query("UPDATE player_registrations SET status='approved',revision=revision+1,updated_at=now() WHERE organization_id=$1 AND entry_id=$2 AND id=ANY($3::uuid[]) AND status<>'approved'", [organizationId, entry, (latest.snapshot as Array<{ registrationId: string }>).map((player) => player.registrationId)]);
      await audit(client, actor.user_id, organizationId, `good_faith.${input.decision}`, latest.id, input.reason, { status: 'submitted' }, { status: input.decision, entryId: entry, version: latest.version });
      return reviewed;
    });
  });
  async function matchdaySnapshot(client: PoolClient, organizationId: string, matchdayId: string, archived = false) {
    const { rows } = await client.query(`SELECT m.id,m.category_id,m.fixture_phase_id,(m.position_game_id IS NOT NULL) position_match,c.name category_name,m.home_entry_id,m.away_entry_id,home.id home_team_id,away.id away_team_id,home.name home_name,away.name away_name,
      (home.shield_id IS NOT NULL) home_has_shield,(away.shield_id IS NOT NULL) away_has_shield,
      v.id venue_id,coalesce(v.name,'') venue_name,coalesce(m.court_label,'') court_label,coalesce(to_char(m.match_date,'YYYY-MM-DD'),'') match_date,
      coalesce(to_char(m.starts_at AT TIME ZONE t.timezone,'HH24:MI'),'') match_time,coalesce(m.duration_minutes,60) duration_minutes,m.referee_name,m.referee_id,m.schedule_revision,r.status acta_status
      FROM draft_matches m JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
      JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      JOIN team_entries h ON h.organization_id=m.organization_id AND h.id=m.home_entry_id
      JOIN team_entries a ON a.organization_id=m.organization_id AND a.id=m.away_entry_id
      JOIN teams home ON home.organization_id=h.organization_id AND home.id=h.team_id
      JOIN teams away ON away.organization_id=a.organization_id AND away.id=a.team_id
      LEFT JOIN venues v ON v.organization_id=m.organization_id AND v.id=m.venue_id
      LEFT JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id
      WHERE m.organization_id=$1 AND md.id=$2 AND ${archived ? 'm.archived_at IS NOT NULL' : 'm.archived_at IS NULL'} ORDER BY m.starts_at,m.court_label,m.id`, [organizationId, matchdayId]);
    return rows;
  }
  async function scheduleConflicts(client: PoolClient, organizationId: string, matchId: string, homeEntryId: string, awayEntryId: string, venueId: string, courtLabel: string, refereeId: string | null, refereeName: string | null, startsAt: Date, durationMinutes: number) {
    const end = new Date(startsAt.getTime() + durationMinutes * 60000);
    const { rows } = await client.query(`SELECT m.id,m.starts_at,m.duration_minutes,m.venue_id,m.court_label,m.referee_id,m.referee_name,
      h.team_id home_team_id,a.team_id away_team_id,home.name home_name,away.name away_name
      FROM draft_matches m JOIN team_entries h ON h.organization_id=m.organization_id AND h.id=m.home_entry_id
      JOIN team_entries a ON a.organization_id=m.organization_id AND a.id=m.away_entry_id
      JOIN teams home ON home.organization_id=h.organization_id AND home.id=h.team_id
      JOIN teams away ON away.organization_id=a.organization_id AND away.id=a.team_id
      WHERE m.organization_id=$1 AND m.id<>$2 AND m.archived_at IS NULL AND m.starts_at IS NOT NULL
      AND m.starts_at < $3::timestamptz + interval '1 hour'
      AND m.starts_at + m.duration_minutes * interval '1 minute' > $4::timestamptz - interval '1 hour'`, [organizationId, matchId, end, startsAt]);
    const { rows: chosen } = await client.query('SELECT id,team_id FROM team_entries WHERE organization_id=$1 AND id=ANY($2::uuid[])', [organizationId, [homeEntryId, awayEntryId]]);
    const teamIds = new Set(chosen.map((entry) => entry.team_id));
    const hard: string[] = [], warnings: string[] = [];
    for (const other of rows) {
      const otherStart = new Date(other.starts_at), otherEnd = new Date(otherStart.getTime() + other.duration_minutes * 60000);
      const overlap = startsAt < otherEnd && end > otherStart;
      const sameTeam = teamIds.has(other.home_team_id) || teamIds.has(other.away_team_id);
      const sameCourt = other.venue_id === venueId && other.court_label.trim().toLocaleLowerCase('es') === courtLabel.trim().toLocaleLowerCase('es');
      const sameReferee = Boolean(refereeId && other.referee_id === refereeId || refereeName && other.referee_name && other.referee_name.trim().toLocaleLowerCase('es') === refereeName.trim().toLocaleLowerCase('es'));
      const label = `${other.home_name} vs ${other.away_name}`;
      if (overlap) {
        if (sameTeam) hard.push(`Un equipo ya juega ${label} en ese horario.`);
        if (sameCourt) hard.push(`La cancha ya tiene ${label} en ese horario.`);
        if (sameReferee) hard.push(`El árbitro ya dirige ${label} en ese horario.`);
      } else if (sameTeam && (otherStart.getTime() - end.getTime() < 60 * 60000 && otherStart >= end || startsAt.getTime() - otherEnd.getTime() < 60 * 60000 && startsAt >= otherEnd)) warnings.push(`Menos de 60 minutos de descanso respecto de ${label}; revisá el reglamento local.`);
    }
    return { hard, warnings };
  }
  async function publishMatchdaySnapshot(client: PoolClient, organizationId: string, day: { id: string; revision: number }, actorId: string, reason: string, kind: 'matchday.published' | 'matchday.reprogrammed' | 'matchday.corrected') {
    const snapshot = await matchdaySnapshot(client, organizationId, day.id);
    const publicationId = randomUUID();
    await client.query('INSERT INTO matchday_publications(id,organization_id,matchday_id,revision,snapshot,reason,published_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [publicationId, organizationId, day.id, day.revision, JSON.stringify(snapshot), reason, actorId]);
    await client.query('INSERT INTO fixture_outbox(id,organization_id,publication_id,event_kind,payload) VALUES($1,$2,$3,$4,$5)', [randomUUID(), organizationId, publicationId, kind, JSON.stringify({ matchdayId: day.id, revision: day.revision })]);
    return { publicationId, snapshot };
  }
  app.get('/api/v1/organizations/:id/categories/:categoryId/fixture', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId); await organizationAccess(request, organizationId);
    const { rowCount: categoryCount } = await pool.query('SELECT 1 FROM categories WHERE organization_id=$1 AND id=$2', [organizationId, category]);
    if (!categoryCount) fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
    const { rows: [phase] } = await pool.query('SELECT id,category_id,rule_version,mode,legs,group_count,status,revision FROM fixture_phases WHERE organization_id=$1 AND category_id=$2', [organizationId, category]);
    if (!phase) return { phase: null, rounds: [], groups: [], bracket: [] };
    const { rows: rounds } = await pool.query('SELECT id,ordinal,leg,group_no FROM fixture_rounds WHERE organization_id=$1 AND phase_id=$2 ORDER BY ordinal,group_no', [organizationId, phase.id]);
    const { rows: matches } = await pool.query(`SELECT m.id,m.fixture_round_id,m.fixture_leg,m.matchday_id,m.home_entry_id,m.away_entry_id,to_char(m.match_date,'YYYY-MM-DD') match_date,home.name home_name,away.name away_name
      FROM draft_matches m JOIN team_entries h ON h.organization_id=m.organization_id AND h.id=m.home_entry_id JOIN teams home ON home.organization_id=h.organization_id AND home.id=h.team_id
      JOIN team_entries a ON a.organization_id=m.organization_id AND a.id=m.away_entry_id JOIN teams away ON away.organization_id=a.organization_id AND away.id=a.team_id
      WHERE m.organization_id=$1 AND m.fixture_phase_id=$2 ORDER BY m.id`, [organizationId, phase.id]);
    const { rows: byes } = await pool.query(`SELECT b.round_id,b.entry_id,t.name team_name FROM fixture_byes b JOIN team_entries e ON e.organization_id=b.organization_id AND e.id=b.entry_id JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id JOIN fixture_rounds r ON r.organization_id=b.organization_id AND r.id=b.round_id WHERE b.organization_id=$1 AND r.phase_id=$2 ORDER BY t.name`, [organizationId, phase.id]);
    const { rows: groups } = await pool.query(`SELECT g.group_no,g.entry_id,t.name team_name FROM fixture_group_entries g JOIN team_entries e ON e.organization_id=g.organization_id AND e.id=g.entry_id JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE g.organization_id=$1 AND g.phase_id=$2 ORDER BY g.group_no,t.name`, [organizationId, phase.id]);
    const { rows: bracket } = await pool.query(`SELECT s.id,s.round_id,s.stage,s.slot,coalesce(s.home_entry_id,sm.home_entry_id) home_entry_id,coalesce(s.away_entry_id,sm.away_entry_id) away_entry_id,s.home_source_id,s.away_source_id,s.match_id,s.return_match_id,s.decider_match_id,home.name home_name,away.name away_name
      FROM fixture_bracket_slots s LEFT JOIN draft_matches sm ON sm.organization_id=s.organization_id AND sm.id=s.match_id
      LEFT JOIN team_entries h ON h.organization_id=s.organization_id AND h.id=coalesce(s.home_entry_id,sm.home_entry_id) LEFT JOIN teams home ON home.organization_id=h.organization_id AND home.id=h.team_id
      LEFT JOIN team_entries a ON a.organization_id=s.organization_id AND a.id=coalesce(s.away_entry_id,sm.away_entry_id) LEFT JOIN teams away ON away.organization_id=a.organization_id AND away.id=a.team_id
      WHERE s.organization_id=$1 AND s.phase_id=$2 ORDER BY s.stage,s.slot`, [organizationId, phase.id]);
    return { phase, rounds: rounds.map((round) => ({ ...round, matches: matches.filter((match) => match.fixture_round_id === round.id), byes: byes.filter((bye) => bye.round_id === round.id) })), groups, bracket };
  });
  app.get('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId);
    await organizationAccess(request, organizationId);
    const { rows: [found] } = await pool.query('SELECT 1 FROM categories WHERE organization_id=$1 AND id=$2', [organizationId, category]);
    if (!found) fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
    const { rows: [blueprint] } = await pool.query(`SELECT b.id,b.name,b.revision,b.opening_first_jornada,b.opening_second_jornada,to_char(b.opening_first_date,'YYYY-MM-DD') opening_first_date,to_char(b.opening_second_date,'YYYY-MM-DD') opening_second_date,to_char(b.extra_reserved_date,'YYYY-MM-DD') extra_reserved_date,
      (SELECT max(p.revision) FROM fixture_position_publications p WHERE p.organization_id=b.organization_id AND p.blueprint_id=b.id) published_revision
      FROM fixture_position_blueprints b WHERE b.organization_id=$1 AND b.category_id=$2`, [organizationId, category]);
    if (!blueprint) return { blueprint: null, slots: [], games: [] };
    const { rows: slots } = await pool.query(`SELECT s.slot_code,s.entry_id,t.name team_name,t.color FROM fixture_position_assignments s
      LEFT JOIN team_entries e ON e.organization_id=s.organization_id AND e.id=s.entry_id
      LEFT JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
      WHERE s.organization_id=$1 AND s.blueprint_id=$2 ORDER BY s.slot_code`, [organizationId, blueprint.id]);
    const { rows: games } = await pool.query(`SELECT code,stage,sporting_round,jornada_no,to_char(planned_date,'YYYY-MM-DD') planned_date,home_ref,away_ref
      FROM fixture_position_games WHERE organization_id=$1 AND blueprint_id=$2 ORDER BY ordinal`, [organizationId, blueprint.id]);
    return { blueprint, slots, games };
  });
  app.get('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/competition', async request => {
    const {id,categoryId}=request.params as {id:string;categoryId:string};
    const organizationId=uuid(id),category=uuid(categoryId);
    await organizationAccess(request,organizationId);
    const state=await positionCompetitionState(pool,organizationId,category);
    if(!state)return fail(404,'BLUEPRINT_NOT_FOUND','No se encontró el formato de esta Copa.');
    const stats=state.rulesPublished?await categoryStatistics(pool,organizationId,category):null;
    const names=stats?await playerStatNames(pool,organizationId,stats.players.map(player=>player.registrationId)):new Map();
    return {competition:state.competition,results:state.results,matches:state.matches,preparedMatches:state.preparedMatches,rulesPublished:state.rulesPublished,players:stats?.players.map(player=>({...player,name:names.get(player.registrationId)?.name||'Jugador',publicName:names.get(player.registrationId)?.publicName||false}))||[],defense:stats?.defense||[],titleTie:state.titleTie,titleExtra:state.titleExtra};
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/title-extra',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};
    const organizationId=uuid(id),category=uuid(categoryId),actor=await organizationAccess(request,organizationId,true);
    const input=z.object({decision:z.enum(['no_extra','extra']),homeEntryId:z.uuid().optional(),awayEntryId:z.uuid().optional()}).strict().parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[plan]}=await client.query(`SELECT b.id,b.extra_reserved_date,c.edition_id FROM fixture_position_blueprints b
        JOIN categories c ON c.organization_id=b.organization_id AND c.id=b.category_id WHERE b.organization_id=$1 AND b.category_id=$2 FOR UPDATE OF b`,[organizationId,category]);
      if(!plan)fail(404,'BLUEPRINT_NOT_FOUND','No se encontró el formato de esta Copa.');
      const state=await positionCompetitionState(client,organizationId,category);
      if(!state)return fail(404,'BLUEPRINT_NOT_FOUND','No se encontró el formato de esta Copa.');
      if(state.competition.official.quadrangular!==6||state.titleTie.length<2)fail(409,'TITLE_TIE_NOT_READY','Cerrá el cuadrangular; el partido extra solo corresponde ante empate por el título.');
      if(input.decision==='extra'&&(!input.homeEntryId||!input.awayEntryId||input.homeEntryId===input.awayEntryId||!state.titleTie.includes(input.homeEntryId)||!state.titleTie.includes(input.awayEntryId)))fail(400,'TITLE_TEAMS_INVALID','Elegí dos equipos empatados en el primer puesto.');
      const {rows:[previous]}=await client.query('SELECT decision,match_id FROM fixture_position_title_decisions WHERE organization_id=$1 AND category_id=$2 FOR UPDATE',[organizationId,category]);
      if(previous?.match_id){
        const {rows:[existing]}=await client.query(`SELECT m.id,m.home_entry_id,m.away_entry_id,md.status day_status,
          EXISTS(SELECT 1 FROM match_records r WHERE r.organization_id=m.organization_id AND r.match_id=m.id) started,
          EXISTS(SELECT 1 FROM lineup_versions l WHERE l.organization_id=m.organization_id AND l.match_id=m.id) has_lineup
          FROM draft_matches m LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
          WHERE m.organization_id=$1 AND m.id=$2 FOR UPDATE OF m`,[organizationId,previous.match_id]);
        if(existing?.started||existing?.has_lineup||existing?.day_status==='published')fail(409,'TITLE_EXTRA_ACTIVE','El partido extra ya empezó o se publicó. Revisá el partido antes de cambiar esta decisión.');
        if(input.decision==='extra'){
          if(existing.home_entry_id===input.homeEntryId&&existing.away_entry_id===input.awayEntryId)return {decision:'extra',matchId:existing.id,reused:true};
          await client.query('UPDATE draft_matches SET home_entry_id=$3,away_entry_id=$4 WHERE organization_id=$1 AND id=$2',[organizationId,existing.id,input.homeEntryId,input.awayEntryId]);
          await audit(client,actor.user_id,organizationId,'fixture.title_extra_changed',existing.id,'Equipos del partido extra corregidos',previous,input);
          return {decision:'extra',matchId:existing.id,reused:false};
        }
        await client.query('UPDATE fixture_position_title_decisions SET decision=$3,match_id=NULL,decided_by=$4,decided_at=now() WHERE organization_id=$1 AND category_id=$2',[organizationId,category,'no_extra',actor.user_id]);
        await client.query('UPDATE draft_matches SET archived_at=now(),archived_by=$3 WHERE organization_id=$1 AND id=$2',[organizationId,existing.id,actor.user_id]);
      }
      if(input.decision==='no_extra'){
        if(!previous)await client.query('INSERT INTO fixture_position_title_decisions(organization_id,category_id,decision,decided_by) VALUES($1,$2,$3,$4)',[organizationId,category,'no_extra',actor.user_id]);
        await audit(client,actor.user_id,organizationId,'fixture.title_extra_decided',category,'Sin partido extra por decisión del organizador',previous,{decision:'no_extra'});
        return {decision:'no_extra',matchId:null,reused:previous?.decision==='no_extra'};
      }
      const {rows:[day]}=await client.query(`INSERT INTO matchdays(id,organization_id,edition_id,ordinal,created_by)
        VALUES($1,$2,$3,15,$4) ON CONFLICT(organization_id,edition_id,ordinal) DO UPDATE SET ordinal=excluded.ordinal RETURNING id`,[randomUUID(),organizationId,plan.edition_id,actor.user_id]);
      const matchId=randomUUID();
      await client.query(`INSERT INTO draft_matches(id,organization_id,category_id,home_entry_id,away_entry_id,match_date,created_by,matchday_id,competition_stage)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'knockout')`,[matchId,organizationId,category,input.homeEntryId,input.awayEntryId,plan.extra_reserved_date,actor.user_id,day.id]);
      await client.query(`INSERT INTO fixture_position_title_decisions(organization_id,category_id,decision,match_id,decided_by)
        VALUES($1,$2,'extra',$3,$4) ON CONFLICT(organization_id,category_id) DO UPDATE SET decision='extra',match_id=excluded.match_id,decided_by=excluded.decided_by,decided_at=now()`,[organizationId,category,matchId,actor.user_id]);
      await audit(client,actor.user_id,organizationId,'fixture.title_extra_decided',category,'Partido extra elegido por el organizador',previous,{decision:'extra',matchId,homeEntryId:input.homeEntryId,awayEntryId:input.awayEntryId});
      return {decision:'extra',matchId,reused:false};
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/tiebreak',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};
    const organizationId=uuid(id),category=uuid(categoryId),actor=await organizationAccess(request,organizationId,true);
    if(actor.platform_admin)fail(403,'ORGANIZER_REQUIRED','El orden deportivo corresponde al organizador.');
    const input=z.object({table:z.enum(['A','B','general']),position:z.number().int().positive(),entryOrder:z.array(z.uuid()).min(2).max(10),reason:z.string().trim().max(300).optional()}).strict().parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[plan]}=await client.query('SELECT id FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2 FOR UPDATE',[organizationId,category]);
      if(!plan)return fail(404,'BLUEPRINT_NOT_FOUND','No se encontró el formato de esta Copa.');
      const raw=await positionCompetitionState(client,organizationId,category,false,false);
      if(!raw||raw.competition.official.groups!==25)return fail(409,'GROUP_RESULTS_PENDING','Esperá las 25 actas de la primera etapa.');
      const table=input.table==='A'?raw.competition.groupA:input.table==='B'?raw.competition.groupB:raw.competition.general;
      const group=table.groups.find(item=>item.position===input.position&&item.unresolved);
      if(!group||group.teamIds.length!==input.entryOrder.length||new Set(input.entryOrder).size!==input.entryOrder.length||input.entryOrder.some(id=>!group.teamIds.includes(id)))return fail(409,'TIE_CHANGED','La tabla cambió. Actualizá antes de ordenar los equipos.');
      const decisionId=randomUUID(),reason=input.reason||'Orden manual confirmado por el organizador';
      await client.query(`INSERT INTO standing_tiebreak_decisions(id,organization_id,category_id,source_key,group_key,position,entry_order,reason,decided_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[decisionId,organizationId,category,raw.sourceKeys[input.table],`position:${input.table}`,input.position,input.entryOrder,reason,actor.user_id]);
      await audit(client,actor.user_id,organizationId,'fixture.position_tiebreak_decided',decisionId,reason,null,{table:input.table,position:input.position,entryOrder:input.entryOrder,sourceKey:raw.sourceKeys[input.table]});
      const synced=await syncPositionMatches(client,organizationId,category,actor.user_id);
      return {id:decisionId,table:input.table,position:input.position,createdMatches:synced.created};
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/sync',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};
    const organizationId=uuid(id),category=uuid(categoryId),actor=await organizationAccess(request,organizationId,true);
    return transaction(pool,async client=>{
      const {rows:[plan]}=await client.query('SELECT id FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2 FOR UPDATE',[organizationId,category]);
      if(!plan)fail(404,'BLUEPRINT_NOT_FOUND','No se encontró el formato de esta Copa.');
      const result=await syncPositionMatches(client,organizationId,category,actor.user_id);
      await audit(client,actor.user_id,organizationId,'fixture.position_synced',plan.id,'Cruces oficiales preparados',null,result);
      return result;
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/publish-draw', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    const { expectedRevision } = z.object({ expectedRevision: z.number().int().positive() }).strict().parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [plan] } = await client.query('SELECT * FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2 FOR UPDATE', [organizationId,category]);
      if (!plan) fail(404, 'BLUEPRINT_NOT_FOUND', 'No se encontró el sorteo.');
      if (plan.revision !== expectedRevision) fail(409, 'DRAW_CHANGED', 'El sorteo cambió. Actualizá antes de publicarlo.');
      const { rows: slots } = await client.query(`SELECT a.slot_code,a.entry_id,t.id team_id,t.name team_name,t.color,(t.shield_id IS NOT NULL) has_shield
        FROM fixture_position_assignments a LEFT JOIN team_entries e ON e.organization_id=a.organization_id AND e.id=a.entry_id
        LEFT JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
        WHERE a.organization_id=$1 AND a.blueprint_id=$2 ORDER BY a.slot_code`, [organizationId,plan.id]);
      if (slots.length !== 10) fail(409, 'DRAW_INCOMPLETE', 'El plan necesita sus diez posiciones.');
      const { rows: teams } = await client.query(`SELECT e.id entry_id,t.id team_id,t.name team_name,t.color,(t.shield_id IS NOT NULL) has_shield
        FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
        WHERE e.organization_id=$1 AND e.category_id=$2 AND e.status='active' ORDER BY t.name,t.id`,[organizationId,category]);
      const { rows: games } = await client.query(`SELECT code,stage,sporting_round,jornada_no,to_char(planned_date,'YYYY-MM-DD') planned_date,home_ref,away_ref FROM fixture_position_games WHERE organization_id=$1 AND blueprint_id=$2 ORDER BY ordinal`, [organizationId,plan.id]);
      const { rows: [competition] } = await client.query(`SELECT t.id tournament_id,t.name tournament_name,c.name category_name FROM categories c JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id WHERE c.organization_id=$1 AND c.id=$2`, [organizationId,category]);
      const snapshot = { blueprint: { name:plan.name, opening_first_jornada:plan.opening_first_jornada, opening_second_jornada:plan.opening_second_jornada, opening_first_date:plan.opening_first_date, opening_second_date:plan.opening_second_date, extra_reserved_date:plan.extra_reserved_date }, slots, teams, games };
      const { rows: [prior] } = await client.query('SELECT id FROM fixture_position_publications WHERE organization_id=$1 AND blueprint_id=$2 AND revision=$3', [organizationId,plan.id,plan.revision]);
      if (prior) return { id:prior.id, revision:plan.revision, reused:true, tournamentId:competition.tournament_id };
      const publicationId = randomUUID();
      await client.query('INSERT INTO fixture_position_publications(id,organization_id,blueprint_id,revision,snapshot,published_by) VALUES($1,$2,$3,$4,$5,$6)', [publicationId,organizationId,plan.id,plan.revision,JSON.stringify(snapshot),actor.user_id]);
      await audit(client,actor.user_id,organizationId,'fixture.draw_published',plan.id,'Publicación del sorteo',null,{revision:plan.revision,tournamentId:competition.tournament_id});
      return { id:publicationId, revision:plan.revision, reused:false, tournamentId:competition.tournament_id };
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint', async (request, reply) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    const input = positionBlueprintSchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rows: [found] } = await client.query('SELECT id FROM categories WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, category]);
      if (!found) fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
      const { rows: [existing] } = await client.query('SELECT id FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2', [organizationId, category]);
      if (existing) return { id: existing.id, reused: true };
      const { rowCount: activeFixture } = await client.query("SELECT 1 FROM fixture_phases WHERE organization_id=$1 AND category_id=$2 AND status='generated'", [organizationId, category]);
      if (activeFixture) fail(409, 'FIXTURE_ALREADY_GENERATED', 'El fixture oficial ya existe; revisá sus partidos antes de crear el plan.');
      const blueprintId = randomUUID();
      await client.query(`INSERT INTO fixture_position_blueprints(id,organization_id,category_id,name,opening_first_jornada,opening_second_jornada,opening_first_date,opening_second_date,extra_reserved_date,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [blueprintId,organizationId,category,input.name,input.opening.firstJornada,input.opening.secondJornada,input.opening.firstDate,input.opening.secondDate,input.extraReservedDate,actor.user_id]);
      for (const group of ['A','B']) for (let position=1;position<=5;position++) await client.query('INSERT INTO fixture_position_assignments(organization_id,blueprint_id,slot_code) VALUES($1,$2,$3)', [organizationId,blueprintId,`${group}${position}`]);
      for (const [index, game] of input.games.entries()) await client.query(`INSERT INTO fixture_position_games(id,organization_id,blueprint_id,code,ordinal,stage,sporting_round,jornada_no,planned_date,home_ref,away_ref)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [randomUUID(),organizationId,blueprintId,game.code,index+1,game.stage,game.sportingRound,game.jornadaNo,game.plannedDate,game.homeRef,game.awayRef]);
      await audit(client,actor.user_id,organizationId,'fixture.position_blueprint_created',blueprintId,'Plan privado por posiciones',null,{categoryId:category,games:input.games.length});
      return { id: blueprintId, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.patch('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/slots/:code', async (request) => {
    const { id, categoryId, code } = request.params as { id: string; categoryId: string; code: string };
    const organizationId = uuid(id), category = uuid(categoryId), slotCode = z.string().regex(/^[AB][1-5]$/).parse(code);
    const actor = await organizationAccess(request, organizationId, true);
    const { entryId } = z.object({ entryId: z.uuid().nullable() }).strict().parse(request.body);
    return transaction(pool, async (client) => {
      const { rows: [plan] } = await client.query('SELECT id FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2 FOR UPDATE', [organizationId, category]);
      if (!plan) fail(404, 'BLUEPRINT_NOT_FOUND', 'No se encontró el plan por posiciones.');
      const { rowCount: activeFixture } = await client.query("SELECT 1 FROM fixture_phases WHERE organization_id=$1 AND category_id=$2 AND status='generated'", [organizationId, category]);
      if (activeFixture) fail(409, 'FIXTURE_ALREADY_GENERATED', 'El fixture oficial ya existe; revisá sus partidos antes de cambiar el sorteo.');
      if((await client.query('SELECT 1 FROM draft_matches m JOIN fixture_position_games g ON g.organization_id=m.organization_id AND g.id=m.position_game_id JOIN fixture_position_blueprints b ON b.organization_id=g.organization_id AND b.id=g.blueprint_id WHERE b.organization_id=$1 AND b.category_id=$2 LIMIT 1',[organizationId,category])).rowCount)fail(409,'POSITION_MATCHES_ACTIVE','Los partidos oficiales ya fueron preparados. Editá cada cruce desde Partidos.');
      const { rows: slots } = await client.query('SELECT slot_code,entry_id FROM fixture_position_assignments WHERE organization_id=$1 AND blueprint_id=$2 FOR UPDATE', [organizationId, plan.id]);
      const target = slots.find(slot => slot.slot_code === slotCode);
      if (!target) fail(404, 'SLOT_NOT_FOUND', 'No se encontró esa posición.');
      if (entryId) {
        const { rows: [entry] } = await client.query("SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND id=$3 AND status='active'", [organizationId,category,entryId]);
        if (!entry) fail(404, 'TEAM_NOT_IN_CATEGORY', 'Elegí un equipo activo de este torneo.');
      }
      const previous = target.entry_id as string | null;
      if (previous === entryId) return { slotCode, entryId, changed: false };
      const other = entryId ? slots.find(slot => slot.entry_id === entryId) : null;
      await client.query('UPDATE fixture_position_assignments SET entry_id=NULL WHERE organization_id=$1 AND blueprint_id=$2 AND slot_code=$3', [organizationId,plan.id,slotCode]);
      if (other) await client.query('UPDATE fixture_position_assignments SET entry_id=NULL WHERE organization_id=$1 AND blueprint_id=$2 AND slot_code=$3', [organizationId,plan.id,other.slot_code]);
      await client.query('UPDATE fixture_position_assignments SET entry_id=$4 WHERE organization_id=$1 AND blueprint_id=$2 AND slot_code=$3', [organizationId,plan.id,slotCode,entryId]);
      if (other && previous) await client.query('UPDATE fixture_position_assignments SET entry_id=$4 WHERE organization_id=$1 AND blueprint_id=$2 AND slot_code=$3', [organizationId,plan.id,other.slot_code,previous]);
      await client.query('UPDATE fixture_position_blueprints SET revision=revision+1 WHERE id=$1', [plan.id]);
      await audit(client,actor.user_id,organizationId,'fixture.position_assigned',plan.id,'Asignación de sorteo',{slotCode,entryId:previous},{slotCode,entryId,swappedWith:other?.slot_code||null});
      return { slotCode, entryId, swappedWith: other?.slot_code || null, changed: true };
    });
  });
  app.patch('/api/v1/organizations/:id/categories/:categoryId/fixture/blueprint/opening', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    const { firstJornadaCodes } = z.object({ firstJornadaCodes: z.array(z.string().regex(/^G\d{2}$/)).refine(value=>value.length===0||value.length===2,'Elegí dos partidos o dejá la apertura pendiente.') }).strict().parse(request.body);
    if (new Set(firstJornadaCodes).size !== firstJornadaCodes.length) fail(400, 'OPENING_DUPLICATE', 'Elegí dos partidos diferentes.');
    return transaction(pool, async (client) => {
      const { rows: [plan] } = await client.query('SELECT * FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2 FOR UPDATE', [organizationId,category]);
      if (!plan) fail(404, 'BLUEPRINT_NOT_FOUND', 'No se encontró el plan por posiciones.');
      const { rowCount: activeFixture } = await client.query("SELECT 1 FROM fixture_phases WHERE organization_id=$1 AND category_id=$2 AND status='generated'", [organizationId,category]);
      if (activeFixture) fail(409, 'FIXTURE_ALREADY_GENERATED', 'El fixture oficial ya existe; revisá sus partidos antes de cambiar la apertura.');
      if((await client.query('SELECT 1 FROM draft_matches m JOIN fixture_position_games g ON g.organization_id=m.organization_id AND g.id=m.position_game_id JOIN fixture_position_blueprints b ON b.organization_id=g.organization_id AND b.id=g.blueprint_id WHERE b.organization_id=$1 AND b.category_id=$2 LIMIT 1',[organizationId,category])).rowCount)fail(409,'POSITION_MATCHES_ACTIVE','Los partidos oficiales ya fueron preparados. Reprogramá cada partido desde Fixture.');
      const { rows: opening } = await client.query("SELECT code,jornada_no FROM fixture_position_games WHERE organization_id=$1 AND blueprint_id=$2 AND stage='groups' AND sporting_round='F1' FOR UPDATE", [organizationId,plan.id]);
      if (opening.length !== 5 || firstJornadaCodes.some(code => !opening.some(game => game.code === code))) fail(409, 'OPENING_GAMES_CHANGED', 'La primera fecha ya no tiene los cinco cruces esperados.');
      await client.query(`UPDATE fixture_position_games SET jornada_no=CASE WHEN cardinality($3::text[])=0 THEN NULL WHEN code=ANY($3::text[]) THEN $4::integer ELSE $5::integer END,
        planned_date=CASE WHEN cardinality($3::text[])=0 THEN NULL WHEN code=ANY($3::text[]) THEN $6::date ELSE $7::date END
        WHERE organization_id=$1 AND blueprint_id=$2 AND stage='groups' AND sporting_round='F1'`, [organizationId,plan.id,firstJornadaCodes,plan.opening_first_jornada,plan.opening_second_jornada,plan.opening_first_date,plan.opening_second_date]);
      await client.query('UPDATE fixture_position_blueprints SET revision=revision+1 WHERE id=$1', [plan.id]);
      await audit(client,actor.user_id,organizationId,'fixture.opening_divided',plan.id,'Reparto de apertura',opening,{firstJornadaCodes});
      return { firstJornadaCodes, firstJornada:plan.opening_first_jornada, secondJornada:plan.opening_second_jornada };
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/phase', async (request, reply) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    z.object({}).strict().parse(request.body || {});
    const result = await transaction(pool, async (client) => {
      const { rows: [categoryRow] } = await client.query("SELECT id,status FROM categories WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, category]);
      if (!categoryRow) fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
      if (categoryRow.status !== 'published') fail(409, 'CATEGORY_NOT_PUBLISHED', 'Publicá el reglamento de la categoría antes de generar cruces.');
      const { rows: [rule] } = await client.query("SELECT version,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, category]);
      const parsed = rule && ruleSchema.safeParse(rule.rules);
      if (!parsed?.success || !parsed.data.initialPhase) fail(409, 'PHASE_RULE_REQUIRED', 'Definí y publicá la fase inicial del reglamento.');
      const { rows: [existing] } = await client.query('SELECT id,rule_version,mode,legs,group_count,status,revision FROM fixture_phases WHERE organization_id=$1 AND category_id=$2', [organizationId, category]);
      if (existing) {
        if (existing.rule_version !== rule.version) fail(409, 'PHASE_RULE_CHANGED', 'La fase existente usa otra versión de reglamento. Revisá el fixture antes de continuar.');
        return { ...existing, reused: true };
      }
      const phaseId = randomUUID();
      const { mode, legs, groupCount } = parsed.data.initialPhase;
      await client.query('INSERT INTO fixture_phases(id,organization_id,category_id,rule_version,mode,legs,group_count,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [phaseId, organizationId, category, rule.version, mode, legs, groupCount, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'fixture.phase_created', phaseId, 'Fase privada creada desde reglamento publicado', null, { categoryId: category, ruleVersion: rule.version, mode, legs, groupCount });
      return { id: phaseId, rule_version: rule.version, mode, legs, group_count: groupCount, status: 'draft', revision: 1, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/generate', async (request, reply) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    const { expectedRevision, seedOrder, legs, createMatchdays } = z.object({ expectedRevision: z.number().int().positive(), seedOrder: z.array(z.uuid()).min(2).max(256).optional(), legs:z.union([z.literal(1),z.literal(2)]).optional(),createMatchdays:z.boolean().optional() }).strict().parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rows: [phase] } = await client.query('SELECT * FROM fixture_phases WHERE organization_id=$1 AND category_id=$2 FOR UPDATE', [organizationId, category]);
      if (!phase) fail(409, 'PHASE_REQUIRED', 'Creá primero la fase privada de esta categoría.');
      if (phase.status === 'generated') return { id: phase.id, status: phase.status, revision: phase.revision, reused: true };
      if (phase.revision !== expectedRevision) fail(409, 'STALE_VERSION', 'El fixture cambió. Actualizá antes de generarlo.');
      if(legs&&phase.mode!=='knockout'&&legs!==phase.legs){await client.query('UPDATE fixture_phases SET legs=$1 WHERE id=$2',[legs,phase.id]);phase.legs=legs;}
      const { rows: [rule] } = await client.query("SELECT version,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, category]);
      if (rule?.version !== phase.rule_version) fail(409, 'RULES_CHANGED', 'El reglamento publicado cambió. Revisá la fase antes de generar.');
      const parsedRules = ruleSchema.safeParse(rule.rules);
      if (!parsedRules.success) fail(409, 'INVALID_RULES', 'El reglamento de esta fase necesita revisión.');
      const planned = parsedRules.data?.competitionPlan;
      const { rows: entries } = await client.query("SELECT e.id,t.name FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE e.organization_id=$1 AND e.category_id=$2 AND e.status='active' ORDER BY lower(t.name),e.id", [organizationId, category]);
      if (entries.length < 2) fail(409, 'TEAMS_REQUIRED', 'Se necesitan al menos dos equipos activos para generar cruces.');
      const { rows: manualMatches } = await client.query('SELECT id,home_entry_id,away_entry_id FROM draft_matches WHERE organization_id=$1 AND category_id=$2 AND fixture_phase_id IS NULL AND archived_at IS NULL FOR UPDATE', [organizationId, category]);
      const unused = new Set(manualMatches.map((match) => match.id as string));
      let roundCount = 0, matchCount = 0;
      async function insertRound(ordinal: number, leg: number, groupNo: number) {
        const roundId = randomUUID();
        await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,$5,$6)', [roundId, organizationId, phase.id, ordinal, leg, groupNo]);
        roundCount++;
        return roundId;
      }
      async function insertPair(pair: { homeEntryId: string; awayEntryId: string }, roundId: string, leg: number) {
        let manual = manualMatches.find((match) => unused.has(match.id) && match.home_entry_id === pair.homeEntryId && match.away_entry_id === pair.awayEntryId);
        if (!manual && phase.legs === 1) manual = manualMatches.find((match) => unused.has(match.id) && match.home_entry_id === pair.awayEntryId && match.away_entry_id === pair.homeEntryId);
        const id = manual?.id || randomUUID();
        if (manual) {
          unused.delete(manual.id);
          await client.query('UPDATE draft_matches SET fixture_phase_id=$1,fixture_round_id=$2,fixture_leg=$3 WHERE organization_id=$4 AND id=$5', [phase.id, roundId, leg, organizationId, id]);
        } else await client.query('INSERT INTO draft_matches(id,organization_id,category_id,home_entry_id,away_entry_id,match_date,created_by,fixture_phase_id,fixture_round_id,fixture_leg) VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9)', [id, organizationId, category, pair.homeEntryId, pair.awayEntryId, actor.user_id, phase.id, roundId, leg]);
        matchCount++;
        return id as string;
      }
      if (phase.mode === 'knockout') {
        const plan = planned?.qualification.from === 'direct' ? planned : null;
        if (plan && plan.qualification.from === 'direct' && entries.length !== plan.qualification.entrants) fail(409, 'PARTICIPANT_COUNT', `El plan espera ${plan.qualification.entrants} equipos; hay ${entries.length}. Ajustá el reglamento antes de generar.`);
        if (plan && manualMatches.length) fail(409, 'DRAW_HAS_DRAFT_MATCHES', 'El sorteo planificado necesita cruces libres. Revisá los partidos borrador antes de generar.');
        const entryIds = entries.map((entry) => entry.id as string);
        const positions = plan?.rounds[0].pairing === 'positions';
        if (positions && (!seedOrder || seedOrder.length !== entryIds.length || new Set(seedOrder).size !== entryIds.length || seedOrder.some(entry => !entryIds.includes(entry)))) fail(400, 'SEED_ORDER_REQUIRED', 'Ordená todos los equipos antes de generar cruces por posiciones.');
        const ordered = positions ? [...seedOrder!] : [...entryIds];
        if (!positions) for (let index = ordered.length - 1; index > 0; index--) { const other = randomInt(index + 1); [ordered[index], ordered[other]] = [ordered[other], ordered[index]]; }
        const bracket = knockoutBracket(ordered, plan?.bracketSize);
        const sources = new Map<string,string>();
        let ordinal = 1;
        for (const stage of [...new Set(bracket.map((slot) => slot.stage))]) {
          if (stage > 1 && plan?.rounds[stage - 1]?.pairing === 'draw') break;
          const legs = plan?.rounds[stage - 1]?.legs ?? phase.legs;
          const homeRoundId = await insertRound(ordinal++, 1, 1);
          const returnRoundId = legs === 2 ? await insertRound(ordinal++, 2, 1) : null;
          for (const slot of bracket.filter((item) => item.stage === stage)) {
            let matchId: string | null = null, returnMatchId: string | null = null;
            if (slot.homeEntryId && slot.awayEntryId) {
              matchId = await insertPair({ homeEntryId: slot.homeEntryId, awayEntryId: slot.awayEntryId }, homeRoundId, 1);
              if (returnRoundId) returnMatchId = await insertPair({ homeEntryId: slot.awayEntryId, awayEntryId: slot.homeEntryId }, returnRoundId, 2);
            } else if (slot.homeEntryId || slot.awayEntryId) await client.query('INSERT INTO fixture_byes(organization_id,round_id,entry_id) VALUES($1,$2,$3)', [organizationId, homeRoundId, slot.homeEntryId || slot.awayEntryId]);
            const slotId = randomUUID();
            await client.query(`INSERT INTO fixture_bracket_slots(id,organization_id,phase_id,round_id,stage,slot,home_entry_id,away_entry_id,home_source_id,away_source_id,match_id,return_match_id)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [slotId, organizationId, phase.id, homeRoundId, stage, slot.slot, slot.homeEntryId, slot.awayEntryId, slot.homeSourceSlot ? sources.get(`${stage - 1}:${slot.homeSourceSlot}`) : null, slot.awaySourceSlot ? sources.get(`${stage - 1}:${slot.awaySourceSlot}`) : null, matchId, returnMatchId]);
            sources.set(`${stage}:${slot.slot}`, slotId);
          }
        }
        if (plan) await audit(client, actor.user_id, organizationId, positions ? 'fixture.seeding_completed' : 'fixture.draw_completed', phase.id, positions ? 'Orden de posiciones definido por el organizador' : 'Sorteo inicial según el plan publicado', null, { categoryId: category, ruleVersion: phase.rule_version, entryOrder: ordered, bracketSize: plan.bracketSize });
      } else {
        const groups = phase.mode === 'groups' ? drawGroups(entries.map((entry) => entry.id as string), phase.group_count) : [entries.map((entry) => entry.id as string)];
        const qualification = planned?.qualification;
        if (qualification?.from === 'league' && qualification.top > entries.length) fail(409, 'QUALIFICATION_TEAMS', 'Hay menos equipos que puestos de clasificación previstos.');
        if (qualification?.from === 'groups' && (groups.some((group) => group.length < qualification.perGroup) || groups.reduce((total, group) => total + group.length - qualification.perGroup, 0) < qualification.bestRemaining)) fail(409, 'QUALIFICATION_TEAMS', 'Los grupos no tienen suficientes equipos para los puestos de clasificación previstos.');
        for (let index = 0; index < groups.length; index++) {
          if (phase.mode === 'groups') for (const entryId of groups[index]) await client.query('INSERT INTO fixture_group_entries(organization_id,phase_id,group_no,entry_id) VALUES($1,$2,$3,$4)', [organizationId, phase.id, index + 1, entryId]);
          for (const round of roundRobin(groups[index], phase.legs)) {
            const roundId = await insertRound(round.ordinal, round.leg, index + 1);
            for (const entryId of round.byeEntryIds) await client.query('INSERT INTO fixture_byes(organization_id,round_id,entry_id) VALUES($1,$2,$3)', [organizationId, roundId, entryId]);
            for (const pair of round.matches) await insertPair(pair, roundId, round.leg);
          }
        }
      }
      if (unused.size) fail(409, 'UNMATCHED_DRAFT_MATCHES', 'Hay partidos borrador que no corresponden a los cruces o repiten localía. Revisalos antes de generar el fixture.');
      if(createMatchdays&&!manualMatches.length){
        const {rows:[categoryEdition]}=await client.query('SELECT edition_id FROM categories WHERE organization_id=$1 AND id=$2',[organizationId,category]);
        const {rows:[latestDay]}=await client.query('SELECT coalesce(max(ordinal),0)::int ordinal FROM matchdays WHERE organization_id=$1 AND edition_id=$2',[organizationId,categoryEdition.edition_id]);
        const {rows:generatedRounds}=await client.query('SELECT DISTINCT r.ordinal FROM fixture_rounds r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.fixture_round_id=r.id WHERE r.organization_id=$1 AND r.phase_id=$2 ORDER BY r.ordinal',[organizationId,phase.id]);
        for(const round of generatedRounds){
          const dayId=randomUUID(),ordinal=latestDay.ordinal+round.ordinal;
          await client.query('INSERT INTO matchdays(id,organization_id,edition_id,ordinal,created_by) VALUES($1,$2,$3,$4,$5)',[dayId,organizationId,categoryEdition.edition_id,ordinal,actor.user_id]);
          await client.query('UPDATE draft_matches SET matchday_id=$1 WHERE organization_id=$2 AND fixture_phase_id=$3 AND fixture_round_id IN (SELECT id FROM fixture_rounds WHERE organization_id=$2 AND phase_id=$3 AND ordinal=$4) AND matchday_id IS NULL',[dayId,organizationId,phase.id,round.ordinal]);
        }
      }
      const { rows: [updated] } = await client.query("UPDATE fixture_phases SET status='generated',generated_at=now(),revision=revision+1 WHERE id=$1 RETURNING id,status,revision", [phase.id]);
      await audit(client, actor.user_id, organizationId, 'fixture.generated', phase.id, 'Cruces privados generados', null, { categoryId: category, mode: phase.mode, participants: entries.length, rounds: roundCount, matches: matchCount, reusedDraftMatches: manualMatches.length });
      return { ...updated, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  registerFixtureProgressRoutes(app,pool,organizationAccess,fail);
  registerFixtureRefereeRoutes(app,pool,organizationAccess,fail);
  async function scheduleContext(client: PoolClient, organizationId: string, matchId: string, input: z.infer<typeof fixtureScheduleSchema>) {
    const { rows: [match] } = await client.query(`SELECT m.id,m.category_id,m.home_entry_id,m.away_entry_id,m.match_date,m.matchday_id,m.referee_id,m.schedule_revision,
      ed.id edition_id,t.id tournament_id,t.timezone,p.status phase_status
      FROM draft_matches m LEFT JOIN fixture_phases p ON p.organization_id=m.organization_id AND p.id=m.fixture_phase_id
      JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      WHERE m.organization_id=$1 AND m.id=$2 AND m.archived_at IS NULL`, [organizationId, matchId]);
    if (!match || (match.phase_status && match.phase_status !== 'generated')) fail(404, 'MATCH_NOT_FOUND', 'No se encontró un partido programable de esta organización.');
    if ((await client.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [organizationId, matchId])).rowCount) fail(409, 'MATCH_STARTED', 'El partido ya tiene eventos. El horario quedó cerrado para este registro.');
    const { rows: [day] } = await client.query('SELECT id,edition_id,status,revision FROM matchdays WHERE organization_id=$1 AND id=$2 AND archived_at IS NULL', [organizationId, input.matchdayId]);
    if (!day || day.edition_id !== match.edition_id) fail(404, 'MATCHDAY_NOT_FOUND', 'La jornada debe pertenecer a la edición del partido.');
    if (match.matchday_id && match.matchday_id !== day.id) fail(409, 'MATCHDAY_LOCKED', 'Reprogramar conserva la jornada original.');
    if (day.status === 'published' && !match.matchday_id) fail(409, 'MATCHDAY_PUBLISHED', 'Programá este partido en una Fecha privada; una Fecha publicada solo admite reprogramaciones de sus partidos.');
    const { rowCount: venueCount } = await client.query('SELECT 1 FROM tournament_venues WHERE organization_id=$1 AND tournament_id=$2 AND venue_id=$3 AND archived_at IS NULL', [organizationId, match.tournament_id, input.venueId]);
    if (!venueCount) fail(404, 'VENUE_NOT_FOUND', 'La sede debe estar activa en este torneo.');
    if (match.schedule_revision !== input.expectedRevision) fail(409, 'STALE_VERSION', 'El horario cambió. Actualizá antes de guardar.');
    const {rows:[referee]}=input.refereeId ? await client.query('SELECT id,name FROM fixture_referees WHERE organization_id=$1 AND id=$2 AND (archived_at IS NULL OR id=$3)',[organizationId,input.refereeId,match.referee_id]) : {rows:[]};
    if(input.refereeId && !referee)fail(404,'REFEREE_NOT_FOUND','Elegí un árbitro activo de esta organización.');
    const refereeName:string|null=referee?.name??input.refereeName;
    if (match.match_date && input.date !== match.match_date.toISOString().slice(0, 10)) {
      const { rowCount } = await client.query("SELECT 1 FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 AND status='approved' LIMIT 1", [organizationId, matchId]);
      if (rowCount) fail(409, 'LINEUP_DATE_LOCKED', 'Hay una planilla aprobada para otra fecha. Revisala antes de reprogramar el día.');
    }
    const { rows: [clock] } = await client.query("SELECT (($1::date + $2::time) AT TIME ZONE $3) starts_at,to_char((($1::date + $2::time) AT TIME ZONE $3) AT TIME ZONE $3,'YYYY-MM-DD HH24:MI') local_clock", [input.date, input.time, match.timezone]);
    if (clock.local_clock !== `${input.date} ${input.time}`) fail(400, 'INVALID_LOCAL_TIME', 'Esa hora local no existe en la zona del torneo.');
    const conflicts = await scheduleConflicts(client, organizationId, matchId, match.home_entry_id, match.away_entry_id, input.venueId, input.courtLabel, input.refereeId??null, refereeName, new Date(clock.starts_at), input.durationMinutes);
    return { match, day, startsAt: clock.starts_at as Date, refereeName, ...conflicts };
  }
  async function publicationReadiness(client: PoolClient, organizationId: string, matchdayId: string) {
    const snapshot = await matchdaySnapshot(client, organizationId, matchdayId);
    const missing: string[] = [];
    if (!snapshot.length) missing.push('La jornada todavía no tiene partidos programados.');
    if(snapshot.some(match=>match.position_match&&!match.match_date))missing.push('Indicá la fecha de todos los cruces del plan por posiciones.');
    if(snapshot.some(match=>!match.position_match&&(!match.match_date||!match.match_time||!match.venue_id)))missing.push('Programá día, hora y sede de todos los partidos antes de publicar.');
    const { rows } = await client.query(`SELECT m.id,c.status category_status,ed.status edition_status,t.status tournament_status,h.status home_status,a.status away_status,h.public_visible home_public,a.public_visible away_public
      FROM draft_matches m JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      JOIN team_entries h ON h.organization_id=m.organization_id AND h.id=m.home_entry_id
      JOIN team_entries a ON a.organization_id=m.organization_id AND a.id=m.away_entry_id
      WHERE m.organization_id=$1 AND m.matchday_id=$2 AND m.archived_at IS NULL`, [organizationId, matchdayId]);
    for (const match of rows) if (match.category_status !== 'published' || match.edition_status !== 'published' || match.tournament_status !== 'published' || match.home_status !== 'active' || match.away_status !== 'active' || !match.home_public || !match.away_public) missing.push('Publicá la categoría y obtené autorización pública de ambos equipos para cada partido.');
    return { snapshot, missing: [...new Set(missing)] };
  }
  app.get('/api/v1/organizations/:id/editions/:editionId/matchdays', async (request) => {
    const { id, editionId } = request.params as { id: string; editionId: string };
    const organizationId = uuid(id), edition = uuid(editionId); await organizationAccess(request, organizationId);
    return transaction(pool, async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM editions WHERE organization_id=$1 AND id=$2', [organizationId, edition]);
      if (!rowCount) fail(404, 'EDITION_NOT_FOUND', 'No se encontró la edición.');
      const { rows } = await client.query('SELECT id,edition_id,ordinal,status,revision,archived_at FROM matchdays WHERE organization_id=$1 AND edition_id=$2 ORDER BY ordinal', [organizationId, edition]);
      const days = [];
      for (const day of rows) {
        days.push({ ...day, archivedAt:day.archived_at, matches:day.archived_at?[]:await matchdaySnapshot(client,organizationId,day.id), archivedMatches:day.archived_at?[]:await matchdaySnapshot(client,organizationId,day.id,true) });
      }
      return days;
    });
  });
  app.post('/api/v1/organizations/:id/editions/:editionId/matchdays', async (request, reply) => {
    const { id, editionId } = request.params as { id: string; editionId: string };
    const organizationId = uuid(id), edition = uuid(editionId), actor = await organizationAccess(request, organizationId, true);
    const { ordinal } = matchdayCreateSchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rowCount } = await client.query('SELECT 1 FROM editions WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, edition]);
      if (!rowCount) fail(404, 'EDITION_NOT_FOUND', 'No se encontró la edición.');
      const { rows: [existing] } = await client.query('SELECT id,ordinal,status,revision FROM matchdays WHERE organization_id=$1 AND edition_id=$2 AND ordinal=$3', [organizationId, edition, ordinal]);
      if (existing) {
        const {rows:[archived]}=await client.query('SELECT archived_at FROM matchdays WHERE organization_id=$1 AND id=$2',[organizationId,existing.id]);
        if(archived?.archived_at){await client.query('UPDATE matchdays SET archived_at=NULL,archived_by=NULL,revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,existing.id]);await audit(client,actor.user_id,organizationId,'matchday.restored',existing.id,'Fecha recuperada',null,{ordinal});return {...existing,reused:true,restored:true};}
        return { ...existing, reused: true };
      }
      const matchdayId = randomUUID();
      await client.query('INSERT INTO matchdays(id,organization_id,edition_id,ordinal,created_by) VALUES($1,$2,$3,$4,$5)', [matchdayId, organizationId, edition, ordinal, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'matchday.created', matchdayId, `Fecha ${ordinal} creada en privado`, null, { editionId: edition, ordinal });
      return { id: matchdayId, ordinal, status: 'draft', revision: 1, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  app.post('/api/v1/organizations/:id/matchdays/:matchdayId/matches', async (request, reply) => {
    const { id, matchdayId } = request.params as { id: string; matchdayId: string };
    const organizationId=uuid(id),dayId=uuid(matchdayId),actor=await organizationAccess(request,organizationId,true);
    const input=fixtureScheduleSchema.omit({matchdayId:true,expectedRevision:true,reason:true}).extend({categoryId:z.uuid(),homeEntryId:z.uuid(),awayEntryId:z.uuid()}).strict().parse(request.body);
    if(input.homeEntryId===input.awayEntryId)fail(400,'SAME_TEAM','Elegí dos equipos distintos.');
    const result=await transaction(pool,async(client)=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const {rows:[day]}=await client.query('SELECT id,edition_id,status FROM matchdays WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,dayId]);
      if(!day)fail(404,'MATCHDAY_NOT_FOUND','No se encontró la Fecha.');
      if(day.status!=='draft')fail(409,'MATCHDAY_PUBLISHED','Agregá partidos antes de publicar la Fecha.');
      const {rows:[category]}=await client.query('SELECT id FROM categories WHERE organization_id=$1 AND id=$2 AND edition_id=$3',[organizationId,input.categoryId,day.edition_id]);
      if(!category)fail(404,'CATEGORY_NOT_FOUND','La categoría no pertenece a esta Fecha.');
      const {rows:entries}=await client.query("SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active' AND id=ANY($3::uuid[])",[organizationId,input.categoryId,[input.homeEntryId,input.awayEntryId]]);
      if(entries.length!==2)fail(400,'TEAMS_NOT_IN_CATEGORY','Elegí dos equipos activos de la categoría.');
      const matchId=randomUUID();
      await client.query('INSERT INTO draft_matches(id,organization_id,category_id,home_entry_id,away_entry_id,match_date,created_by,manual_participants) VALUES($1,$2,$3,$4,$5,$6,$7,true)',[matchId,organizationId,input.categoryId,input.homeEntryId,input.awayEntryId,input.date,actor.user_id]);
      const context=await scheduleContext(client,organizationId,matchId,{...input,matchdayId:dayId,expectedRevision:0,reason:'Partido creado a mano'});
      if(context.hard.length)fail(409,'SCHEDULE_CONFLICT',context.hard.join(' '));
      await client.query('UPDATE draft_matches SET matchday_id=$3,venue_id=$4,court_label=$5,starts_at=$6,duration_minutes=$7,referee_name=$8,referee_id=$9,schedule_revision=1 WHERE organization_id=$1 AND id=$2',[organizationId,matchId,dayId,input.venueId,input.courtLabel,context.startsAt,input.durationMinutes,context.refereeName,input.refereeId??null]);
      await client.query('INSERT INTO match_schedule_history(id,organization_id,match_id,revision,before_data,after_data,reason,changed_by) VALUES($1,$2,$3,1,NULL,$4,$5,$6)',[randomUUID(),organizationId,matchId,JSON.stringify(input),'Partido creado a mano',actor.user_id]);
      await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,dayId]);
      await audit(client,actor.user_id,organizationId,'fixture.manual_match_created',matchId,'Partido creado a mano',null,{matchdayId:dayId,categoryId:input.categoryId,homeEntryId:input.homeEntryId,awayEntryId:input.awayEntryId});
      return {id:matchId,scheduleRevision:1,warnings:context.warnings};
    });
    return reply.code(201).send(result);
  });
  app.post('/api/v1/organizations/:id/fixture/matches/:matchId/schedule/preview', async (request) => {
    const { id, matchId } = request.params as { id: string; matchId: string };
    const organizationId = uuid(id); await organizationAccess(request, organizationId, true);
    const input = fixtureScheduleSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const context = await scheduleContext(client, organizationId, uuid(matchId), input);
      return { conflicts: context.hard, warnings: context.warnings, canSave: context.hard.length === 0 };
    });
  });
  app.patch('/api/v1/organizations/:id/fixture/matches/:matchId/schedule', async (request) => {
    const { id, matchId } = request.params as { id: string; matchId: string };
    const organizationId = uuid(id), match = uuid(matchId), actor = await organizationAccess(request, organizationId, true);
    const input = fixtureScheduleSchema.parse(request.body);
    return transaction(pool, async (client) => {
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
      const { rows: [edition] } = await client.query(`SELECT ed.id FROM draft_matches m JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id WHERE m.organization_id=$1 AND m.id=$2`, [organizationId, match]);
      if (!edition) fail(404, 'MATCH_NOT_FOUND', 'No se encontró el partido.');
      await client.query('SELECT id FROM editions WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, edition.id]);
      await client.query('SELECT id FROM draft_matches WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, match]);
      const context = await scheduleContext(client, organizationId, match, input);
      if (context.hard.length) fail(409, 'SCHEDULE_CONFLICT', context.hard.join(' '));
      const { rows: [before] } = await client.query('SELECT matchday_id,venue_id,court_label,match_date,starts_at,duration_minutes,referee_id,referee_name,schedule_revision FROM draft_matches WHERE organization_id=$1 AND id=$2', [organizationId, match]);
      const { rows: [updated] } = await client.query(`UPDATE draft_matches SET matchday_id=$3,venue_id=$4,court_label=$5,match_date=$6,starts_at=$7,duration_minutes=$8,referee_name=$9,referee_id=$10,schedule_revision=schedule_revision+1
        WHERE organization_id=$1 AND id=$2 RETURNING schedule_revision`, [organizationId, match, input.matchdayId, input.venueId, input.courtLabel, input.date, context.startsAt, input.durationMinutes, context.refereeName, input.refereeId??null]);
      const after = { matchdayId: input.matchdayId, venueId: input.venueId, courtLabel: input.courtLabel, date: input.date, time: input.time, durationMinutes: input.durationMinutes, refereeId: input.refereeId??null, refereeName: context.refereeName };
      await client.query('INSERT INTO match_schedule_history(id,organization_id,match_id,revision,before_data,after_data,reason,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), organizationId, match, updated.schedule_revision, before.schedule_revision ? JSON.stringify(before) : null, JSON.stringify(after), input.reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, before.schedule_revision ? 'fixture.reprogrammed' : 'fixture.scheduled', match, input.reason, before.schedule_revision ? before : null, after);
      if (context.day.status === 'published') {
        const { rows: [day] } = await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2 RETURNING id,revision', [organizationId, input.matchdayId]);
        await publishMatchdaySnapshot(client, organizationId, day, actor.user_id, input.reason, 'matchday.reprogrammed');
      } else await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2', [organizationId, input.matchdayId]);
      return { id: match, scheduleRevision: updated.schedule_revision, warnings: context.warnings };
    });
  });
  app.post('/api/v1/organizations/:id/matchdays/:matchdayId/schedule-batch', async (request) => {
    const { id, matchdayId } = request.params as { id: string; matchdayId: string };
    const organizationId = uuid(id), dayId = uuid(matchdayId), actor = await organizationAccess(request, organizationId, true);
    const input = z.object({ matches: z.array(z.object({ matchId: z.uuid(), schedule: fixtureScheduleSchema }).strict()).min(1).max(64) }).strict().parse(request.body);
    if (new Set(input.matches.map(item => item.matchId)).size !== input.matches.length) fail(400, 'DUPLICATE_MATCH', 'Un partido aparece más de una vez.');
    if (input.matches.some(item => item.schedule.matchdayId !== dayId)) fail(400, 'MATCHDAY_MISMATCH', 'Los partidos deben pertenecer a esta Fecha.');
    return transaction(pool, async client => {
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
      const { rows: [day] } = await client.query('SELECT id,status FROM matchdays WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, dayId]);
      if (!day) fail(404, 'MATCHDAY_NOT_FOUND', 'No se encontró la Fecha.');
      if (day.status !== 'draft') fail(409, 'MATCHDAY_PUBLISHED', 'Programá en lote antes de publicar la Fecha.');
      const results = [];
      for (const item of input.matches) {
        const { rows: [locked] } = await client.query('SELECT matchday_id FROM draft_matches WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, item.matchId]);
        if (!locked || locked.matchday_id !== dayId) fail(404, 'MATCH_NOT_FOUND', 'Un partido no pertenece a esta Fecha.');
        const context = await scheduleContext(client, organizationId, item.matchId, item.schedule);
        if (context.hard.length) fail(409, 'SCHEDULE_CONFLICT', context.hard.join(' '));
        const { rows: [before] } = await client.query('SELECT matchday_id,venue_id,court_label,match_date,starts_at,duration_minutes,referee_id,referee_name,schedule_revision FROM draft_matches WHERE organization_id=$1 AND id=$2', [organizationId, item.matchId]);
        const { rows: [updated] } = await client.query(`UPDATE draft_matches SET venue_id=$3,court_label=$4,match_date=$5,starts_at=$6,duration_minutes=$7,referee_name=$8,referee_id=$9,schedule_revision=schedule_revision+1 WHERE organization_id=$1 AND id=$2 RETURNING schedule_revision`, [organizationId, item.matchId, item.schedule.venueId, item.schedule.courtLabel, item.schedule.date, context.startsAt, item.schedule.durationMinutes, context.refereeName, item.schedule.refereeId??null]);
        const after = { ...item.schedule, refereeName: context.refereeName };
        await client.query('INSERT INTO match_schedule_history(id,organization_id,match_id,revision,before_data,after_data,reason,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(),organizationId,item.matchId,updated.schedule_revision,before.schedule_revision?JSON.stringify(before):null,JSON.stringify(after),item.schedule.reason,actor.user_id]);
        await audit(client,actor.user_id,organizationId,before.schedule_revision?'fixture.reprogrammed':'fixture.scheduled',item.matchId,item.schedule.reason,before.schedule_revision?before:null,after);
        results.push({ id:item.matchId,scheduleRevision:updated.schedule_revision,warnings:context.warnings });
      }
      await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,dayId]);
      return { matches:results };
    });
  });
  app.post('/api/v1/organizations/:id/fixture/matches/:matchId/archive', async request => {
    const {id,matchId}=request.params as {id:string;matchId:string};
    const organizationId=uuid(id),match=uuid(matchId),actor=await organizationAccess(request,organizationId,true);
    return transaction(pool,async client=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const {rows:[item]}=await client.query('SELECT m.id,m.matchday_id,m.fixture_phase_id,m.archived_at,md.status day_status FROM draft_matches m JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id WHERE m.organization_id=$1 AND m.id=$2 FOR UPDATE OF m,md',[organizationId,match]);
      if(!item)fail(404,'MATCH_NOT_FOUND','No se encontró el partido.');
      if(item.fixture_phase_id)fail(409,'DRAWN_MATCH','Este cruce pertenece al sorteo. Modificá sus equipos u horario.');
      if(item.day_status!=='draft')fail(409,'MATCHDAY_PUBLISHED','La Fecha publicada conserva sus partidos.');
      if(item.archived_at)return {id:match,archived:true};
      const {rowCount}=await client.query('SELECT 1 FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 UNION SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2 LIMIT 1',[organizationId,match]);
      if(rowCount)fail(409,'MATCH_IN_USE','El partido ya tiene planilla o acta.');
      await client.query('UPDATE draft_matches SET archived_at=now(),archived_by=$3 WHERE organization_id=$1 AND id=$2',[organizationId,match,actor.user_id]);
      await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,item.matchday_id]);
      await audit(client,actor.user_id,organizationId,'fixture.manual_match_archived',match,'Partido retirado de la Fecha',null,{matchdayId:item.matchday_id});
      return {id:match,archived:true};
    });
  });
  app.post('/api/v1/organizations/:id/fixture/matches/:matchId/restore', async request => {
    const {id,matchId}=request.params as {id:string;matchId:string};
    const organizationId=uuid(id),match=uuid(matchId),actor=await organizationAccess(request,organizationId,true);
    return transaction(pool,async client=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const {rows:[item]}=await client.query('SELECT m.*,md.status day_status,md.archived_at day_archived FROM draft_matches m JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id WHERE m.organization_id=$1 AND m.id=$2 FOR UPDATE OF m,md',[organizationId,match]);
      if(!item)fail(404,'MATCH_NOT_FOUND','No se encontró el partido.');
      if(!item.archived_at)return {id:match,restored:true};
      if(item.day_status!=='draft'||item.day_archived)fail(409,'MATCHDAY_UNAVAILABLE','Recuperá primero la Fecha privada.');
      if(item.starts_at){const conflicts=await scheduleConflicts(client,organizationId,match,item.home_entry_id,item.away_entry_id,item.venue_id,item.court_label,item.referee_id,item.referee_name,new Date(item.starts_at),item.duration_minutes);if(conflicts.hard.length)fail(409,'SCHEDULE_CONFLICT',conflicts.hard.join(' '));}
      await client.query('UPDATE draft_matches SET archived_at=NULL,archived_by=NULL WHERE organization_id=$1 AND id=$2',[organizationId,match]);
      await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,item.matchday_id]);
      await audit(client,actor.user_id,organizationId,'fixture.manual_match_restored',match,'Partido recuperado',null,{matchdayId:item.matchday_id});
      return {id:match,restored:true};
    });
  });
  app.post('/api/v1/organizations/:id/matchdays/:matchdayId/archive', async request => {
    const {id,matchdayId}=request.params as {id:string;matchdayId:string};
    const organizationId=uuid(id),dayId=uuid(matchdayId),actor=await organizationAccess(request,organizationId,true);
    return transaction(pool,async client=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const {rows:[day]}=await client.query('SELECT id,status,archived_at FROM matchdays WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,dayId]);
      if(!day)fail(404,'MATCHDAY_NOT_FOUND','No se encontró la Fecha.');
      if(day.status!=='draft')fail(409,'MATCHDAY_PUBLISHED','La Fecha publicada conserva su historial.');
      if(day.archived_at)return {id:dayId,archived:true};
      const {rowCount}=await client.query('SELECT 1 FROM draft_matches WHERE organization_id=$1 AND matchday_id=$2 AND archived_at IS NULL LIMIT 1',[organizationId,dayId]);
      if(rowCount)fail(409,'MATCHDAY_NOT_EMPTY','Retirá primero los partidos creados a mano. Los cruces sorteados se conservan.');
      await client.query('UPDATE matchdays SET archived_at=now(),archived_by=$3,revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,dayId,actor.user_id]);
      await audit(client,actor.user_id,organizationId,'matchday.archived',dayId,'Fecha vacía retirada',null,null);
      return {id:dayId,archived:true};
    });
  });
  app.post('/api/v1/organizations/:id/matchdays/:matchdayId/restore', async request => {
    const {id,matchdayId}=request.params as {id:string;matchdayId:string};
    const organizationId=uuid(id),dayId=uuid(matchdayId),actor=await organizationAccess(request,organizationId,true);
    return transaction(pool,async client=>{
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
      const {rows:[day]}=await client.query('SELECT id,archived_at FROM matchdays WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,dayId]);
      if(!day)fail(404,'MATCHDAY_NOT_FOUND','No se encontró la Fecha.');
      if(!day.archived_at)return {id:dayId,restored:true};
      await client.query('UPDATE matchdays SET archived_at=NULL,archived_by=NULL,revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,dayId]);
      await audit(client,actor.user_id,organizationId,'matchday.restored',dayId,'Fecha recuperada',null,null);
      return {id:dayId,restored:true};
    });
  });
  app.patch('/api/v1/organizations/:id/fixture/matches/:matchId/participants', async (request) => {
    const { id, matchId } = request.params as { id: string; matchId: string };
    const organizationId = uuid(id), match = uuid(matchId), actor = await organizationAccess(request, organizationId, true);
    const input = z.object({ homeEntryId: z.uuid(), awayEntryId: z.uuid(), reason: z.string().trim().min(3).max(300) }).strict().parse(request.body);
    if (input.homeEntryId === input.awayEntryId) fail(400, 'SAME_TEAM', 'Elegí dos equipos distintos.');
    return transaction(pool, async (client) => {
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
      const { rows: [current] } = await client.query('SELECT id,category_id,home_entry_id,away_entry_id,matchday_id,fixture_phase_id,fixture_leg FROM draft_matches WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, match]);
      if (!current) fail(404, 'MATCH_NOT_FOUND', 'No se encontró el partido.');
      if (current.home_entry_id === input.homeEntryId && current.away_entry_id === input.awayEntryId) return { id: match, unchanged: true };
      const { rows: entries } = await client.query("SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active' AND id=ANY($3::uuid[])", [organizationId, current.category_id, [input.homeEntryId, input.awayEntryId]]);
      if (entries.length !== 2) fail(400, 'TEAMS_OUT_OF_CATEGORY', 'Elegí equipos activos de esta categoría.');
      const { rows: [slot] } = await client.query('SELECT id,match_id,return_match_id,decider_match_id FROM fixture_bracket_slots WHERE organization_id=$1 AND (match_id=$2 OR return_match_id=$2 OR decider_match_id=$2) FOR UPDATE', [organizationId, match]);
      const matchIds = slot?[slot.match_id,slot.return_match_id,slot.decider_match_id].filter(Boolean):[match];
      const { rowCount: used } = await client.query('SELECT 1 FROM lineup_versions WHERE organization_id=$1 AND match_id=ANY($2::uuid[]) UNION SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=ANY($2::uuid[]) LIMIT 1', [organizationId, matchIds]);
      if (used) fail(409, 'MATCH_IN_USE', 'Este partido ya tiene planilla o acta. Revisá esas versiones antes de cambiar los equipos.');
      const before = { homeEntryId: current.home_entry_id, awayEntryId: current.away_entry_id };
      await client.query('UPDATE draft_matches SET home_entry_id=$3,away_entry_id=$4,manual_participants=true WHERE organization_id=$1 AND id=$2', [organizationId, match, input.homeEntryId, input.awayEntryId]);
      if (slot) {
        const canonicalHome = current.fixture_leg === 2 ? input.awayEntryId : input.homeEntryId;
        const canonicalAway = current.fixture_leg === 2 ? input.homeEntryId : input.awayEntryId;
        const {rows:relatedMatches}=await client.query('SELECT id,fixture_leg FROM draft_matches WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND id<>$3',[organizationId,matchIds,match]);
        for(const related of relatedMatches)await client.query('UPDATE draft_matches SET home_entry_id=$3,away_entry_id=$4,manual_participants=true WHERE organization_id=$1 AND id=$2',[organizationId,related.id,related.fixture_leg===2?canonicalAway:canonicalHome,related.fixture_leg===2?canonicalHome:canonicalAway]);
        await client.query('UPDATE fixture_bracket_slots SET home_entry_id=$3,away_entry_id=$4,home_source_id=NULL,away_source_id=NULL WHERE organization_id=$1 AND id=$2', [organizationId, slot.id, canonicalHome, canonicalAway]);
      }
      const { rows: days } = await client.query('SELECT DISTINCT matchday_id FROM draft_matches WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND matchday_id IS NOT NULL', [organizationId, matchIds]);
      for (const relatedDay of days) {
        const { rows: [day] } = await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2 RETURNING id,revision,status', [organizationId, relatedDay.matchday_id]);
        if (day?.status === 'published') await publishMatchdaySnapshot(client, organizationId, day, actor.user_id, input.reason, 'matchday.corrected');
      }
      await audit(client, actor.user_id, organizationId, 'fixture.participants_changed', match, input.reason, before, { homeEntryId: input.homeEntryId, awayEntryId: input.awayEntryId });
      return { id: match, unchanged: false };
    });
  });
  app.get('/api/v1/organizations/:id/matchdays/:matchdayId/preview', async (request) => {
    const { id, matchdayId } = request.params as { id: string; matchdayId: string };
    const organizationId = uuid(id), dayId = uuid(matchdayId); await organizationAccess(request, organizationId, true);
    return transaction(pool, async (client) => {
      const { rows: [day] } = await client.query('SELECT id,ordinal,status,revision FROM matchdays WHERE organization_id=$1 AND id=$2', [organizationId, dayId]);
      if (!day) fail(404, 'MATCHDAY_NOT_FOUND', 'No se encontró la jornada.');
      return { ...day, ...await publicationReadiness(client, organizationId, dayId) };
    });
  });
  app.post('/api/v1/organizations/:id/matchdays/:matchdayId/publish', async (request, reply) => {
    const { id, matchdayId } = request.params as { id: string; matchdayId: string };
    const organizationId = uuid(id), dayId = uuid(matchdayId), actor = await organizationAccess(request, organizationId, true);
    const input = matchdayPublishSchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      const { rows: [day] } = await client.query('SELECT id,edition_id,ordinal,status,revision FROM matchdays WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, dayId]);
      if (!day) fail(404, 'MATCHDAY_NOT_FOUND', 'No se encontró la jornada.');
      if (day.status === 'published') {
        const { rows: [existing] } = await client.query('SELECT id FROM matchday_publications WHERE organization_id=$1 AND matchday_id=$2 ORDER BY revision DESC LIMIT 1', [organizationId, dayId]);
        return { id: day.id, revision: day.revision, publicationId: existing.id, reused: true };
      }
      if (day.revision !== input.expectedRevision) fail(409, 'STALE_VERSION', 'La jornada cambió. Revisá la previa antes de publicar.');
      const ready = await publicationReadiness(client, organizationId, dayId);
      if (ready.missing.length) fail(409, 'MATCHDAY_NOT_READY', ready.missing.join(' '));
      const { rows: [published] } = await client.query("UPDATE matchdays SET status='published',published_by=$3,published_at=now(),revision=revision+1 WHERE organization_id=$1 AND id=$2 RETURNING id,revision", [organizationId, dayId, actor.user_id]);
      const { publicationId } = await publishMatchdaySnapshot(client, organizationId, published, actor.user_id, input.reason, 'matchday.published');
      await audit(client, actor.user_id, organizationId, 'matchday.published', dayId, input.reason, { status: 'draft' }, { status: 'published', revision: published.revision, publicationId });
      return { id: dayId, revision: published.revision, publicationId, reused: false };
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });
  registerDisciplineRoutes(app, pool, organizationAccess, teamAccess, fail, uuid);
  registerTournamentPaymentRoutes(app,pool,organizationAccess,fail);
  app.get('/api/v1/organizations/:id/categories/:categoryId/standings/adjustments', async request => {
    const {id,categoryId}=request.params as {id:string;categoryId:string};const org=uuid(id),category=uuid(categoryId);
    await organizationAccess(request,org,true);
    if(!(await pool.query('SELECT 1 FROM categories WHERE organization_id=$1 AND id=$2',[org,category])).rowCount) fail(404,'CATEGORY_NOT_FOUND','No se encontró la categoría.');
    return (await pool.query(`SELECT a.id,a.entry_id,a.points_delta,a.reason,a.decided_at,t.name team_name
      FROM standing_adjustments a JOIN team_entries e ON e.organization_id=a.organization_id AND e.id=a.entry_id
      JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
      WHERE a.organization_id=$1 AND a.category_id=$2 ORDER BY a.decided_at DESC,a.id DESC`,[org,category])).rows;
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/standings/adjustments', async (request,reply) => {
    const {id,categoryId}=request.params as {id:string;categoryId:string};const org=uuid(id),category=uuid(categoryId),actor=await organizationAccess(request,org,true);
    if(actor.platform_admin) fail(403,'ORGANIZER_REQUIRED','Los ajustes deportivos corresponden al organizador.');
    const input=z.object({entryId:z.uuid(),pointsDelta:z.number().int().min(-100).max(100).refine(value=>value!==0),reason:z.string().trim().min(3).max(1000)}).strict().parse(request.body);
    const adjustmentId=randomUUID();
    await transaction(pool,async client=>{
      if(!(await client.query('SELECT 1 FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND id=$3',[org,category,input.entryId])).rowCount) fail(404,'ENTRY_NOT_FOUND','No se encontró el equipo de esta categoría.');
      await client.query('INSERT INTO standing_adjustments(id,organization_id,category_id,entry_id,points_delta,reason,decided_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[adjustmentId,org,category,input.entryId,input.pointsDelta,input.reason,actor.user_id]);
      await audit(client,actor.user_id,org,'standings.points_adjusted',adjustmentId,input.reason,null,{categoryId:category,entryId:input.entryId,pointsDelta:input.pointsDelta});
    });
    return reply.code(201).send({id:adjustmentId,entryId:input.entryId,pointsDelta:input.pointsDelta});
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/standings/tiebreaks', async (request,reply) => {
    const {id,categoryId}=request.params as {id:string;categoryId:string};const org=uuid(id),category=uuid(categoryId),actor=await organizationAccess(request,org,true);
    if(actor.platform_admin) fail(403,'ORGANIZER_REQUIRED','El desempate deportivo corresponde al organizador.');
    const input=z.object({groupNo:z.number().int().positive().nullable(),position:z.number().int().positive(),entryOrder:z.array(z.uuid()).min(2).max(100),reason:z.string().trim().min(3).max(1000)}).strict().parse(request.body);
    const projection=await categoryStatistics(pool,org,category);
    if(!projection) return fail(404,'CATEGORY_NOT_FOUND','No se encontró la categoría.');
    const table=projection.tables.find(item=>item.groupNo===input.groupNo),group=table?.groups.find(item=>item.position===input.position && item.unresolved);
    if(!group || group.teamIds.length!==input.entryOrder.length || new Set(input.entryOrder).size!==input.entryOrder.length || input.entryOrder.some(item=>!group.teamIds.includes(item))) fail(409,'TIE_CHANGED','Actualizá la tabla antes de decidir el desempate.');
    const decisionId=randomUUID(),groupKey=input.groupNo===null?'all':`group:${input.groupNo}`;
    await transaction(pool,async client=>{
      await client.query('INSERT INTO standing_tiebreak_decisions(id,organization_id,category_id,source_key,group_key,position,entry_order,reason,decided_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[decisionId,org,category,projection.sourceKey,groupKey,input.position,input.entryOrder,input.reason,actor.user_id]);
      await audit(client,actor.user_id,org,'standings.tiebreak_decided',decisionId,input.reason,null,{categoryId:category,sourceKey:projection.sourceKey,groupNo:input.groupNo,position:input.position,entryOrder:input.entryOrder});
    });
    return reply.code(201).send({id:decisionId,sourceKey:projection.sourceKey});
  });
  app.get('/api/v1/organizations/:id/categories/:categoryId/statistics', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId);
    await organizationAccess(request, organizationId, true);
    const projection = await categoryStatistics(pool, organizationId, category);
    if (!projection) return fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
    const names = await playerStatNames(pool, organizationId, projection.players.map(player => player.registrationId));
    return { ...await withDocumentedTiebreaks(pool,organizationId,projection), players: projection.players.map(player => ({ ...player, name: names.get(player.registrationId)?.name || 'Jugador', publicName: names.get(player.registrationId)?.publicName || false })) };
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/statistics/rebuild', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    const before = await categoryStatistics(pool, organizationId, category);
    if (!before) return fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró la categoría.');
    const after = await categoryStatistics(pool, organizationId, category, true);
    const same = isDeepStrictEqual(before, after);
    await transaction(pool, client => audit(client, actor.user_id, organizationId, 'statistics.rebuilt', category, 'Reconstrucción manual', { sourceKey: before.sourceKey }, { sourceKey: after!.sourceKey, same }));
    return { sourceKey: after!.sourceKey, same, officialMatches: after!.officialMatches };
  });
  app.post('/api/v1/organizations/:id/registrations/:registrationId/publication', async (request) => {
    const { id, registrationId } = request.params as { id: string; registrationId: string };
    const organizationId = uuid(id), registration = uuid(registrationId), actor = await organizationAccess(request, organizationId, true);
    const input = z.object({ visible: z.boolean(), reason: z.string().trim().min(3).max(300) }).strict().parse(request.body);
    return transaction(pool, async client => {
      const { rows: [player] } = await client.query('SELECT pr.entry_id FROM player_registrations pr WHERE pr.organization_id=$1 AND pr.id=$2', [organizationId, registration]);
      if (!player) fail(404, 'REGISTRATION_NOT_FOUND', 'No se encontró la inscripción.');
      const { rows: [before] } = await client.query('SELECT visible,reason FROM player_publications WHERE organization_id=$1 AND registration_id=$2', [organizationId, registration]);
      await client.query(`INSERT INTO player_publications(organization_id,registration_id,visible,reason,decided_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(organization_id,registration_id) DO UPDATE SET visible=excluded.visible,reason=excluded.reason,decided_by=excluded.decided_by,decided_at=now()`, [organizationId, registration, input.visible, input.reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'player.publication', registration, input.reason, before ?? null, { visible: input.visible, entryId: player.entry_id });
      return { registrationId: registration, visible: input.visible };
    });
  });
  app.get('/api/v1/public/organizations/:id/categories/:categoryId/statistics', async (request) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId);
    const { rows: [published] } = await pool.query(`SELECT c.id FROM categories c JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      JOIN organizations o ON o.id=c.organization_id
      WHERE c.organization_id=$1 AND c.id=$2 AND c.status='published' AND ed.status='published' AND t.status='published' AND o.status='active'`, [organizationId, category]);
    if (!published) fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró una categoría pública.');
    const { rows: [visibility] } = await pool.query("SELECT count(*)::int total,count(*) FILTER (WHERE public_visible)::int visible FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active'", [organizationId, category]);
    if (visibility.total !== visibility.visible) return { available: false, reason: 'La clasificación espera la publicación de todos los equipos.' };
    const rawProjection = await categoryStatistics(pool, organizationId, category);
    const projection = rawProjection && await withDocumentedTiebreaks(pool,organizationId,rawProjection);
    if (!projection) return fail(404, 'CATEGORY_NOT_FOUND', 'No se encontró una categoría pública.');
    const names = await playerStatNames(pool, organizationId, projection.players.map(player => player.registrationId));
    const visiblePlayers = projection.players.filter(player => names.get(player.registrationId)?.publicName).map(player => ({ name: names.get(player.registrationId)!.name, teamName: projection.entries.find(entry => entry.id === player.entryId)?.name || 'Equipo', goals: player.goals, penalties: player.penalties, yellowCards: player.yellowCards, redCards: player.redCards, appearances: player.appearances }));
    const {rows:publicRoster}=await pool.query(`SELECT pr.id registration_id,e.id entry_id,p.given_names,p.family_names FROM player_registrations pr
      JOIN team_entries e ON e.organization_id=pr.organization_id AND e.id=pr.entry_id
      JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
      JOIN player_publications pub ON pub.organization_id=pr.organization_id AND pub.registration_id=pr.id AND pub.visible
      WHERE pr.organization_id=$1 AND e.category_id=$2 AND e.status='active' AND e.public_visible
        AND pr.status<>'rejected' AND pr.reverted_at IS NULL
      ORDER BY p.given_names,p.family_names,pr.id LIMIT 500`,[organizationId,category]);
    const playerStats=new Map(projection.players.map(player=>[player.registrationId,player]));
    const rosters=[...new Set(publicRoster.map(row=>row.entry_id as string))].map(entryId=>({entryId,players:publicRoster.filter(row=>row.entry_id===entryId).map(row=>{const stats=playerStats.get(row.registration_id);return {name:`${row.given_names} ${row.family_names}`,goals:stats?.goals||0,yellowCards:stats?.yellowCards||0,redCards:stats?.redCards||0};})}));
    const unlistedGoals = projection.players.filter(player => !names.get(player.registrationId)?.publicName && player.goals > 0).reduce((total, player) => total + player.goals, 0);
    return { available: true, phaseMode: projection.phaseMode, officialMatches: projection.officialMatches,
      tables: projection.tables.map(table => ({ groupNo: table.groupNo, rows: table.groups.flatMap(group => group.teamIds.map(entryId => ({ position: group.position, unresolved: group.unresolved, teamName: projection.entries.find(entry => entry.id === entryId)?.name || 'Equipo', ...table.totals.find(row => row.teamId === entryId), teamId: undefined }))) })),
      scorers: visiblePlayers.filter(player => player.goals > 0).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
      defense:projection.defense.filter(row=>row.played>0).map(row=>({teamName:projection.entries.find(entry=>entry.id===row.entryId)?.name||'Equipo',played:row.played,goalsAgainst:row.goalsAgainst})).sort((a,b)=>a.goalsAgainst-b.goalsAgainst||a.teamName.localeCompare(b.teamName,'es')),
      rosters, unlistedGoals };
  });
  app.get('/api/v1/public/organizations/:id/fixture', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const { rows: allowed } = await pool.query(`SELECT e.id,e.team_id FROM team_entries e JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id JOIN organizations o ON o.id=e.organization_id WHERE e.organization_id=$1 AND e.status='active' AND e.public_visible AND c.status='published' AND ed.status='published' AND t.status='published' AND o.status='active'`, [organizationId]);
    const visible = new Set(allowed.map((entry) => entry.id));
    const teamByEntry=new Map(allowed.map(entry=>[entry.id,entry.team_id]));
    const {rows:tieRows}=await pool.query('SELECT match_id,return_match_id,decider_match_id FROM fixture_bracket_slots WHERE organization_id=$1',[organizationId]);
    const tieLeg=new Map<string,string>();
    for(const tie of tieRows){if(tie.return_match_id){tieLeg.set(tie.match_id,'Ida');tieLeg.set(tie.return_match_id,'Vuelta');}if(tie.decider_match_id)tieLeg.set(tie.decider_match_id,'Desempate');}
    const {rows:results}=await pool.query(`SELECT r.match_id,r.status,r.roster_snapshot,approved.snapshot approved_snapshot,submitted.snapshot submitted_snapshot,rv.rules
      FROM match_records r LEFT JOIN match_acta_snapshots approved ON approved.organization_id=r.organization_id AND approved.id=r.approval_id
      LEFT JOIN match_acta_snapshots submitted ON submitted.organization_id=r.organization_id AND submitted.id=r.submission_id
      LEFT JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
      LEFT JOIN rule_versions rv ON rv.organization_id=r.organization_id AND rv.category_id=m.category_id AND rv.version=r.rule_version
      WHERE r.organization_id=$1`,[organizationId]);
    type RosterPlayer = { registrationId: string; shirtNumber?: number | null };
    type PublicRoster = { home?: RosterPlayer[]; away?: RosterPlayer[] };
    const snapshots=results.map(row=>({matchId:row.match_id,status:row.approved_snapshot?'official':'provisional',snapshot:row.approved_snapshot || (row.status==='submitted'?row.submitted_snapshot:null),rules:row.rules,roster:row.roster_snapshot as PublicRoster|null})).filter(row=>row.snapshot);
    const publicNames=await playerStatNames(pool,organizationId,[...new Set(snapshots.flatMap(row=>[...(row.snapshot.events as MatchJournalEvent[]).flatMap(event=>[event.registrationId,event.relatedRegistrationId]),...(row.roster?.home||[]).map(player=>player.registrationId),...(row.roster?.away||[]).map(player=>player.registrationId)].filter((id):id is string=>!!id)))]);
    const resultByMatch=new Map(snapshots.map(row=>{const snapshot=row.snapshot;const events=snapshot.events as MatchJournalEvent[];const voided=new Set(events.filter(event=>event.kind==='void').map(event=>event.voidsEventId));const parsedRules=ruleSchema.safeParse(row.rules);const cards=parsedRules.success?parsedRules.data.advanced?.discipline.customCards||[]:[];const players=(['home','away'] as const).flatMap(side=>(row.roster?.[side]||[]).flatMap(player=>{const published=publicNames.get(player.registrationId);return published?.publicName?[{side,name:published.name,shirtNumber:player.shirtNumber??null}]:[];}));return [row.matchId,{status:row.status,score:snapshot.score,shootout:snapshot.shootout,players,events:events.filter(event=>event.kind!=='void'&&!voided.has(event.id)).map(event=>{const card=event.kind==='custom_card'?cards.find(item=>item.code===event.cardCode):null;return {id:event.id,kind:event.kind,teamEntryId:event.teamEntryId,period:event.period,minute:event.minute,cardLabel:card?.label||null,cardColor:card?.color||null,name:event.registrationId&&publicNames.get(event.registrationId)?.publicName?publicNames.get(event.registrationId)!.name:'Jugador',relatedName:event.relatedRegistrationId&&publicNames.get(event.relatedRegistrationId)?.publicName?publicNames.get(event.relatedRegistrationId)!.name:null};})}];}));
    const { rows } = await pool.query(`SELECT md.id,md.ordinal,md.edition_id,ed.name edition_name,t.id tournament_id,t.name tournament_name,p.snapshot
      FROM matchdays md JOIN editions ed ON ed.organization_id=md.organization_id AND ed.id=md.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      JOIN LATERAL (SELECT snapshot FROM matchday_publications WHERE organization_id=md.organization_id AND matchday_id=md.id ORDER BY revision DESC LIMIT 1) p ON true
      WHERE md.organization_id=$1 AND md.status='published' AND ed.status='published' AND t.status='published'
      ORDER BY t.name,ed.name,md.ordinal LIMIT 200`, [organizationId]);
    return rows.map((day) => ({ id: day.id, ordinal: day.ordinal, edition_id: day.edition_id, edition_name: day.edition_name, tournament_id: day.tournament_id, tournament_name: day.tournament_name,
      matches: (day.snapshot as Array<{ id: string; category_id:string; home_entry_id: string; away_entry_id: string; category_name: string; home_name: string; away_name: string; venue_name: string; court_label: string; match_date: string; match_time: string }>).filter((match) => visible.has(match.home_entry_id) && visible.has(match.away_entry_id)).map((match) => {const result=resultByMatch.get(match.id);return { id: match.id, category_id:match.category_id, category_name: match.category_name, home_name: match.home_name, away_name: match.away_name,home_team_id:teamByEntry.get(match.home_entry_id),away_team_id:teamByEntry.get(match.away_entry_id), venue_name: match.venue_name, court_label: match.court_label, match_date: match.match_date, match_time: match.match_time, tie_leg:tieLeg.get(match.id)||null, result:result?{...result,events:result.events.map(event=>({id:event.id,kind:event.kind,side:event.teamEntryId===match.home_entry_id?'home':event.teamEntryId===match.away_entry_id?'away':'unknown',period:event.period,minute:event.minute,cardLabel:event.cardLabel,cardColor:event.cardColor,name:event.name,relatedName:event.relatedName}))}:null };} ) })).filter((day) => day.matches.length);
  });
  app.get('/api/v1/public/organizations/:id/results/stream',async(request,reply)=>{
    const organizationId=uuid((request.params as {id:string}).id);
    const {rowCount:active}=await pool.query("SELECT 1 FROM organizations WHERE id=$1 AND status='active'",[organizationId]);
    if(!active) fail(404,'NOT_FOUND','No se encontró el torneo público.');
    const drawVersionsSql=`SELECT p.blueprint_id,b.category_id,max(p.revision)::int revision FROM fixture_position_publications p
      JOIN fixture_position_blueprints b ON b.organization_id=p.organization_id AND b.id=p.blueprint_id
      WHERE p.organization_id=$1 GROUP BY p.blueprint_id,b.category_id`;
    const drawVersions=new Map<string,number>((await pool.query(drawVersionsSql,[organizationId])).rows.map(item=>[item.blueprint_id,item.revision]));
    reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    trackStream(reply.raw);
    reply.raw.write('event: ready\ndata: {}\n\n');
    let cursor=new Date().toISOString(),lastId='00000000-0000-0000-0000-000000000000';
    let running=false,closed=false;
    const poll=async()=>{if(running||closed)return;running=true;try{
      const {rows}=await pool.query(`SELECT x.id,x.match_id,x.created_at::text created_text FROM match_record_outbox x
        JOIN draft_matches m ON m.organization_id=x.organization_id AND m.id=x.match_id
        JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
        JOIN team_entries he ON he.organization_id=m.organization_id AND he.id=m.home_entry_id
        JOIN team_entries ae ON ae.organization_id=m.organization_id AND ae.id=m.away_entry_id
        JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id
        JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
        JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
        WHERE x.organization_id=$1 AND (x.created_at,x.id)>($2::timestamptz,$3::uuid) AND x.kind IN ('match.submitted','match.official','match.corrected')
        AND md.status='published' AND he.public_visible AND ae.public_visible AND c.status='published' AND ed.status='published' AND t.status='published'
        ORDER BY x.created_at,x.id LIMIT 100`,[organizationId,cursor,lastId]);
      for(const item of rows){reply.raw.write(`event: result\ndata: ${JSON.stringify({matchId:item.match_id})}\n\n`);cursor=item.created_text;lastId=item.id;}
      const {rows:draws}=await pool.query(drawVersionsSql,[organizationId]);
      for(const item of draws)if(item.revision>(drawVersions.get(item.blueprint_id)||0)){
        reply.raw.write(`event: draw\ndata: ${JSON.stringify({categoryId:item.category_id,revision:item.revision})}\n\n`);
        drawVersions.set(item.blueprint_id,item.revision);
      }
      reply.raw.write(': keepalive\n\n');
    }catch{closed=true;reply.raw.end();}finally{running=false;}};
    const interval=setInterval(()=>{void poll();},3000);
    reply.raw.on('close',()=>{closed=true;clearInterval(interval);});
    return reply;
  });
  app.get('/api/v1/public/organizations/:id/brackets', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id);
    const { rows: phases } = await pool.query(`SELECT p.id,p.rule_version,c.id category_id,c.name category_name,ed.name edition_name,t.id tournament_id,t.name tournament_name FROM fixture_phases p
      JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
      JOIN organizations o ON o.id=p.organization_id
      WHERE p.organization_id=$1 AND p.status='generated' AND c.status='published' AND ed.status='published' AND t.status='published' AND o.status='active'
      AND EXISTS (SELECT 1 FROM fixture_bracket_slots bs WHERE bs.organization_id=p.organization_id AND bs.phase_id=p.id AND bs.stage=1 AND bs.match_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM fixture_bracket_slots bs LEFT JOIN draft_matches m ON m.organization_id=bs.organization_id AND m.id=bs.match_id
        LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
        LEFT JOIN draft_matches back ON back.organization_id=bs.organization_id AND back.id=bs.return_match_id
        LEFT JOIN matchdays backday ON backday.organization_id=back.organization_id AND backday.id=back.matchday_id
        WHERE bs.organization_id=p.organization_id AND bs.phase_id=p.id AND bs.stage=1
        AND ((bs.match_id IS NOT NULL AND md.status IS DISTINCT FROM 'published') OR (bs.return_match_id IS NOT NULL AND backday.status IS DISTINCT FROM 'published')))
      ORDER BY t.name,ed.name,c.name LIMIT 100`, [organizationId]);
    const { rows: allowed } = await pool.query("SELECT id FROM team_entries WHERE organization_id=$1 AND status='active' AND public_visible", [organizationId]);
    const visible = new Set(allowed.map((entry) => entry.id));
    const result = [];
    for (const phase of phases) {
      const { rows: slots } = await pool.query(`SELECT s.stage,s.slot,coalesce(s.home_entry_id,CASE WHEN smd.status='published' THEN sm.home_entry_id END) home_entry_id,coalesce(s.away_entry_id,CASE WHEN smd.status='published' THEN sm.away_entry_id END) away_entry_id,s.return_match_id IS NOT NULL two_legs,s.decider_match_id,
        CASE WHEN smd.status='published' THEN s.match_id END first_match_id,CASE WHEN back_day.status='published' THEN s.return_match_id END second_match_id,CASE WHEN decider_day.status='published' THEN s.decider_match_id END third_match_id,
        approved.snapshot first_snapshot,back_approved.snapshot second_snapshot,decider_approved.snapshot third_snapshot,home.name home_name,away.name away_name,
        hs.stage home_source_stage,hs.slot home_source_slot,hs.match_id home_source_match,hs.home_entry_id home_source_home,hs.away_entry_id home_source_away,
        aw.stage away_source_stage,aw.slot away_source_slot,aw.match_id away_source_match,aw.home_entry_id away_source_home,aw.away_entry_id away_source_away
        FROM fixture_bracket_slots s LEFT JOIN draft_matches sm ON sm.organization_id=s.organization_id AND sm.id=s.match_id
        LEFT JOIN matchdays smd ON smd.organization_id=sm.organization_id AND smd.id=sm.matchday_id
        LEFT JOIN match_records mr ON mr.organization_id=s.organization_id AND mr.match_id=s.match_id AND mr.approval_id IS NOT NULL AND smd.status='published'
        LEFT JOIN match_acta_snapshots approved ON approved.organization_id=mr.organization_id AND approved.id=mr.approval_id AND approved.kind='approved'
        LEFT JOIN draft_matches back ON back.organization_id=s.organization_id AND back.id=s.return_match_id
        LEFT JOIN matchdays back_day ON back_day.organization_id=back.organization_id AND back_day.id=back.matchday_id
        LEFT JOIN match_records back_record ON back_record.organization_id=s.organization_id AND back_record.match_id=s.return_match_id AND back_record.approval_id IS NOT NULL AND back_day.status='published'
        LEFT JOIN match_acta_snapshots back_approved ON back_approved.organization_id=back_record.organization_id AND back_approved.id=back_record.approval_id AND back_approved.kind='approved'
        LEFT JOIN draft_matches decider ON decider.organization_id=s.organization_id AND decider.id=s.decider_match_id
        LEFT JOIN matchdays decider_day ON decider_day.organization_id=decider.organization_id AND decider_day.id=decider.matchday_id
        LEFT JOIN match_records decider_record ON decider_record.organization_id=s.organization_id AND decider_record.match_id=s.decider_match_id AND decider_record.approval_id IS NOT NULL AND decider_day.status='published'
        LEFT JOIN match_acta_snapshots decider_approved ON decider_approved.organization_id=decider_record.organization_id AND decider_approved.id=decider_record.approval_id AND decider_approved.kind='approved'
        LEFT JOIN team_entries h ON h.organization_id=s.organization_id AND h.id=coalesce(s.home_entry_id,CASE WHEN smd.status='published' THEN sm.home_entry_id END) LEFT JOIN teams home ON home.organization_id=h.organization_id AND home.id=h.team_id
        LEFT JOIN team_entries a ON a.organization_id=s.organization_id AND a.id=coalesce(s.away_entry_id,CASE WHEN smd.status='published' THEN sm.away_entry_id END) LEFT JOIN teams away ON away.organization_id=a.organization_id AND away.id=a.team_id
        LEFT JOIN fixture_bracket_slots hs ON hs.organization_id=s.organization_id AND hs.id=s.home_source_id
        LEFT JOIN fixture_bracket_slots aw ON aw.organization_id=s.organization_id AND aw.id=s.away_source_id
        WHERE s.organization_id=$1 AND s.phase_id=$2 ORDER BY s.stage,s.slot`, [organizationId, phase.id]);
      if (slots.some((slot) => slot.home_entry_id && !visible.has(slot.home_entry_id) || slot.away_entry_id && !visible.has(slot.away_entry_id))) continue;
      const label = (slot: typeof slots[number], side: 'home' | 'away') => {
        if (slot[`${side}_name`]) return slot[`${side}_name`];
        const sourceStage = slot[`${side}_source_stage`], sourceSlot = slot[`${side}_source_slot`];
        if (!sourceStage) return 'Descanso';
        const source = slots.find((entry) => entry.stage === sourceStage && entry.slot === sourceSlot);
        if (!source) return 'Ganador pendiente';
        if (source.home_name && !source.away_name && !source.home_source_stage && !source.away_source_stage) return source.home_name;
        if (source.away_name && !source.home_name && !source.home_source_stage && !source.away_source_stage) return source.away_name;
        return `Ganador de llave ${sourceStage}.${sourceSlot}`;
      };
      const { rows: [rule] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=(SELECT category_id FROM fixture_phases WHERE organization_id=$1 AND id=$2) AND version=$3', [organizationId, phase.id, phase.rule_version]);
      const parsed = ruleSchema.safeParse(rule?.rules), plan = parsed.success ? parsed.data.competitionPlan : null;
      const publicSlots = slots.map((slot) => {
        const first=slot.first_snapshot as ApprovedScore|null,second=slot.second_snapshot as ApprovedScore|null,third=slot.third_snapshot as ApprovedScore|null;
        const resolution=plan?.rounds[slot.stage-1]?.resolution||'aggregate';
        const pointValues=parsed.success?parsed.data.points:{win:3,draw:1,loss:0};
        const legPoints=(forGoals:number,againstGoals:number)=>forGoals>againstGoals?pointValues.win:forGoals===againstGoals?pointValues.draw:pointValues.loss;
        const homeId=slot.home_entry_id as string|null,awayId=slot.away_entry_id as string|null;
        const winner=homeId&&awayId?tieWinner(homeId,awayId,first,slot.two_legs?second:undefined,resolution,slot.decider_match_id?third:undefined,pointValues):null;
        const matchIds={first:slot.first_match_id as string|null,second:slot.second_match_id as string|null,third:slot.third_match_id as string|null};
        const legs=[first&&{label:slot.two_legs?'Ida':'Partido',home:first.score.home,away:first.score.away,matchId:matchIds.first},second&&{label:'Vuelta',home:second.score.away,away:second.score.home,matchId:matchIds.second},third&&{label:'Desempate',home:third.score.home,away:third.score.away,matchId:matchIds.third}].filter(Boolean);
        const shootout=slot.two_legs?(resolution==='match_points_third'?(third&&(third.shootout.home||third.shootout.away)?third.shootout:null):(second&&(second.shootout.home||second.shootout.away)?{home:second.shootout.away,away:second.shootout.home}:null)):(first&&(first.shootout.home||first.shootout.away)?first.shootout:null);
        let display:{home:number;away:number;label:string|null}|null=null;
        if(first&&!slot.two_legs)display=shootout&&first.score.home===first.score.away?{...shootout,label:'Penales'}:{...first.score,label:null};
        else if(first&&second&&resolution==='aggregate'){
          const global={home:first.score.home+second.score.away,away:first.score.away+second.score.home};
          display=shootout&&global.home===global.away?{...shootout,label:'Penales'}:{...global,label:'Global'};
        }else if(first&&second){
          const homePoints=legPoints(first.score.home,first.score.away)+legPoints(second.score.away,second.score.home);
          const awayPoints=legPoints(first.score.away,first.score.home)+legPoints(second.score.home,second.score.away);
          if(homePoints!==awayPoints)display={home:second.score.away,away:second.score.home,label:'Vuelta'};
          else if(resolution==='match_points_third'&&third)display=shootout&&third.score.home===third.score.away?{...shootout,label:'Penales'}:{...third.score,label:'Desempate'};
          else if(resolution==='match_points_penalties'&&shootout)display={...shootout,label:'Penales'};
        }
        return {stage:slot.stage as number,slot:slot.slot as number,home:label(slot,'home'),away:label(slot,'away'),twoLegs:slot.two_legs as boolean,resolution,homeScore:display?.home??null,awayScore:display?.away??null,scoreLabel:display?.label??null,winnerSide:winner===homeId?'home':winner===awayId?'away':null,matchIds,matchId:matchIds.third||matchIds.second||matchIds.first,legs,shootout};
      });
      if (plan && plan.qualification.from === 'direct') {
        const planned = previewCompetitionBracket(plan, null);
        planned.forEach((round, index) => { if (publicSlots.some((slot) => slot.stage === index + 1)) return; round.ties.forEach((tie) => publicSlots.push({ stage: index + 1, slot: tie.slot, home: tie.home, away: tie.away, twoLegs: round.legs === 2,resolution:plan.rounds[index]?.resolution||'aggregate',homeScore:null,awayScore:null,scoreLabel:null,winnerSide:null,matchIds:{first:null,second:null,third:null},matchId:null,legs:[],shootout:null })); });
      }
      result.push({ phase_id:phase.id,category_id:phase.category_id, category_name: phase.category_name, edition_name: phase.edition_name, tournament_id: phase.tournament_id, tournament_name: phase.tournament_name, repechage: !!plan?.repechage, slots: publicSlots });
    }
    return result;
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/draft-matches', async (request, reply) => {
    const { id, categoryId } = request.params as { id: string; categoryId: string };
    const organizationId = uuid(id), category = uuid(categoryId), actor = await organizationAccess(request, organizationId, true);
    const input = draftMatchSchema.parse(request.body), matchId = randomUUID();
    await transaction(pool, async (client) => {
      const { rows } = await client.query("SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active' AND id=ANY($3::uuid[])", [organizationId, category, [input.homeEntryId, input.awayEntryId]]);
      if (rows.length !== 2) fail(400, 'TEAMS_NOT_IN_CATEGORY', 'Elegí dos equipos activos de la misma categoría.');
      const { rows: [fixturePhase] } = await client.query('SELECT status FROM fixture_phases WHERE organization_id=$1 AND category_id=$2 FOR UPDATE', [organizationId, category]);
      if (fixturePhase?.status === 'generated') fail(409, 'FIXTURE_EXISTS', 'Esta categoría ya tiene cruces generados. Programá uno de esos partidos en la agenda.');
      await client.query('INSERT INTO draft_matches(id,organization_id,category_id,home_entry_id,away_entry_id,match_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [matchId, organizationId, category, input.homeEntryId, input.awayEntryId, input.matchDate, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'draft_match.created', matchId, 'Partido de prueba en borrador para planillas', null, { categoryId: category, matchDate: input.matchDate });
    });
    return reply.code(201).send({ id: matchId, status: 'draft' });
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/draft-matches', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId); await teamAccess(request, organizationId, entry);
    const { rows } = await pool.query(`SELECT m.id,m.category_id,m.home_entry_id,m.away_entry_id,to_char(m.match_date,'YYYY-MM-DD') match_date,m.status,r.status acta_status,home.name home_name,away.name away_name
      FROM draft_matches m JOIN team_entries h ON h.organization_id=m.organization_id AND h.id=m.home_entry_id JOIN teams home ON home.organization_id=h.organization_id AND home.id=h.team_id
      JOIN team_entries a ON a.organization_id=m.organization_id AND a.id=m.away_entry_id JOIN teams away ON away.organization_id=a.organization_id AND away.id=a.team_id
      LEFT JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id
      WHERE m.organization_id=$1 AND m.match_date IS NOT NULL AND (m.home_entry_id=$2 OR m.away_entry_id=$2) ORDER BY m.match_date DESC,m.created_at DESC LIMIT 100`, [organizationId, entry]);
    return rows;
  });
  app.get('/api/v1/organizations/:id/draft-matches/:matchId/entries/:entryId/lineup', async (request) => {
    const { id, matchId, entryId } = request.params as { id: string; matchId: string; entryId: string };
    const organizationId = uuid(id), match = uuid(matchId), entry = uuid(entryId); await teamAccess(request, organizationId, entry);
    await lineupMatchAccess(organizationId, match, entry);
    const { rows } = await pool.query('SELECT id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_at,review_reason FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 ORDER BY version DESC LIMIT 20', [organizationId, match, entry]);
    return rows;
  });
  app.get('/api/v1/organizations/:id/draft-matches/:matchId/entries/:entryId/exceptions', async (request) => {
    const { id, matchId, entryId } = request.params as { id: string; matchId: string; entryId: string };
    const organizationId = uuid(id), match = uuid(matchId), entry = uuid(entryId); await teamAccess(request, organizationId, entry);
    await lineupContext(organizationId, match, entry);
    return (await pool.query('SELECT id,registration_id,reason FROM lineup_exceptions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3', [organizationId, match, entry])).rows;
  });
  app.get('/api/v1/organizations/:id/entries/:entryId/lineups/previous', async (request) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    const organizationId = uuid(id), entry = uuid(entryId); await teamAccess(request, organizationId, entry);
    const { exclude } = z.object({ exclude: z.uuid() }).strict().parse(request.query);
    const { rows: [previous] } = await pool.query("SELECT l.id,l.snapshot,l.version,to_char(m.match_date,'YYYY-MM-DD') match_date FROM lineup_versions l JOIN draft_matches m ON m.organization_id=l.organization_id AND m.id=l.match_id WHERE l.organization_id=$1 AND l.entry_id=$2 AND l.match_id<>$3 AND l.status='approved' ORDER BY l.reviewed_at DESC LIMIT 1", [organizationId, entry, exclude]);
    return previous || null;
  });
  app.post('/api/v1/organizations/:id/draft-matches/:matchId/entries/:entryId/lineup', async (request, reply) => {
    const { id, matchId, entryId } = request.params as { id: string; matchId: string; entryId: string };
    const organizationId = uuid(id), match = uuid(matchId), entry = uuid(entryId), actor = await teamAccess(request, organizationId, entry);
    const input = lineupSaveSchema.parse(request.body);
    if ((await pool.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [organizationId, match])).rowCount) fail(409, 'LINEUP_FROZEN', 'La planilla quedó congelada al iniciar el partido.');
    const { context, warnings } = await checkLineup(organizationId, match, entry, input.players, input.staffIds, false);
    const result = await transaction(pool, async (client) => {
      await client.query('SELECT 1 FROM draft_matches WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, match]);
      if ((await client.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [organizationId, match])).rowCount) fail(409, 'LINEUP_FROZEN', 'La planilla quedó congelada al iniciar el partido.');
      const { rows: [latest] } = await client.query('SELECT version,status FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 ORDER BY version DESC LIMIT 1', [organizationId, match, entry]);
      if ((latest?.version || 0) !== input.expectedVersion) fail(409, 'STALE_VERSION', 'La planilla cambió. Actualizá antes de guardar.');
      if (latest?.status === 'submitted') fail(409, 'REVIEW_PENDING', 'La planilla enviada espera revisión.');
      const { rows: [rule] } = await client.query("SELECT version FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, context.match.category_id]);
      if (rule?.version !== context.rule.version) fail(409, 'RULES_CHANGED', 'El reglamento cambió. Actualizá y revisá la planilla.');
      const { rows: [goodFaith] } = await client.query("SELECT version FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2 AND status='approved' ORDER BY version DESC LIMIT 1", [organizationId, entry]);
      if (goodFaith?.version !== context.goodFaith.version) fail(409, 'GOOD_FAITH_CHANGED', 'La buena fe cambió. Revisá la selección.');
      const versionId = randomUUID(), version = (latest?.version || 0) + 1;
      await client.query('INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,snapshot,rule_version,good_faith_version,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [versionId, organizationId, match, entry, version, JSON.stringify({ players: input.players, staffIds: input.staffIds }), context.rule.version, context.goodFaith.version, input.reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'lineup.draft_saved', versionId, input.reason, null, { matchId: match, entryId: entry, version, players: input.players.length, staff: input.staffIds.length });
      return { id: versionId, version, status: 'draft', warnings };
    });
    return reply.code(201).send(result);
  });
  app.post('/api/v1/organizations/:id/draft-matches/:matchId/entries/:entryId/lineup/submit', async (request) => {
    const { id, matchId, entryId } = request.params as { id: string; matchId: string; entryId: string };
    const organizationId = uuid(id), match = uuid(matchId), entry = uuid(entryId), actor = await teamAccess(request, organizationId, entry);
    const input = lineupTransitionSchema.parse(request.body);
    return transaction(pool, async (client) => {
      await client.query('SELECT 1 FROM draft_matches WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, match]);
      if ((await client.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [organizationId, match])).rowCount) fail(409, 'LINEUP_FROZEN', 'La planilla quedó congelada al iniciar el partido.');
      const { rows: [latest] } = await client.query('SELECT * FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 ORDER BY version DESC LIMIT 1 FOR UPDATE', [organizationId, match, entry]);
      if (!latest || latest.version !== input.expectedVersion || latest.status !== 'draft') fail(409, 'STALE_VERSION', 'La planilla ya cambió o fue presentada.');
      const { context } = await checkLineup(organizationId, match, entry, latest.snapshot.players, latest.snapshot.staffIds, true);
      if (context.rule.version !== latest.rule_version || context.goodFaith.version !== latest.good_faith_version) fail(409, 'SOURCES_CHANGED', 'Reglamento o buena fe cambiaron. Guardá una planilla nueva.');
      const { rows: [updated] } = await client.query("UPDATE lineup_versions SET status='submitted',submitted_by=$1,submitted_at=now() WHERE id=$2 RETURNING id,version,status", [actor.user_id, latest.id]);
      await audit(client, actor.user_id, organizationId, 'lineup.submitted', latest.id, input.reason, { status: 'draft' }, { status: 'submitted', matchId: match, entryId: entry });
      return updated;
    });
  });
  app.post('/api/v1/organizations/:id/draft-matches/:matchId/entries/:entryId/lineup/review', async (request) => {
    const { id, matchId, entryId } = request.params as { id: string; matchId: string; entryId: string };
    const organizationId = uuid(id), match = uuid(matchId), entry = uuid(entryId), actor = await organizationAccess(request, organizationId, true);
    const input = lineupReviewSchema.parse(request.body);
    return transaction(pool, async (client) => {
      await client.query('SELECT 1 FROM draft_matches WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, match]);
      if ((await client.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [organizationId, match])).rowCount) fail(409, 'LINEUP_FROZEN', 'La planilla quedó congelada al iniciar el partido.');
      const { rows: [latest] } = await client.query('SELECT * FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 ORDER BY version DESC LIMIT 1 FOR UPDATE', [organizationId, match, entry]);
      if (!latest || latest.version !== input.expectedVersion || latest.status !== 'submitted') fail(409, 'STALE_VERSION', 'La planilla ya cambió o fue revisada.');
      if (input.decision === 'approved') {
        const { context } = await checkLineup(organizationId, match, entry, latest.snapshot.players, latest.snapshot.staffIds, true);
        if (context.rule.version !== latest.rule_version || context.goodFaith.version !== latest.good_faith_version) fail(409, 'SOURCES_CHANGED', 'Reglamento o buena fe cambiaron. Pedí una planilla nueva.');
      }
      const { rows: [updated] } = await client.query('UPDATE lineup_versions SET status=$1,review_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 RETURNING id,version,status,review_reason', [input.decision, input.reason, actor.user_id, latest.id]);
      await audit(client, actor.user_id, organizationId, `lineup.${input.decision}`, latest.id, input.reason, { status: 'submitted' }, { status: input.decision, matchId: match, entryId: entry });
      return updated;
    });
  });
  app.post('/api/v1/organizations/:id/draft-matches/:matchId/entries/:entryId/players/:registrationId/exception', async (request, reply) => {
    const { id, matchId, entryId, registrationId } = request.params as { id: string; matchId: string; entryId: string; registrationId: string };
    const organizationId = uuid(id), match = uuid(matchId), entry = uuid(entryId), registration = uuid(registrationId), actor = await organizationAccess(request, organizationId, true);
    const { reason } = reasonSchema.parse(request.body);
    await lineupContext(organizationId, match, entry);
    const { rowCount } = await pool.query('SELECT 1 FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND id=$3', [organizationId, entry, registration]);
    if (!rowCount) fail(404, 'NOT_FOUND', 'No se encontró la inscripción.');
    const { rows: [matchRow] } = await pool.query("SELECT to_char(match_date,'YYYY-MM-DD') match_date FROM draft_matches WHERE organization_id=$1 AND id=$2", [organizationId, match]);
    const eligibility = await assessEligibility(organizationId, entry, registration, matchRow.match_date);
    if (eligibility.status === 'allowed') fail(409, 'EXCEPTION_NOT_NEEDED', 'No hay una advertencia que requiera excepción.');
    const result = await transaction(pool, async (client) => {
      const exceptionId = randomUUID();
      await client.query('INSERT INTO lineup_exceptions(id,organization_id,match_id,entry_id,registration_id,reason,authorized_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [exceptionId, organizationId, match, entry, registration, reason, actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'lineup.exception_authorized', exceptionId, reason, null, { matchId: match, entryId: entry, registrationId: registration });
      return { id: exceptionId };
    });
    return reply.code(201).send(result);
  });
  app.post('/api/v1/organizations/:id/operators', async (request, reply) => {
    const organizationId = uuid((request.params as { id: string }).id), actor = await organizationAccess(request, organizationId, true);
    if (actor.platform_admin) fail(403, 'ORGANIZER_REQUIRED', 'La asignación corresponde al organizador.');
    const input = teamAdminSchema.parse(request.body);
    const result = await transaction(pool, async (client) => {
      let { rows: [person] } = await client.query('SELECT id,password_hash FROM users WHERE lower(username)=lower($1)', [input.username]);
      if (!person) { person = { id: randomUUID(), password_hash: null }; await client.query('INSERT INTO users(id,username,display_name) VALUES($1,$2,$3)', [person.id,input.username,input.name]); }
      let { rows: [membership] } = await client.query('SELECT id,role,status FROM memberships WHERE organization_id=$1 AND user_id=$2 FOR UPDATE', [organizationId,person.id]);
      if (membership && membership.role !== 'operator') fail(409,'ROLE_CONFLICT','Esta persona ya tiene otro rol en la organización.');
      if (!membership) { membership = { id: randomUUID(), role: 'operator', status: 'pending' }; await client.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'operator','pending')",[membership.id,organizationId,person.id]); }
      const invitation = membership.status === 'pending' ? await newInvitation(client,actor.user_id,person.id,organizationId,'invite') : null;
      await audit(client,actor.user_id,organizationId,'operator.created',membership.id,'Planillero disponible para asignación');
      return { membershipId: membership.id, invitation };
    });
    return reply.code(201).send(result);
  });
  app.get('/api/v1/organizations/:id/operators', async (request) => {
    const organizationId = uuid((request.params as { id: string }).id), actor = await organizationAccess(request, organizationId, true);
    if (actor.platform_admin) fail(403,'ORGANIZER_REQUIRED','La asignación corresponde al organizador.');
    return (await pool.query("SELECT m.id,m.status,u.display_name name,u.username FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.role='operator' ORDER BY u.display_name",[organizationId])).rows;
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/assignments', async (request, reply) => {
    const { id,matchId } = request.params as { id:string;matchId:string };
    const organizationId=uuid(id), match=uuid(matchId), actor=await organizationAccess(request,organizationId,true);
    if (actor.platform_admin) fail(403,'ORGANIZER_REQUIRED','La asignación corresponde al organizador.');
    const input=z.object({membershipId:z.uuid(),duty:z.enum(['capture','review']),reason:z.string().trim().min(3).max(300)}).strict().parse(request.body);
    const result=await transaction(pool,async(client)=>{
      const {rows:[member]}=await client.query("SELECT id,role,status FROM memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,input.membershipId]);
      if (!member || !['operator','tournament_admin'].includes(member.role)) fail(404,'OPERATOR_NOT_FOUND','No se encontró el planillero o revisor.');
      if (member.status!=='active') fail(409,'OPERATOR_INACTIVE','La persona debe aceptar la invitación y estar activa.');
      if (!(await client.query('SELECT 1 FROM draft_matches WHERE organization_id=$1 AND id=$2',[organizationId,match])).rowCount) fail(404,'MATCH_NOT_FOUND','No se encontró el partido.');
      const {rows:[existing]}=await client.query('SELECT id FROM match_capture_assignments WHERE organization_id=$1 AND match_id=$2 AND membership_id=$3 AND duty=$4 AND revoked_at IS NULL',[organizationId,match,input.membershipId,input.duty]);
      if (existing) return {id:existing.id,reused:true};
      const assignmentId=randomUUID();
      await client.query('INSERT INTO match_capture_assignments(id,organization_id,match_id,membership_id,duty,assigned_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[assignmentId,organizationId,match,input.membershipId,input.duty,actor.user_id,input.reason]);
      await audit(client,actor.user_id,organizationId,'match.assignment_created',assignmentId,input.reason,null,{matchId:match,membershipId:input.membershipId,duty:input.duty});
      return {id:assignmentId,reused:false};
    });
    return reply.code(result.reused?200:201).send(result);
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/assignments/:assignmentId/revoke', async(request)=>{
    const {id,matchId,assignmentId}=request.params as {id:string;matchId:string;assignmentId:string};
    const organizationId=uuid(id),match=uuid(matchId),assignment=uuid(assignmentId),actor=await organizationAccess(request,organizationId,true);
    if (actor.platform_admin) fail(403,'ORGANIZER_REQUIRED','La asignación corresponde al organizador.');
    const {reason}=reasonSchema.parse(request.body);
    return transaction(pool,async(client)=>{
      const {rows:[current]}=await client.query('SELECT revoked_at FROM match_capture_assignments WHERE organization_id=$1 AND match_id=$2 AND id=$3 FOR UPDATE',[organizationId,match,assignment]);
      if (!current) fail(404,'ASSIGNMENT_NOT_FOUND','No se encontró la asignación.');
      if (!current.revoked_at) { await client.query('UPDATE match_capture_assignments SET revoked_at=now(),revoked_by=$4 WHERE organization_id=$1 AND match_id=$2 AND id=$3',[organizationId,match,assignment,actor.user_id]); await audit(client,actor.user_id,organizationId,'match.assignment_revoked',assignment,reason); }
      return {id:assignment,revoked:true};
    });
  });
  app.get('/api/v1/organizations/:id/match-assignments', async(request)=>{
    const organizationId=uuid((request.params as {id:string}).id),actor=await organizationAccess(request,organizationId);
    if (actor.platform_admin) fail(403,'ORGANIZER_REQUIRED','El superadmin no opera partidos.');
    return (await pool.query(`SELECT a.id,a.match_id,a.duty,a.membership_id,u.display_name name,m.status member_status,dm.category_id,home.name home_name,away.name away_name,md.ordinal day_ordinal,md.status day_status,r.status acta_status
      FROM match_capture_assignments a JOIN memberships m ON m.organization_id=a.organization_id AND m.id=a.membership_id JOIN users u ON u.id=m.user_id
      JOIN draft_matches dm ON dm.organization_id=a.organization_id AND dm.id=a.match_id
      JOIN team_entries he ON he.organization_id=dm.organization_id AND he.id=dm.home_entry_id JOIN teams home ON home.organization_id=he.organization_id AND home.id=he.team_id
      JOIN team_entries ae ON ae.organization_id=dm.organization_id AND ae.id=dm.away_entry_id JOIN teams away ON away.organization_id=ae.organization_id AND away.id=ae.team_id
      LEFT JOIN matchdays md ON md.organization_id=dm.organization_id AND md.id=dm.matchday_id
      LEFT JOIN match_records r ON r.organization_id=dm.organization_id AND r.match_id=dm.id
      WHERE a.organization_id=$1 AND a.revoked_at IS NULL AND (m.user_id=$2 OR EXISTS(SELECT 1 FROM memberships mine WHERE mine.organization_id=$1 AND mine.user_id=$2 AND mine.role='tournament_admin' AND mine.status='active')) ORDER BY md.ordinal,home.name`,[organizationId,actor.user_id])).rows;
  });
  async function captureAccess(request: FastifyRequest, organizationId: string, matchId: string, duty: 'capture'|'review'|'read'='capture') {
    const actor = await organizationAccess(request, organizationId);
    if (actor.platform_admin) fail(403, 'ORGANIZER_REQUIRED', 'El superadmin no opera partidos.');
    const {rows:[membership]}=await pool.query("SELECT id,role FROM memberships WHERE organization_id=$1 AND user_id=$2 AND status='active'",[organizationId,actor.user_id]);
    if (membership?.role==='tournament_admin') return actor;
    if (membership?.role!=='operator' || !(await pool.query('SELECT 1 FROM match_capture_assignments WHERE organization_id=$1 AND match_id=$2 AND membership_id=$3 AND ($4=\'read\' OR duty=$4) AND revoked_at IS NULL',[organizationId,matchId,membership.id,duty])).rowCount) fail(403,'MATCH_SCOPE_DENIED','No tenés asignación activa para este partido.');
    return actor;
  }
  async function captureView(organizationId: string, matchId: string): Promise<MatchCaptureView> {
    const { rows: [record] } = await pool.query(`SELECT r.status,r.revision,r.rule_version,r.home_lineup_id,r.away_lineup_id,r.roster_snapshot,r.submission_id,r.approval_id,
      m.home_entry_id,m.away_entry_id,home.id home_team_id,away.id away_team_id,home.name home_name,away.name away_name,
      home.color home_color,away.color away_color,(home.shield_id IS NOT NULL) home_has_shield,(away.shield_id IS NOT NULL) away_has_shield
      FROM match_records r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
      JOIN team_entries he ON he.organization_id=m.organization_id AND he.id=m.home_entry_id
      JOIN teams home ON home.organization_id=he.organization_id AND home.id=he.team_id
      JOIN team_entries ae ON ae.organization_id=m.organization_id AND ae.id=m.away_entry_id
      JOIN teams away ON away.organization_id=ae.organization_id AND away.id=ae.team_id
      WHERE r.organization_id=$1 AND r.match_id=$2`, [organizationId, matchId]);
    if (!record) fail(404, 'RECORD_NOT_FOUND', 'Todavía no se abrió la carga de este partido.');
    const { rows: lineups } = await pool.query('SELECT id,snapshot FROM lineup_versions WHERE organization_id=$1 AND id=ANY($2::uuid[])', [organizationId, [record.home_lineup_id, record.away_lineup_id]]);
    const lineupById = new Map(lineups.map((row) => [row.id, row.snapshot as { players: Array<{ registrationId: string; shirtNumber?: number | null }> }]));
    const roster = record.roster_snapshot as {home:Array<{registrationId:string;shirtNumber?:number|null}>;away:Array<{registrationId:string;shirtNumber?:number|null}>;warnings?:string[]};
    const rosterPlayers = (side:'home'|'away',lineupId:string|null) => roster?.[side]?.length ? roster[side] : lineupId ? lineupById.get(lineupId)?.players || [] : [];
    const selected = [...rosterPlayers('home',record.home_lineup_id),...rosterPlayers('away',record.away_lineup_id)].map(player=>player.registrationId);
    const { rows: names } = await pool.query(`SELECT pr.id,p.given_names,p.family_names FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
      WHERE pr.organization_id=$1 AND pr.id=ANY($2::uuid[])`, [organizationId, selected]);
    const nameById = new Map(names.map((row) => [row.id, `${row.given_names} ${row.family_names}`]));
    const players = (side:'home'|'away',lineupId:string|null) => rosterPlayers(side,lineupId).map((player) => ({ registrationId: player.registrationId, name: nameById.get(player.registrationId) || 'Jugador', shirtNumber: player.shirtNumber ?? null }));
    const { rows: rawEvents } = await pool.query(`SELECT id,sequence,kind,team_entry_id,registration_id,related_registration_id,incident_note,card_code,window_no,period,minute,voids_event_id,reason,recorded_at
      FROM match_record_events WHERE organization_id=$1 AND match_id=$2 ORDER BY sequence`, [organizationId, matchId]);
    const events: MatchJournalEvent[] = rawEvents.map((event) => ({ id:event.id,sequence:event.sequence,kind:event.kind,teamEntryId:event.team_entry_id,registrationId:event.registration_id,relatedRegistrationId:event.related_registration_id,incidentNote:event.incident_note,cardCode:event.card_code,windowNo:event.window_no,period:event.period,minute:event.minute,voidsEventId:event.voids_event_id,reason:event.reason,recordedAt:event.recorded_at.toISOString() }));
    const {score,shootout,unattributedGoals}=projectMatchJournal(events,record.home_entry_id,record.away_entry_id);
    const { rows: [rule] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=(SELECT category_id FROM draft_matches WHERE organization_id=$1 AND id=$2) AND version=$3', [organizationId, matchId, record.rule_version]);
    const periods = ruleSchema.safeParse(rule?.rules);
    const allowedKinds:MatchCaptureView['allowedKinds']=['goal','penalty','penalty_miss','own_goal','incident','shootout_goal','shootout_miss'];
    allowedKinds.push('yellow','second_yellow','red','substitution');
    const customCards = periods.success ? periods.data.advanced?.discipline.customCards || [] : [];
    if (customCards.length) allowedKinds.push('custom_card');
    return { matchId, status: record.status, revision: record.revision, submissionId:record.submission_id, approvalId:record.approval_id, warnings:roster?.warnings||[], allowedKinds,customCards,substitutionNeedsWindow:false, home: { entryId: record.home_entry_id, teamId: record.home_team_id, name: record.home_name, color: record.home_color, hasShield: record.home_has_shield, players: players('home',record.home_lineup_id) }, away: { entryId: record.away_entry_id, teamId: record.away_team_id, name: record.away_name, color: record.away_color, hasShield: record.away_has_shield, players: players('away',record.away_lineup_id) }, score,shootout,unattributedGoals,
      periods: periods.success ? periods.data.periods.map((period) => period.name) : [],
      events };
  }
  async function actaPayload(client: PoolClient, organizationId:string, matchId:string, record:{revision:number}) {
    const {rows:[match]}=await client.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE organization_id=$1 AND id=$2',[organizationId,matchId]);
    const {rows}=await client.query('SELECT id,sequence,kind,team_entry_id,registration_id,related_registration_id,period,minute,window_no,incident_note,card_code,voids_event_id,reason,recorded_at FROM match_record_events WHERE organization_id=$1 AND match_id=$2 ORDER BY sequence',[organizationId,matchId]);
    const events:MatchJournalEvent[]=rows.map(event=>({id:event.id,sequence:event.sequence,kind:event.kind,teamEntryId:event.team_entry_id,registrationId:event.registration_id,relatedRegistrationId:event.related_registration_id,period:event.period,minute:event.minute,windowNo:event.window_no,incidentNote:event.incident_note,cardCode:event.card_code,voidsEventId:event.voids_event_id,reason:event.reason,recordedAt:event.recorded_at.toISOString()}));
    const projection=projectMatchJournal(events,match.home_entry_id,match.away_entry_id);
    return {eventRevision:record.revision,score:projection.score,shootout:projection.shootout,unattributedGoals:projection.unattributedGoals,events};
  }
  async function appendActa(client:PoolClient,organizationId:string,matchId:string,record:{revision:number},kind:'submitted'|'approved'|'rejected'|'reopened',reason:string,actorId:string) {
    const {rows:[version]}=await client.query('SELECT coalesce(max(version),0)::int latest FROM match_acta_snapshots WHERE organization_id=$1 AND match_id=$2',[organizationId,matchId]);
    const snapshot=await actaPayload(client,organizationId,matchId,record),snapshotId=randomUUID();
    await client.query('INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[snapshotId,organizationId,matchId,version.latest+1,kind,record.revision,snapshot,reason,actorId]);
    await audit(client,actorId,organizationId,`match.acta_${kind}`,snapshotId,reason,null,{matchId,version:version.latest+1,eventRevision:record.revision});
    return {snapshotId,version:version.latest+1,snapshot};
  }
  async function appendMatchOutbox(client:PoolClient,organizationId:string,matchId:string,kind:'match.provisional'|'match.submitted'|'match.official'|'match.corrected',revision:number,payload:object) {
    await client.query('INSERT INTO match_record_outbox(id,organization_id,match_id,kind,revision,payload) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),organizationId,matchId,kind,revision,payload]);
  }
  app.get('/api/v1/organizations/:id/matches/:matchId/record', async (request) => {
    const { id, matchId } = request.params as { id: string; matchId: string };
    const organizationId = uuid(id), match = uuid(matchId); await captureAccess(request, organizationId,match,'read');
    return captureView(organizationId, match);
  });
  app.get('/api/v1/organizations/:id/matches/:matchId/record/stream',async(request,reply)=>{
    const {id,matchId}=request.params as {id:string;matchId:string};const organizationId=uuid(id),match=uuid(matchId);
    await captureAccess(request,organizationId,match,'read');
    reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
    trackStream(reply.raw);
    reply.raw.write('event: ready\ndata: {}\n\n');
    let cursor=new Date().toISOString(),lastId='00000000-0000-0000-0000-000000000000',running=false,closed=false;
    const poll=async()=>{if(running||closed)return;running=true;try{
      await captureAccess(request,organizationId,match,'read');
      const {rows}=await pool.query('SELECT id,kind,revision,created_at::text created_text FROM match_record_outbox WHERE organization_id=$1 AND match_id=$2 AND (created_at,id)>($3::timestamptz,$4::uuid) ORDER BY created_at,id LIMIT 100',[organizationId,match,cursor,lastId]);
      for(const item of rows){reply.raw.write(`event: changed\ndata: ${JSON.stringify({kind:item.kind,revision:item.revision})}\n\n`);cursor=item.created_text;lastId=item.id;}
      reply.raw.write(': keepalive\n\n');
    }catch{closed=true;reply.raw.end();}finally{running=false;}};
    const interval=setInterval(()=>{void poll();},3000);reply.raw.on('close',()=>{closed=true;clearInterval(interval);});return reply;
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/record/start', async (request, reply) => {
    const { id, matchId } = request.params as { id: string; matchId: string };
    const organizationId = uuid(id), match = uuid(matchId), actor = await captureAccess(request, organizationId,match);
    await transaction(pool, async (client) => {
      const { rows: [fixture] } = await client.query(`SELECT m.category_id,m.home_entry_id,m.away_entry_id,to_char(m.match_date,'YYYY-MM-DD') match_date,md.status day_status FROM draft_matches m
        LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id WHERE m.organization_id=$1 AND m.id=$2 FOR UPDATE OF m`, [organizationId, match]);
      if (!fixture) fail(404, 'MATCH_NOT_FOUND', 'No se encontró el partido.');
      const { rowCount: existing } = await client.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [organizationId, match]);
      if (existing) return;
      if (fixture.day_status !== 'published') fail(409, 'FIXTURE_NOT_PUBLISHED', 'Publicá la Fecha antes de completar el partido.');
      const { rows: [rule] } = await client.query("SELECT version,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status='published' ORDER BY version DESC LIMIT 1", [organizationId, fixture.category_id]);
      if (!rule || !ruleSchema.safeParse(rule.rules).success) fail(409, 'RULES_NOT_PUBLISHED', 'Se necesita un reglamento publicado y válido.');
      const lineups:(string|null)[] = [];
      const roster:{home:Array<{registrationId:string;shirtNumber:number|null}>;away:Array<{registrationId:string;shirtNumber:number|null}>;warnings:string[]}={home:[],away:[],warnings:[]};
      for (const [index,entry] of [fixture.home_entry_id, fixture.away_entry_id].entries()) {
        const { rows: [lineup] } = await client.query('SELECT id,status,rule_version,snapshot FROM lineup_versions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 ORDER BY version DESC LIMIT 1', [organizationId, match, entry]);
        const approved=lineup?.status==='approved'&&lineup.rule_version===rule.version;
        const frozen:Array<{registrationId:string;shirtNumber:number|null}>=approved ? (lineup.snapshot.players as Array<{registrationId:string;shirtNumber?:number|null}>).map(player=>({registrationId:player.registrationId,shirtNumber:player.shirtNumber??null})) : (await client.query("SELECT id registration_id FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND status<>'rejected' ORDER BY created_at,id LIMIT 200",[organizationId,entry])).rows.map(player=>({registrationId:player.registration_id,shirtNumber:null}));
        for (const player of frozen) {
          const suspension = await activeSuspensionReasons(pool, organizationId, entry, player.registrationId, fixture.match_date);
          if (suspension.length && !(await client.query('SELECT 1 FROM lineup_exceptions WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 AND registration_id=$4', [organizationId, match, entry, player.registrationId])).rowCount) roster.warnings.push('Hay jugadores con sanciones vigentes. Revisá antes de aprobar el acta.');
        }
        roster[index===0?'home':'away']=frozen;
        lineups.push(approved?lineup.id:null);
      }
      roster.warnings=[...new Set(roster.warnings)];
      const recordId = randomUUID();
      await client.query('INSERT INTO match_records(id,organization_id,match_id,rule_version,home_lineup_id,away_lineup_id,roster_snapshot,started_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [recordId, organizationId, match, rule.version, lineups[0], lineups[1], JSON.stringify(roster), actor.user_id]);
      await audit(client, actor.user_id, organizationId, 'match.capture_started', recordId, 'Carga del partido iniciada', null, { matchId: match, homeLineupId: lineups[0], awayLineupId: lineups[1] });
    });
    return reply.code(201).send(await captureView(organizationId, match));
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/events', async (request, reply) => {
    const { id, matchId } = request.params as { id: string; matchId: string };
    const organizationId = uuid(id), match = uuid(matchId), actor = await captureAccess(request, organizationId,match);
    const input = matchEventSchema.parse(request.body);
    await transaction(pool, async (client) => {
      const { rows: [record] } = await client.query(`SELECT r.id,r.status,r.revision,r.rule_version,r.home_lineup_id,r.away_lineup_id,r.roster_snapshot,m.home_entry_id,m.away_entry_id,m.category_id
        FROM match_records r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
        WHERE r.organization_id=$1 AND r.match_id=$2 FOR UPDATE OF r`, [organizationId, match]);
      if (!record) fail(404, 'RECORD_NOT_FOUND', 'Abrí primero la carga del partido.');
      const { rows: [existing] } = await client.query('SELECT kind,team_entry_id,registration_id,related_registration_id,incident_note,card_code,window_no,period,minute FROM match_record_events WHERE organization_id=$1 AND match_id=$2 AND client_event_id=$3', [organizationId, match, input.clientEventId]);
      if (existing) {
        if (existing.kind !== input.kind || existing.team_entry_id !== input.teamEntryId || existing.registration_id !== input.registrationId || existing.related_registration_id !== (input.relatedRegistrationId??null) || existing.incident_note !== (input.incidentNote??null) || existing.card_code !== (input.cardCode??null) || existing.window_no !== (input.windowNo??null) || existing.period !== input.period || existing.minute !== input.minute) fail(409, 'EVENT_ID_REUSED', 'Esta solicitud ya se usó para otro evento.');
        return;
      }
      if (record.status !== 'capturing') fail(409, 'RECORD_LOCKED', 'El acta ya no admite eventos.');
      if (![record.home_entry_id, record.away_entry_id].includes(input.teamEntryId)) fail(409, 'TEAM_NOT_IN_MATCH', 'Elegí uno de los dos equipos del partido.');
      const { rows: [rule] } = await client.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=$3', [organizationId, record.category_id, record.rule_version]);
      const parsed = ruleSchema.safeParse(rule?.rules);
      if (!parsed.success) fail(409, 'RULES_INCOMPLETE', 'No se puede validar el reglamento de este partido.');
      if (input.kind === 'custom_card' && !parsed.data!.advanced?.discipline.customCards?.some(card => card.code === input.cardCode)) fail(400, 'CARD_UNKNOWN', 'Esa tarjeta no figura en el reglamento de este partido.');
      if ((input.kind === 'custom_card') !== !!input.cardCode) fail(400, 'CARD_DETAILS', 'Elegí una tarjeta configurada.');
      if (input.period && matchPeriodCodes.indexOf(input.period) >= parsed.data!.periods.length) fail(409, 'PERIOD_NOT_ALLOWED', 'Ese tiempo no figura en el reglamento.');
      if (input.minute !== null && input.period === null) fail(409, 'PERIOD_REQUIRED', 'Elegí el tiempo para registrar un minuto.');
      if ((input.kind==='substitution') !== !!input.relatedRegistrationId || (input.kind==='incident') !== !!input.incidentNote || (input.windowNo!=null && input.kind!=='substitution')) fail(400,'EVENT_DETAILS','Completá los datos correspondientes al evento.');
      if (input.kind==='substitution' && (input.registrationId===input.relatedRegistrationId || !input.registrationId)) fail(400,'SUBSTITUTION_PLAYERS','Elegí al jugador que sale y al que entra.');
      if (input.registrationId) {
        const side=input.teamEntryId===record.home_entry_id?'home':'away';
        let lineupPlayers=(record.roster_snapshot as {home:Array<{registrationId:string}>;away:Array<{registrationId:string}>})?.[side];
        if(!lineupPlayers?.length){const lineupId=side==='home'?record.home_lineup_id:record.away_lineup_id;if(lineupId){const {rows:[lineup]}=await client.query('SELECT snapshot FROM lineup_versions WHERE organization_id=$1 AND id=$2',[organizationId,lineupId]);lineupPlayers=lineup?.snapshot?.players;}}
        if (!lineupPlayers?.some((player) => player.registrationId === input.registrationId) || (input.relatedRegistrationId && !lineupPlayers.some(player=>player.registrationId===input.relatedRegistrationId))) fail(409, 'PLAYER_NOT_IN_LINEUP', 'El jugador no está en la planilla congelada.');
      } else if (['yellow','second_yellow','red','custom_card','substitution'].includes(input.kind)) fail(409, 'PLAYER_REQUIRED', 'Elegí un jugador para este evento.');
      const eventId = randomUUID(), sequence = record.revision + 1;
      await client.query(`INSERT INTO match_record_events(id,organization_id,match_id,sequence,client_event_id,kind,team_entry_id,registration_id,related_registration_id,incident_note,card_code,window_no,period,minute,recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [eventId, organizationId, match, sequence, input.clientEventId, input.kind, input.teamEntryId, input.registrationId, input.relatedRegistrationId??null, input.incidentNote??null,input.cardCode??null,input.windowNo??null,input.period,input.minute,actor.user_id]);
      await client.query('UPDATE match_records SET revision=$3 WHERE organization_id=$1 AND match_id=$2', [organizationId, match, sequence]);
      await appendMatchOutbox(client,organizationId,match,'match.provisional',sequence,await actaPayload(client,organizationId,match,{revision:sequence}));
      await audit(client, actor.user_id, organizationId, 'match.event_added', eventId, 'Evento de partido', null, { matchId: match, sequence, kind: input.kind });
    });
    return reply.code(201).send(await captureView(organizationId, match));
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/events/:eventId/void', async (request, reply) => {
    const { id, matchId, eventId } = request.params as { id: string; matchId: string; eventId: string };
    const organizationId = uuid(id), match = uuid(matchId), target = uuid(eventId), actor = await captureAccess(request, organizationId,match);
    const input = matchEventVoidSchema.parse(request.body);
    await transaction(pool, async (client) => {
      const { rows: [record] } = await client.query('SELECT status,revision FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR UPDATE', [organizationId, match]);
      if (!record) fail(404, 'RECORD_NOT_FOUND', 'No se encontró la carga del partido.');
      const { rows: [existing] } = await client.query('SELECT kind,voids_event_id,reason FROM match_record_events WHERE organization_id=$1 AND match_id=$2 AND client_event_id=$3', [organizationId, match, input.clientEventId]);
      if (existing) {
        if (existing.kind !== 'void' || existing.voids_event_id !== target || existing.reason !== input.reason) fail(409, 'EVENT_ID_REUSED', 'Esta solicitud ya se usó para otra corrección.');
        return;
      }
      if (record.status !== 'capturing') fail(409, 'RECORD_LOCKED', 'El acta ya no admite correcciones.');
      const { rows: [event] } = await client.query('SELECT id,kind FROM match_record_events WHERE organization_id=$1 AND match_id=$2 AND id=$3', [organizationId, match, target]);
      if (!event || event.kind === 'void') fail(404, 'EVENT_NOT_FOUND', 'No se encontró el evento original.');
      const { rowCount: voided } = await client.query('SELECT 1 FROM match_record_events WHERE organization_id=$1 AND match_id=$2 AND voids_event_id=$3', [organizationId, match, target]);
      if (voided) fail(409, 'EVENT_ALREADY_VOIDED', 'Este evento ya fue corregido.');
      const correctionId = randomUUID(), sequence = record.revision + 1;
      await client.query(`INSERT INTO match_record_events(id,organization_id,match_id,sequence,client_event_id,kind,voids_event_id,reason,recorded_by)
        VALUES($1,$2,$3,$4,$5,'void',$6,$7,$8)`, [correctionId, organizationId, match, sequence, input.clientEventId, target, input.reason, actor.user_id]);
      await client.query('UPDATE match_records SET revision=$3 WHERE organization_id=$1 AND match_id=$2', [organizationId, match, sequence]);
      await appendMatchOutbox(client,organizationId,match,'match.provisional',sequence,await actaPayload(client,organizationId,match,{revision:sequence}));
      await audit(client, actor.user_id, organizationId, 'match.event_voided', correctionId, input.reason, { eventId: target }, { matchId: match, sequence });
    });
    return reply.code(201).send(await captureView(organizationId, match));
  });
  app.get('/api/v1/organizations/:id/matches/:matchId/acta/history',async(request)=>{
    const {id,matchId}=request.params as {id:string;matchId:string}; const organizationId=uuid(id),match=uuid(matchId);
    await captureAccess(request,organizationId,match,'review');
    const {rows}=await pool.query(`SELECT s.id,s.version,s.kind,s.event_revision,s.reason,s.created_at,u.display_name actor,
      (SELECT count(*)::int FROM match_acta_signoffs x WHERE x.organization_id=s.organization_id AND x.snapshot_id=s.id) signoffs
      FROM match_acta_snapshots s JOIN users u ON u.id=s.created_by WHERE s.organization_id=$1 AND s.match_id=$2 ORDER BY s.version DESC`,[organizationId,match]);
    return rows;
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/acta/submit',async(request,reply)=>{
    const {id,matchId}=request.params as {id:string;matchId:string};const organizationId=uuid(id),match=uuid(matchId),actor=await captureAccess(request,organizationId,match);
    const {reason}=reasonSchema.parse(request.body);
    const result=await transaction(pool,async(client)=>{
      const {rows:[record]}=await client.query('SELECT revision,status FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR UPDATE',[organizationId,match]);
      if (!record) fail(404,'RECORD_NOT_FOUND','No se encontró el partido.');
      if (record.status!=='capturing') fail(409,'RECORD_LOCKED','El acta ya fue enviada.');
      const result=await appendActa(client,organizationId,match,record,'submitted',reason,actor.user_id);
      await client.query("UPDATE match_records SET status='submitted',submission_id=$3 WHERE organization_id=$1 AND match_id=$2",[organizationId,match,result.snapshotId]);
      await appendMatchOutbox(client,organizationId,match,'match.submitted',record.revision,result.snapshot);
      return result;
    });
    return reply.code(201).send({id:result.snapshotId,version:result.version,record:await captureView(organizationId,match)});
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/acta/sign',async(request,reply)=>{
    const {id,matchId}=request.params as {id:string;matchId:string};const organizationId=uuid(id),match=uuid(matchId),actor=await organizationAccess(request,organizationId);
    const input=z.object({entryId:z.uuid(),submissionId:z.uuid()}).strict().parse(request.body);
    await teamAccess(request,organizationId,input.entryId);
    const result=await transaction(pool,async(client)=>{
      const {rows:[record]}=await client.query('SELECT status,submission_id FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR UPDATE',[organizationId,match]);
      if (!record || record.status!=='submitted' || record.submission_id!==input.submissionId) fail(409,'ACTA_CHANGED','El acta cambió. Actualizá antes de firmar.');
      const {rows:[fixture]}=await client.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE organization_id=$1 AND id=$2',[organizationId,match]);
      if (![fixture.home_entry_id,fixture.away_entry_id].includes(input.entryId)) fail(403,'TEAM_SCOPE_DENIED','El equipo no participa en este partido.');
      const {rows:[membership]}=await client.query("SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2 AND status='active' AND role='team_admin'",[organizationId,actor.user_id]);
      if (!membership) fail(403,'TEAM_SCOPE_DENIED','La firma corresponde a un administrador de equipo.');
      const signId=randomUUID();
      const {rows:[signed]}=await client.query('INSERT INTO match_acta_signoffs(id,organization_id,match_id,snapshot_id,entry_id,membership_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (organization_id,snapshot_id,entry_id) DO NOTHING RETURNING id',[signId,organizationId,match,input.submissionId,input.entryId,membership.id]);
      if (signed) await audit(client,actor.user_id,organizationId,'match.acta_signed',signId,'Conformidad con acta enviada',null,{matchId:match,entryId:input.entryId});
      return {signed:true,reused:!signed};
    });
    return reply.code(result.reused?200:201).send(result);
  });
  app.get('/api/v1/organizations/:id/matches/:matchId/acta/for-team/:entryId',async(request)=>{
    const {id,matchId,entryId}=request.params as {id:string;matchId:string;entryId:string};const organizationId=uuid(id),match=uuid(matchId),entry=uuid(entryId);
    await teamAccess(request,organizationId,entry);
    const {rows:[record]}=await pool.query(`SELECT r.status,r.submission_id,r.approval_id,m.home_entry_id,m.away_entry_id FROM match_records r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id WHERE r.organization_id=$1 AND r.match_id=$2`,[organizationId,match]);
    if(!record || ![record.home_entry_id,record.away_entry_id].includes(entry)) fail(404,'ACTA_NOT_FOUND','No hay acta de este equipo.');
    if(record.status!=='submitted' && record.status!=='official') fail(409,'ACTA_NOT_SUBMITTED','Todavía no se envió el acta.');
    const view=await captureView(organizationId,match);
    const {rowCount:signed}=record.submission_id?await pool.query('SELECT 1 FROM match_acta_signoffs WHERE organization_id=$1 AND snapshot_id=$2 AND entry_id=$3',[organizationId,record.submission_id,entry]):{rowCount:0};
    const {rows:[approved]}=record.approval_id?await pool.query('SELECT version FROM match_acta_snapshots WHERE organization_id=$1 AND id=$2',[organizationId,record.approval_id]):{rows:[]};
    return {view,submissionId:record.submission_id,signed:Boolean(signed),approvedVersion:approved?.version||null};
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/acta/approve',async(request,reply)=>{
    const {id,matchId}=request.params as {id:string;matchId:string};const organizationId=uuid(id),match=uuid(matchId),actor=await captureAccess(request,organizationId,match,'review');
    const input=z.object({reason:z.string().trim().min(3).max(300),overrideSignoffs:z.boolean().default(false)}).strict().parse(request.body);
    const result=await transaction(pool,async(client)=>{
      const {rows:[record]}=await client.query('SELECT revision,status,submission_id,approval_id FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR UPDATE',[organizationId,match]);
      if (!record || record.status!=='submitted' || !record.submission_id) fail(409,'ACTA_NOT_SUBMITTED','Enviá primero el acta para revisión.');
      const {rows:[signs]}=await client.query('SELECT count(*)::int total FROM match_acta_signoffs WHERE organization_id=$1 AND snapshot_id=$2',[organizationId,record.submission_id]);
      if (signs.total<2 && !input.overrideSignoffs) fail(409,'SIGNOFFS_PENDING','Faltan conformidades de los equipos. Marcá la aprobación excepcional y justificá el motivo.');
      const result=await appendActa(client,organizationId,match,record,'approved',input.reason,actor.user_id);
      const {rows:[tie]}=await client.query(`SELECT s.id,s.phase_id,s.stage,s.match_id,s.return_match_id,s.decider_match_id,m.home_entry_id,m.away_entry_id,p.rule_version,p.category_id
        FROM fixture_bracket_slots s JOIN draft_matches m ON m.organization_id=s.organization_id AND m.id=s.match_id
        JOIN fixture_phases p ON p.organization_id=s.organization_id AND p.id=s.phase_id
        WHERE s.organization_id=$1 AND (s.match_id=$2 OR s.return_match_id=$2 OR s.decider_match_id=$2)`,[organizationId,match]);
      let bracketReassigned=0;
      const correctedMatchdays=new Set<string>();
      if(tie){
        await client.query('SELECT id FROM fixture_phases WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,tie.phase_id]);
        const {rows:downstream}=await client.query('SELECT id,home_source_id,away_source_id,match_id,return_match_id,decider_match_id FROM fixture_bracket_slots WHERE organization_id=$1 AND (home_source_id=$2 OR away_source_id=$2) AND match_id IS NOT NULL FOR UPDATE',[organizationId,tie.id]);
        if(downstream.length){
          const {rows:[version]}=await client.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=$3',[organizationId,tie.category_id,tie.rule_version]);
          const parsedRules=ruleSchema.safeParse(version?.rules);
          const resolution=parsedRules.success?parsedRules.data.competitionPlan?.rounds[tie.stage-1]?.resolution||'aggregate':'aggregate';
          const {rows:approved}=await client.query(`SELECT r.match_id,a.snapshot FROM match_records r JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved'
            WHERE r.organization_id=$1 AND r.match_id=ANY($2::uuid[])`,[organizationId,[tie.match_id,tie.return_match_id,tie.decider_match_id].filter(Boolean)]);
          const old=new Map(approved.map((item)=>[item.match_id,item.snapshot]));
          const points=parsedRules.success?parsedRules.data.points:{win:3,draw:1,loss:0};
          const before=tieWinner(tie.home_entry_id,tie.away_entry_id,old.get(tie.match_id)||null,tie.return_match_id?old.get(tie.return_match_id)||null:undefined,resolution,tie.decider_match_id?old.get(tie.decider_match_id)||null:undefined,points);
          const after=tieWinner(tie.home_entry_id,tie.away_entry_id,match===tie.match_id?result.snapshot:old.get(tie.match_id)||null,tie.return_match_id?(match===tie.return_match_id?result.snapshot:old.get(tie.return_match_id)||null):undefined,resolution,tie.decider_match_id?(match===tie.decider_match_id?result.snapshot:old.get(tie.decider_match_id)||null):undefined,points);
          if(before!==after){
            if(!after)fail(409,'BRACKET_DOWNSTREAM_LOCKED','El nuevo resultado no define clasificado y ya existe un cruce posterior. Revisá el cuadro antes de aprobar.');
            const {rows:[membership]}=await client.query("SELECT 1 allowed FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role='tournament_admin' AND status='active'",[organizationId,actor.user_id]);
            if(!membership)fail(403,'ORGANIZER_REQUIRED','Solo el organizador puede aprobar una rectificación que cambia el cuadro.');
            for(const slot of downstream){
              const matchIds=[slot.match_id,slot.return_match_id,slot.decider_match_id].filter(Boolean);
              const {rows:matches}=await client.query('SELECT id,home_entry_id,away_entry_id,matchday_id,venue_id,court_label,referee_id,referee_name,starts_at,duration_minutes FROM draft_matches WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE',[organizationId,matchIds]);
              const {rowCount:started}=await client.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=ANY($2::uuid[]) UNION SELECT 1 FROM lineup_versions WHERE organization_id=$1 AND match_id=ANY($2::uuid[]) LIMIT 1',[organizationId,matchIds]);
              if(matches.length!==matchIds.length || started)fail(409,'BRACKET_DOWNSTREAM_LOCKED','El cruce posterior ya tiene planilla o acta. Revisá el cuadro antes de aprobar la rectificación.');
              const side=slot.home_source_id===tie.id?'home':'away';
              for(const fixture of matches){
                const isReturn=fixture.id===slot.return_match_id,field=(side==='home') !== isReturn?'home_entry_id':'away_entry_id';
                if((field==='home_entry_id'?fixture.away_entry_id:fixture.home_entry_id)===after)fail(409,'BRACKET_SAME_TEAM','La rectificación dejaría un equipo contra sí mismo. Revisá el cuadro.');
                const home=field==='home_entry_id'?after:fixture.home_entry_id,away=field==='away_entry_id'?after:fixture.away_entry_id;
                if(fixture.matchday_id){
                  const conflicts=await scheduleConflicts(client,organizationId,fixture.id,home,away,fixture.venue_id,fixture.court_label,fixture.referee_id,fixture.referee_name,new Date(fixture.starts_at),fixture.duration_minutes);
                  if(conflicts.hard.length)fail(409,'BRACKET_SCHEDULE_CONFLICT',`El clasificado nuevo genera un conflicto de horario: ${conflicts.hard.join(' ')} Reprogramá el cruce posterior y volvé a aprobar.`);
                }
                await client.query(`UPDATE draft_matches SET ${field}=$3 WHERE organization_id=$1 AND id=$2`,[organizationId,fixture.id,after]);
                if(fixture.matchday_id)correctedMatchdays.add(fixture.matchday_id);
                bracketReassigned++;
              }
              await audit(client,actor.user_id,organizationId,'fixture.downstream_reassigned',slot.id,input.reason,{winner:before},{winner:after,matches:matchIds,sourceSlotId:tie.id});
            }
            await client.query('UPDATE fixture_phases SET revision=revision+1 WHERE organization_id=$1 AND id=$2',[organizationId,tie.phase_id]);
            for(const dayId of correctedMatchdays){
              const {rows:[day]}=await client.query('UPDATE matchdays SET revision=revision+1 WHERE organization_id=$1 AND id=$2 RETURNING id,status,revision',[organizationId,dayId]);
              if(day.status==='published')await publishMatchdaySnapshot(client,organizationId,day,actor.user_id,input.reason,'matchday.corrected');
              await audit(client,actor.user_id,organizationId,'matchday.participants_corrected',dayId,input.reason,null,{sourceMatchId:match,revision:day.revision});
            }
          }
        }
      }
      await client.query("UPDATE match_records SET status='official',approval_id=$3 WHERE organization_id=$1 AND match_id=$2",[organizationId,match,result.snapshotId]);
      const {rows:[positionMatch]}=await client.query('SELECT category_id FROM draft_matches WHERE organization_id=$1 AND id=$2 AND position_game_id IS NOT NULL',[organizationId,match]);
      if(positionMatch)await syncPositionMatches(client,organizationId,positionMatch.category_id,actor.user_id);
      await recordSuspensionService(client,organizationId,match);
      await appendMatchOutbox(client,organizationId,match,record.approval_id?'match.corrected':'match.official',record.revision,{...result.snapshot,approvalId:result.snapshotId,previousApprovalId:record.approval_id});
      return {...result,bracketReassigned,correctedMatchdays:correctedMatchdays.size};
    });
    return reply.code(201).send({id:result.snapshotId,version:result.version,bracketReassigned:result.bracketReassigned,correctedMatchdays:result.correctedMatchdays,record:await captureView(organizationId,match)});
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/acta/reject',async(request)=>{
    const {id,matchId}=request.params as {id:string;matchId:string};const organizationId=uuid(id),match=uuid(matchId),actor=await captureAccess(request,organizationId,match,'review');const {reason}=reasonSchema.parse(request.body);
    await transaction(pool,async(client)=>{
      const {rows:[record]}=await client.query('SELECT revision,status FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR UPDATE',[organizationId,match]);
      if (!record || record.status!=='submitted') fail(409,'ACTA_NOT_SUBMITTED','No hay acta enviada para devolver.');
      await appendActa(client,organizationId,match,record,'rejected',reason,actor.user_id);
      await client.query("UPDATE match_records SET status='capturing',submission_id=NULL WHERE organization_id=$1 AND match_id=$2",[organizationId,match]);
    });
    return captureView(organizationId,match);
  });
  app.post('/api/v1/organizations/:id/matches/:matchId/acta/reopen',async(request)=>{
    const {id,matchId}=request.params as {id:string;matchId:string};const organizationId=uuid(id),match=uuid(matchId),actor=await captureAccess(request,organizationId,match,'review');const {reason}=reasonSchema.parse(request.body);
    await transaction(pool,async(client)=>{
      const {rows:[record]}=await client.query('SELECT revision,status FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR UPDATE',[organizationId,match]);
      if (!record || record.status!=='official') fail(409,'ACTA_NOT_OFFICIAL','Solo se puede rectificar un acta oficial.');
      await appendActa(client,organizationId,match,record,'reopened',reason,actor.user_id);
      await client.query("UPDATE match_records SET status='capturing',submission_id=NULL WHERE organization_id=$1 AND match_id=$2",[organizationId,match]);
    });
    return captureView(organizationId,match);
  });
  registerFlyerRoutes(app,pool,config.mediaDir,config.origin,organizationAccess,fail);
  registerPublicWebRoutes(app,pool,config.origin);
  app.addHook('onClose', async () => { if (!suppliedPool) await pool.end(); });
  return app;
}
