import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { createPool } from '@torneos/db';
import { ruleSchema, type RuleConfig } from '@torneos/shared';
import { csrfFor, digest, opaqueToken } from '../apps/api/src/security.ts';
import { fcfsPositionPlan } from './fcfs-position-plan.ts';

const config = readConfig();
const destination = new URL(config.databaseUrl);
const target = process.env.FCFS_PRODUCTION_IMPORT;
if (process.env.NODE_ENV !== 'production' || !['production', 'rehearsal'].includes(target || '') ||
    destination.hostname !== '127.0.0.1' || !['/torneos_prod', '/torneos_import_rehearsal'].includes(destination.pathname) ||
    destination.pathname !== (target === 'production' ? '/torneos_prod' : '/torneos_import_rehearsal') ||
    config.origin !== 'https://alacancha.webs.vc') throw new Error('Destino o confirmación de importación FCFS inválidos.');
const assetDir = resolve(process.env.FCFS_ASSET_DIR || '/srv/torneos/import-assets');

const organizationName = 'Federación Caacupeña de Fútbol de Salón';
const username = 'usuariofcfs';
const tournamentName = 'Copa Caacupé - Cooperativa Serrana';
const teams = [
  ['Mc Cavi', '#C53232', 'Equipo por identificar'],
  ['8 de Diciembre', '#1385BD', 'Club 8 de Diciembre'],
  ['Juan Pablo II', '#713FA2', ''],
  ['Barrio Nuevo', '#A62332', 'Barrio Nuevo Sport'],
  ['Mercury', '#136894', 'Mercury FC'],
  ['Cosmos 04', '#17579C', 'Cosmos 04 Futsal'],
  ['Ytororo', '#2A5798', 'Ytororó'],
  ['Club Teniente Fariña', '#182A38', ''],
  ['Asociación de Jóvenes del Barrio Loma', '#2489BD', ''],
  ['Sporting Cruzado', '#742CA0', ''],
] as const;
const credentialPath = resolve(`/srv/torneos/private/fcfs-access-${target}.txt`);
const key = (label: string) => {
  const hex = createHash('sha256').update(`fcfs:2026:${label}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const rules: RuleConfig = ruleSchema.parse({
  initialPhase: null, competitionPlan: null,
  playersOnField: 5, minimumToStart: 4, minimumToContinue: 3,
  maxMatchRoster: 12, maxBenchPlayers: 7, maxBenchStaff: 3,
  lineupRoles: { goalkeeperRequired: false, captainRequired: false },
  maxRegisteredPlayers: null,
  substitutions: { mode: 'unlimited', maxChanges: null, maxWindows: null, reentry: true },
  eligibility: { age: null, requiredDocuments: [], registrationWindow: null, transferProof: { requiredFor: 'none', label: 'Comprobante de pase' }, registrationFields: [] },
  advanced: { tiebreakers: ['head_to_head_points', 'goal_difference', 'goals_for', 'wins', 'manual_draw'], discipline: { yellowCards: true, redCards: true, secondYellowRed: false, yellowAccumulation: null, redReviewRequired: false }, walkover: { enabled: false, winnerGoals: null, loserGoals: null, winnerPoints: null, loserPoints: null } },
  periods: [{ name: 'Primer tiempo', minutes: 20 }, { name: 'Segundo tiempo', minutes: 20 }],
  points: { win: 2, draw: 1, loss: 0 },
});

const pool = createPool(config.databaseUrl);
const app = await buildApp(config, pool);
let ownerSessionId = '';
let organizerSessionToken = '';
try {
  const { rows: [owner], rowCount: ownerCount } = await pool.query('SELECT id FROM users WHERE platform_admin=true AND disabled_at IS NULL');
  if (ownerCount !== 1) throw new Error('Se necesita exactamente un superadmin activo.');
  const { rows: existingOrganizations } = await pool.query('SELECT name FROM organizations');
  if (existingOrganizations.some(row => row.name !== organizationName)) throw new Error('Hay otra organización en destino; revisar antes de importar.');
  for (const filename of ['fcfs-logo.png', 'copa-caacupe-logo.png', 'fpfs-logo.png',
    'mc-cavi.png', '8-de-diciembre.png', 'juan-pablo-ii.png', 'barrio-nuevo.png', 'mercury.png',
    'cosmos-04.png', 'ytororo.png', 'teniente-farina.png', 'ajbl.png', 'sporting-cruzado.png']) {
    const file = filename.startsWith('fcfs-') || filename.startsWith('copa-') || filename.startsWith('fpfs-') ? filename : `escudos/${filename}`;
    const image = await readFile(resolve(assetDir, file));
    if (image.length < 100 || image.length > 2 * 1024 * 1024 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Imagen FCFS inválida: ${file}`);
  }
  const { rows: existingUsers } = await pool.query(`SELECT o.id,o.name,m.id membership_id,m.status,u.password_hash
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id
    WHERE lower(u.username)=lower($1)`, [username]);
  if (existingUsers.length > 1 || (existingUsers.length === 1 && existingUsers[0].name !== organizationName)) throw new Error('El usuario ya pertenece a otra organización; no se modifica.');

  const saved = await readFile(credentialPath, 'utf8').catch(() => '');
  const password = saved.match(/^Contraseña: (.+)$/m)?.[1] || `FCFS!${randomBytes(18).toString('base64url')}`;
  if (!saved) { await mkdir(resolve('/srv/torneos/private'), { recursive: true, mode: 0o700 }); await writeFile(credentialPath, `Usuario: ${username}\nContraseña: ${password}\nAcceso: ${config.origin}/acceso\n`, { flag: 'wx', mode: 0o600 }); }

  const ownerToken = opaqueToken();
  ownerSessionId = randomUUID();
  await pool.query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [ownerSessionId, owner.id, digest(ownerToken)]);
  const ownerCookie = `torneos_session=${ownerToken}`;
  const ownerHeaders = { cookie: ownerCookie, 'x-csrf-token': csrfFor(config.appSecret, ownerToken) };
  const call = async (method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown, headers = ownerHeaders) => {
    const response = await app.inject({ method, url: `/api/v1${path}`, headers, payload: payload as any });
    if (response.statusCode >= 400) throw new Error(`${method} ${path}: ${response.statusCode} ${response.body}`);
    return response.json() as any;
  };

  let organizationId: string, membershipId: string;
  if (existingUsers.length) { organizationId = existingUsers[0].id; membershipId = existingUsers[0].membership_id; }
  else {
    const created = await call('POST', '/admin/organizations', { name: organizationName, administratorName: 'Administración FCFS', username, requestId: key('organization') });
    organizationId = created.organizationId; membershipId = created.membershipId;
  }
  if (!existingUsers.length || existingUsers[0].status !== 'active') await call('POST', `/admin/memberships/${membershipId}/access`, { status: 'active', version: 1, reason: 'Preparación Copa Caacupé' });

  let organizerLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } });
  if (organizerLogin.statusCode !== 200) {
    const invitation = await call('POST', `/admin/memberships/${membershipId}/invitation`);
    const accepted = await app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token: invitation.token, password } });
    if (accepted.statusCode !== 200) throw new Error(`No se pudo activar usuariofcfs: ${accepted.statusCode} ${accepted.body}`);
    organizerLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username, password } });
  }
  if (organizerLogin.statusCode !== 200) throw new Error('No se pudo abrir la cuenta organizadora.');
  organizerSessionToken = organizerLogin.cookies[0].value;
  const organizerCookie = `torneos_session=${organizerSessionToken}`;
  let organizerHeaders = { cookie: organizerCookie, 'x-csrf-token': organizerLogin.json().csrfToken as string };
  const context = await call('POST', '/auth/context', { organizationId }, organizerHeaders);
  organizerHeaders = { cookie: organizerCookie, 'x-csrf-token': context.csrfToken as string };
  const base = `/organizations/${organizationId}`;

  const { rows: [org] } = await pool.query('SELECT logo_id FROM organizations WHERE id=$1', [organizationId]);
  if (!org.logo_id) {
    const image = await readFile(resolve(assetDir, 'fcfs-logo.png'));
    const boundary = `fcfs-logo-${randomUUID()}`;
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fcfs.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const uploaded = await app.inject({ method: 'POST', url: `/api/v1${base}/logo`, headers: { ...organizerHeaders, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    if (uploaded.statusCode !== 201) throw new Error(`No se pudo guardar el logo FCFS: ${uploaded.statusCode} ${uploaded.body}`);
  }

  const {rows:[existingTournament]}=await pool.query(`SELECT t.id "tournamentId",c.id "categoryId" FROM tournaments t
    JOIN editions e ON e.organization_id=t.organization_id AND e.tournament_id=t.id
    JOIN categories c ON c.organization_id=e.organization_id AND c.edition_id=e.id
    WHERE t.organization_id=$1 AND t.request_key=$2 AND e.name='2026' ORDER BY c.created_at LIMIT 1`,[organizationId,key('tournament')]);
  const created = existingTournament || await call('POST', `${base}/tournaments`, { requestId: key('tournament'), name: tournamentName, timezone: 'America/Asuncion', editionName: '2026', categoryName: 'Primera', preset: 'personalizado', teamLimit: 10, rules, paymentRates: { yellowGuaranies: 0, redGuaranies: 0 } }, organizerHeaders);
  const { tournamentId, categoryId } = created;
  await pool.query("UPDATE categories SET name='Primera' WHERE organization_id=$1 AND id=$2 AND name='Libre'",[organizationId,categoryId]);
  const {rows:[currentRules]}=await pool.query('SELECT status,revision,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,categoryId]);
  if(currentRules.status==='draft' && (currentRules.rules.points.win!==2 || currentRules.rules.points.draw!==1 || currentRules.rules.points.loss!==0)){
    const {rows:[existingMatches]}=await pool.query('SELECT count(*)::int total FROM draft_matches WHERE organization_id=$1 AND category_id=$2',[organizationId,categoryId]);
    if(existingMatches.total)throw new Error('La Copa ya tiene partidos; revisá los puntos antes de cambiarlos.');
    await call('POST',`${base}/categories/${categoryId}/rules/draft`,{expectedRevision:currentRules.revision,reason:'Puntuación confirmada para Copa Caacupé: victoria 2, empate 1, derrota 0',rules:{...currentRules.rules,points:{win:2,draw:1,loss:0}}},organizerHeaders);
  }
  const { rows: [tournament] } = await pool.query('SELECT emblem_id FROM tournaments WHERE organization_id=$1 AND id=$2', [organizationId, tournamentId]);
  if (!tournament.emblem_id) {
    const image = await readFile(resolve(assetDir, 'copa-caacupe-logo.png'));
    const boundary = `copa-logo-${randomUUID()}`;
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="copa-caacupe.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const uploaded = await app.inject({ method: 'POST', url: `/api/v1${base}/tournaments/${tournamentId}/emblem`, headers: { ...organizerHeaders, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    if (uploaded.statusCode !== 201) throw new Error(`No se pudo guardar el emblema de la copa: ${uploaded.statusCode} ${uploaded.body}`);
  }
  const ids: string[] = [];
  for (const [index, [name, color, previousName]] of teams.entries()) {
    const requestId = key(`team:${index + 1}`);
    const { rows: [existing] } = await pool.query('SELECT id,name FROM teams WHERE organization_id=$1 AND request_key=$2', [organizationId, requestId]);
    if (existing) {
      if (previousName && existing.name === previousName) await call('PATCH', `${base}/teams/${existing.id}`, { name }, organizerHeaders);
      ids.push(existing.id);
    } else {
      const result = await call('POST', `${base}/teams`, { requestId, name, color, categoryId }, organizerHeaders);
      ids.push(result.teamId);
    }
  }
  const shieldFiles = ['mc-cavi.png', '8-de-diciembre.png', 'juan-pablo-ii.png', 'barrio-nuevo.png', 'mercury.png', 'cosmos-04.png', 'ytororo.png', 'teniente-farina.png', 'ajbl.png', 'sporting-cruzado.png'];
  for (const [index, teamId] of ids.entries()) {
    const { rows: [team] } = await pool.query('SELECT shield_id FROM teams WHERE organization_id=$1 AND id=$2', [organizationId, teamId]);
    if (team.shield_id) continue;
    const filename = shieldFiles[index];
    const image = await readFile(resolve(assetDir, 'escudos', filename));
    const boundary = `fcfs-shield-${randomUUID()}`;
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const uploaded = await app.inject({ method: 'POST', url: `/api/v1${base}/teams/${teamId}/shield`, headers: { ...organizerHeaders, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    if (uploaded.statusCode !== 201) throw new Error(`No se pudo cargar escudo ${index + 1}: ${uploaded.statusCode} ${uploaded.body}`);
  }
  const settingsPath = `${base}/tournaments/${tournamentId}/flyer-settings`;
  const settings = await call('GET', settingsPath, undefined, organizerHeaders);
  if (settings.template !== 'forest' || settings.size !== 'portrait' || settings.format !== 'png' || settings.primary_color !== '#073B2C' || settings.accent_color !== '#E9BC3D') {
    await call('PATCH', settingsPath, { revision: settings.revision, template: 'forest', size: 'portrait', format: 'png', primaryColor: '#073B2C', accentColor: '#E9BC3D' }, organizerHeaders);
  }
  const currentSettings = await call('GET', settingsPath, undefined, organizerHeaders);
  if (!currentSettings.federation_logo_id) {
    const image = await readFile(resolve(assetDir, 'fpfs-logo.png'));
    const boundary = `fcfs-federation-${randomUUID()}`;
    const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fpfs.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const uploaded = await app.inject({ method: 'POST', url: `/api/v1${settingsPath}/logos/federation`, headers: { ...organizerHeaders, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    if (uploaded.statusCode !== 201) throw new Error(`No se pudo cargar logo FPFS: ${uploaded.statusCode} ${uploaded.body}`);
  }
  await call('POST', `${base}/categories/${categoryId}/fixture/blueprint`, fcfsPositionPlan, organizerHeaders);
  const positionPlan = await call('GET', `${base}/categories/${categoryId}/fixture/blueprint`, undefined, organizerHeaders);
  if (!positionPlan.blueprint || positionPlan.slots.length !== 10 || positionPlan.games.length !== 35 ||
      positionPlan.games.filter((game: { sporting_round: string; jornada_no: number | null }) => game.sporting_round === 'F1' && game.jornada_no === null).length !== 5) throw new Error('El plan por posiciones no conserva 35 cruces y la apertura pendiente.');
  const { rows: [state] } = await pool.query(`SELECT t.status,(t.emblem_id IS NOT NULL) has_emblem,rv.status rule_status,rv.rules->'initialPhase' initial_phase,rv.rules->'points' points,
    (SELECT count(*)::int FROM team_entries WHERE organization_id=$1 AND category_id=$2) team_count,
    (SELECT count(*)::int FROM draft_matches WHERE organization_id=$1 AND category_id=$2) match_count
    FROM tournaments t JOIN editions e ON e.organization_id=t.organization_id AND e.tournament_id=t.id
    JOIN categories c ON c.organization_id=e.organization_id AND c.edition_id=e.id
    JOIN rule_versions rv ON rv.organization_id=c.organization_id AND rv.category_id=c.id
    WHERE t.organization_id=$1 AND t.id=$3 AND c.id=$2`, [organizationId, categoryId, tournamentId]);
  if (state.status !== 'draft' || !state.has_emblem || state.rule_status !== 'draft' || state.initial_phase !== null || state.team_count !== 10 || state.match_count !== 0 || state.points.win!==2 || state.points.draw!==1 || state.points.loss!==0) throw new Error('La Copa no quedó como borrador con puntuación 2/1/0 y sin partidos; revisar antes de usar.');
  const { rows: [shieldCount] } = await pool.query(`SELECT count(*)::int total FROM teams t JOIN team_entries e ON e.organization_id=t.organization_id AND e.team_id=t.id WHERE e.organization_id=$1 AND e.category_id=$2 AND t.shield_id IS NOT NULL`, [organizationId, categoryId]);
  if (shieldCount.total !== 10) throw new Error('Falta alguno de los diez escudos.');
  await call('POST', `${base}/categories/${categoryId}/fixture/blueprint/publish-draw`, { expectedRevision: positionPlan.blueprint.revision }, organizerHeaders);
  const publicCatalog = await app.inject({ method: 'GET', url: '/api/v1/public/tournaments?q=Caacup%C3%A9' });
  if (publicCatalog.statusCode !== 200 || !publicCatalog.json().some((item: { id: string }) => item.id === tournamentId)) throw new Error('La publicación parcial debe aparecer en el catálogo público.');
  const publicEmblem = await app.inject({ method: 'GET', url: `/api/v1/public${base}/tournaments/${tournamentId}/emblem` });
  if (publicEmblem.statusCode !== 200) throw new Error('El emblema de la publicación parcial no está disponible.');
  console.log(JSON.stringify({ organizationId, tournamentId, categoryId, teams: ids.length, shields: shieldCount.total, plannedPositionGames: positionPlan.games.length, fixtureMatches: 0, points:state.points, publicVisible: true, accessFile: credentialPath }));
} finally {
  if (ownerSessionId) await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [ownerSessionId]);
  if (organizerSessionToken) await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [digest(organizerSessionToken)]);
  await app.close(); await pool.end();
}
