import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '@torneos/db';
import { migrate } from '../../packages/db/src/migrate.ts';
import { seed } from '../../packages/db/src/seed.ts';
import { buildApp } from '../../apps/api/src/app.ts';
import { readConfig } from '../../apps/api/src/config.ts';
import { disciplineDecisionPdf } from '../../apps/api/src/discipline-pdf.ts';
import { sportsReportCsv } from '../../apps/api/src/sports-report.ts';
import { processFlyerJobs } from '../../apps/worker/src/flyers.ts';
import { processFixtureOutbox } from '../../apps/worker/src/fixture-outbox.ts';
import { loadFlyerSource } from '../../apps/api/src/flyer-source.ts';
import { renderFlyerSvg } from '../../apps/api/src/flyer-template.ts';
import { bestRemainingTie, qualifiedEntries, tieWinner } from '../../apps/api/src/fixture-progress.ts';
import { hashPassword, digest, decryptDocument } from '../../apps/api/src/security.ts';
import { rankStandings, roundRobin, drawGroups, knockoutBracket, ruleSchema, previewCompetitionBracket, projectMatchJournal, deriveOfficialStatistics, type RankedMatch, type CurrentUser, type RuleConfig, type MatchJournalEvent } from '@torneos/shared';
import { fcfsPositionPlan } from '../../scripts/fcfs-position-plan.ts';
import { routeInventory } from '../../scripts/audit-routes.ts';

const databaseUrl = process.env.TEST_DATABASE_URL!;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/torneos_test' || new URL(databaseUrl).hostname !== '127.0.0.1') throw new Error('Pruebas restringidas a torneos_test en este PC.');
const pool = createPool(databaseUrl);
const config = { ...readConfig(), databaseUrl, mediaDir: new URL('../../.local/test-media/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') };
let app: Awaited<ReturnType<typeof buildApp>>;
const runId = randomUUID().slice(0, 8), password = 'PruebaLocal!2026';
const ids = { a: randomUUID(), b: randomUUID(), owner: randomUUID(), adminA: randomUUID(), adminB: randomUUID(), teamA: randomUUID(), multi: randomUUID(), memberA: randomUUID(), memberB: randomUUID(), multiA: randomUUID() };
interface Session { cookie: string; me: CurrentUser }
let owner: Session, adminA: Session, adminB: Session, teamA: Session;
let address = 1;
const username = (name: string) => `${name}-${runId}@ejemplo.test`;
const headers = (session: Session) => ({ cookie: session.cookie, 'x-csrf-token': session.me.csrfToken });
async function login(name: string, secret = password, organizationId?: string): Promise<Session> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: name.includes('@') ? name : username(name), password: secret }, remoteAddress: `203.0.113.${address++}` });
  assert.equal(response.statusCode, 200, response.body);
  const session = { cookie: `torneos_session=${response.cookies[0].value}`, me: response.json<CurrentUser>() };
  if (organizationId) {
    const context = await app.inject({ method: 'POST', url: '/api/v1/auth/context', headers: headers(session), payload: { organizationId } });
    assert.equal(context.statusCode, 200, context.body); session.me = context.json();
  }
  return session;
}
async function request(session: Session, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) { return app.inject({ method, url: `/api/v1${url}`, headers: headers(session), payload: payload as any }); }
async function newOrganization(name = 'Nueva liga sintética', account = username(`nuevo-${randomUUID().slice(0, 6)}`)) {
  const result = await request(owner, 'POST', '/admin/organizations', { name, administratorName: 'Responsable de prueba', username: account, requestId: randomUUID() });
  assert.equal(result.statusCode, 201, result.body); return { ...result.json(), username: account };
}

before(async () => {
  await migrate(pool);
  const encoded = await hashPassword(password);
  await pool.query("INSERT INTO organizations(id,name,status) VALUES($1,$3,'active'),($2,$3,'active')", [ids.a, ids.b, `Mismo nombre de muestra ${runId}`]);
  for (const [key, name, platform] of [[ids.owner, 'owner', true], [ids.adminA, 'a', false], [ids.adminB, 'b', false], [ids.teamA, 'equipo', false], [ids.multi, 'multiple', false]] as const) await pool.query('INSERT INTO users(id,username,display_name,password_hash,platform_admin) VALUES($1,$2,$3,$4,$5)', [key, username(name), `Cuenta ${name} sintética`, encoded, platform]);
  for (const [id, org, userId, role] of [[ids.memberA, ids.a, ids.adminA, 'tournament_admin'], [ids.memberB, ids.b, ids.adminB, 'tournament_admin'], [randomUUID(), ids.a, ids.teamA, 'team_admin'], [ids.multiA, ids.a, ids.multi, 'tournament_admin'], [randomUUID(), ids.b, ids.multi, 'tournament_admin']]) await pool.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,$4,'active')", [id, org, userId, role]);
  app = await buildApp(config, pool);
  owner = await login('owner'); adminA = await login('a', password, ids.a); adminB = await login('b', password, ids.b); teamA = await login('equipo', password, ids.a);
});
after(async () => { await app?.close(); await pool.end(); });

test('salud y disponibilidad; una ruta privada exige sesión', async () => {
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.equal((await app.inject('/ready')).statusCode, 200);
  assert.equal((await app.inject('/api/v1/auth/me')).statusCode, 401);
});
test('Argon2id y sesiones opacas almacenadas solo como hash', async () => {
  const { rows: [user] } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [ids.adminA]);
  assert.match(user.password_hash, /^\$argon2id\$/);
  const raw = adminA.cookie.split('=')[1];
  const { rows: [session] } = await pool.query('SELECT token_hash FROM sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1', [ids.adminA]);
  assert.equal(session.token_hash, digest(raw)); assert.notEqual(session.token_hash, raw);
  assert.equal('password_hash' in adminA.me, false);
});
test('administrador consulta y modifica su organización; se rechaza otra organización', async () => {
  const own = await request(adminA, 'GET', `/organizations/${ids.a}`); assert.equal(own.statusCode, 200);
  const result = await request(adminA, 'PATCH', `/organizations/${ids.a}/branding`, { name: `Liga A ${runId}`, accent: '#165D46', version: own.json().version }); assert.equal(result.statusCode, 200, result.body);
  assert.equal((await request(adminA, 'GET', `/organizations/${ids.b}`)).statusCode, 403);
  assert.equal((await request(adminA, 'PATCH', `/organizations/${ids.b}/branding`, { name: 'Intento ajeno', accent: '#165D46', version: 1 })).statusCode, 403);
});
test('superadmin no hereda permiso para leer datos privados del torneo', async () => {
  assert.equal((await request(owner,'GET',`/organizations/${ids.a}`)).statusCode,403);
  assert.equal((await request(owner,'GET',`/organizations/${ids.a}/teams`)).statusCode,403);
  assert.equal((await request(adminA,'GET',`/organizations/${ids.a}/teams`)).statusCode,200);
});
test('todas las rutas privadas declaradas rechazan solicitudes anónimas', async () => {
  assert.ok(routeInventory.length>=189,`El inventario solo encontró ${routeInventory.length} rutas.`);
  let checked=0;
  for(const {method,path,access} of routeInventory){
    assert.ok(path,`Ruta no resuelta: ${method}`);
    assert.ok(app.hasRoute({method:method as 'GET'|'POST'|'PATCH'|'PUT'|'DELETE',url:path}),`Ruta ausente en Fastify: ${method} ${path}`);
    if(access!=='guarded')continue;
    const url=path.replace(/:[^/]+/g,'00000000-0000-4000-8000-000000000000');
    const response=await app.inject({method:method as 'GET'|'POST'|'PATCH'|'PUT'|'DELETE',url,payload:method==='GET'?undefined:{}});
    assert.ok(response.statusCode>=400&&response.statusCode<500,`${method} ${path}: HTTP ${response.statusCode}`);
    checked++;
  }
  assert.ok(checked>=162,`Solo se revisaron ${checked} rutas privadas.`);
});
test('ninguna ruta de organización concede acceso cruzado o por ser superadmin', async () => {
  let checked=0;
  for(const {method,path} of routeInventory){
    if(!path?.startsWith('/api/v1/organizations/:id'))continue;
    const url=path.replace('/organizations/:id',`/organizations/${ids.b}`).replace(/:[^/]+/g,'00000000-0000-4000-8000-000000000000');
    const response=await app.inject({method:method as 'GET'|'POST'|'PATCH'|'PUT'|'DELETE',url,headers:headers(adminA),payload:method==='GET'?undefined:{}});
    assert.ok(response.statusCode>=400&&response.statusCode<500,`${method} ${path}: HTTP ${response.statusCode}`);
    checked++;
  }
  assert.ok(checked>=149,`Solo se revisaron ${checked} rutas entre organizaciones.`);
  assert.equal((await request(owner,'GET',`/organizations/${ids.a}/teams`)).statusCode,403);
});
test('organization_id enviado en el cuerpo no autoriza ni altera el ámbito', async () => {
  const own = (await request(adminA, 'GET', `/organizations/${ids.a}`)).json();
  const result = await request(adminA, 'PATCH', `/organizations/${ids.a}/branding`, { name: 'Intento con selector inyectado', accent: '#165D46', version: own.version, organization_id: ids.b });
  assert.equal(result.statusCode, 400);
});
test('administrador de equipo lee su organización pero no cambia su configuración', async () => {
  assert.equal((await request(teamA, 'GET', `/organizations/${ids.a}`)).statusCode, 200);
  assert.equal((await request(teamA, 'GET', `/organizations/${ids.b}`)).statusCode, 403);
  assert.equal((await request(teamA, 'PATCH', `/organizations/${ids.a}/branding`, { name: 'No autorizado', accent: '#165D46', version: 1 })).statusCode, 403);
});
test('un organizador no cambia accesos ni se autoactiva', async () => {
  assert.equal((await request(adminA, 'GET', '/admin/administrators')).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/admin/memberships/${ids.memberA}/access`, { status: 'active', reason: 'Intento propio', version: 1 })).statusCode, 403);
});
test('mutaciones rechazan CSRF ausente y origen ajeno', async () => {
  const body = { organizationId: ids.a };
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/context', headers: { cookie: adminA.cookie }, payload: body })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/context', headers: { ...headers(adminA), origin: 'https://origen-ajeno.invalid' }, payload: body })).statusCode, 403);
});
test('edición concurrente antigua no sobrescribe una versión nueva', async () => {
  const own = (await request(adminA, 'GET', `/organizations/${ids.a}`)).json();
  const body = { name: `Liga actualizada ${runId}`, accent: '#234F7D', version: own.version };
  assert.equal((await request(adminA, 'PATCH', `/organizations/${ids.a}/branding`, body)).statusCode, 200);
  assert.equal((await request(adminA, 'PATCH', `/organizations/${ids.a}/branding`, { ...body, name: 'Versión vieja' })).statusCode, 409);
});
test('bloqueo afecta a B y revoca su sesión, conservando a A', async () => {
  const changed = await request(owner, 'POST', `/admin/memberships/${ids.memberB}/access`, { status: 'blocked', reason: 'Bloqueo sintético de B', version: 1 }); assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await request(adminB, 'GET', '/auth/me')).statusCode, 401);
  assert.equal((await request(adminA, 'GET', `/organizations/${ids.a}`)).statusCode, 200);
  const blocked = await login('b');
  assert.equal(blocked.me.memberships[0].status, 'blocked');
  assert.equal((await request(blocked, 'POST', '/auth/context', { organizationId: ids.b })).statusCode, 403);
  assert.equal((await request(owner, 'POST', `/admin/memberships/${ids.memberB}/access`, { status: 'active', reason: 'Reactivación sintética de B', version: changed.json().version })).statusCode, 200);
  adminB = await login('b', password, ids.b);
});
test('cambio de contexto y revocación específica no contaminan la otra membresía', async () => {
  const multiple = await login('multiple', password, ids.a); assert.equal(multiple.me.memberships.length, 2);
  assert.equal((await request(multiple, 'GET', `/organizations/${ids.b}`)).statusCode, 403);
  const context = await request(multiple, 'POST', '/auth/context', { organizationId: ids.b }); assert.equal(context.statusCode, 200); multiple.me = context.json();
  assert.equal((await request(multiple, 'GET', `/organizations/${ids.a}`)).statusCode, 403);
  assert.equal((await request(multiple, 'GET', `/organizations/${ids.b}`)).statusCode, 200);
  assert.equal((await request(owner, 'POST', `/admin/memberships/${ids.multiA}/access`, { status: 'blocked', reason: 'Se limita solo A', version: 1 })).statusCode, 200);
  assert.equal((await request(multiple, 'GET', `/organizations/${ids.b}`)).statusCode, 200);
});
test('invitación nueva: token en hash, un solo uso y activación manual', async () => {
  const created = await newOrganization();
  const inspected = await app.inject({ method: 'POST', url: '/api/v1/invitations/inspect', payload: { token: created.invitation.token } }); assert.equal(inspected.statusCode, 200);
  const { rows: [stored] } = await pool.query('SELECT token_hash FROM invitations WHERE token_hash=$1', [digest(created.invitation.token)]); assert.notEqual(stored.token_hash, created.invitation.token);
  const results = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token: created.invitation.token, password } })));
  assert.deepEqual(results.map((item) => item.statusCode).sort(), [200, 410]);
  const member = await login(created.username); assert.equal(member.me.memberships[0].status, 'pending');
  assert.equal((await request(member, 'POST', '/auth/context', { organizationId: created.organizationId })).statusCode, 403);
  assert.equal((await request(owner, 'POST', `/admin/memberships/${created.membershipId}/access`, { status: 'active', reason: 'Habilitación sintética revisada', version: 1 })).statusCode, 200);
  assert.equal((await request(member, 'POST', '/auth/context', { organizationId: created.organizationId })).statusCode, 200);
});
test('cuenta existente acepta su nueva asignación sin cambiar la contraseña', async () => {
  const created = await newOrganization('Otra organización sintética', username('a'));
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token: created.invitation.token, password: 'CambioIndebido!2026' } })).statusCode, 401);
  assert.equal((await request(adminA, 'POST', '/invitations/accept', { token: created.invitation.token })).statusCode, 200);
  assert.equal((await login('a')).me.memberships.length, 2);
});
test('reintento concurrente de creación no duplica organización ni cuenta', async () => {
  const requestId = randomUUID();
  const body = { name: `Creación repetida ${runId}`, administratorName: 'Responsable sintético', username: username('reintento'), requestId };
  const responses = await Promise.all([request(owner, 'POST', '/admin/organizations', body), request(owner, 'POST', '/admin/organizations', body)]);
  assert.ok(responses.every((response) => response.statusCode === 201));
  assert.equal(responses[0].json().organizationId, responses[1].json().organizationId);
  const { rows: [count] } = await pool.query('SELECT count(*)::int total FROM organizations WHERE creation_key=$1', [requestId]);
  assert.equal(count.total, 1);
  const latest = responses.find((response) => response.json().reused)?.json();
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/inspect', payload: { token: latest.invitation.token } })).statusCode, 200);
});
test('enlaces vencidos y reemplazados se rechazan', async () => {
  const created = await newOrganization();
  await pool.query("UPDATE invitations SET expires_at=now()-interval '1 hour' WHERE token_hash=$1", [digest(created.invitation.token)]);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/inspect', payload: { token: created.invitation.token } })).statusCode, 410);
  const first = await request(owner, 'POST', `/admin/memberships/${created.membershipId}/invitation`);
  const second = await request(owner, 'POST', `/admin/memberships/${created.membershipId}/invitation`);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/inspect', payload: { token: first.json().token } })).statusCode, 410);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/inspect', payload: { token: second.json().token } })).statusCode, 200);
});
test('referencia de permiso cruzada entre organizaciones falla en PostgreSQL', async () => {
  await assert.rejects(pool.query("INSERT INTO access_grants(id,organization_id,membership_id,resource_type,resource_id) VALUES($1,$2,$3,'team',$4)", [randomUUID(), ids.b, ids.memberA, randomUUID()]), (error: unknown) => (error as { code: string }).code === '23503');
});
test('logo de organización: carga propia, acceso cruzado y lectura pública', async () => {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z8sAAAAASUVORK5CYII=', 'base64');
  const boundary = 'torneos-test-boundary';
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const uploaded = await app.inject({ method: 'POST', url: `/api/v1/organizations/${ids.a}/logo`, headers: { ...headers(adminA), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload }); assert.equal(uploaded.statusCode, 201, uploaded.body);
  const download = await request(adminA, 'GET', `/organizations/${ids.a}/logo`); assert.equal(download.statusCode, 200); assert.deepEqual(download.rawPayload, image);
  assert.equal((await request(adminB, 'GET', `/organizations/${ids.a}/logo`)).statusCode, 403);
  const fake = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n<script>no</script>\r\n--${boundary}--\r\n`);
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/organizations/${ids.a}/logo`, headers: { ...headers(adminA), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: fake })).statusCode, 400);
  const publicPath = `/api/v1/public/organizations/${ids.a}/logo`;
  const before = await app.inject(publicPath);
  if (before.statusCode === 404) {
    const tournament = await newTournament();
    assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${tournament.response.json().categoryId}/rules/publish`, { reason: 'Reglas sintéticas revisadas', expectedRevision: 1 })).statusCode, 200);
  }
  assert.deepEqual((await app.inject(publicPath)).rawPayload, image);
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.b}/logo`)).statusCode, 404);
  const ownerDownload = await request(owner, 'GET', `/organizations/${ids.a}/logo`);
  assert.equal(ownerDownload.statusCode, 200);
  assert.deepEqual(ownerDownload.rawPayload, image);
  const ownerUpload = await app.inject({ method: 'POST', url: `/api/v1/organizations/${ids.a}/logo`, headers: { ...headers(owner), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(ownerUpload.statusCode, 201, ownerUpload.body);
});

test('marca de organización: superadmin puede editarla sin heredar datos del torneo', async () => {
  const {rows:[current]}=await pool.query('SELECT name,version FROM organizations WHERE id=$1',[ids.a]);
  const changed=await request(owner,'PATCH',`/organizations/${ids.a}/branding`,{name:current.name,accent:'#165D46',version:current.version});
  assert.equal(changed.statusCode,200,changed.body);
  assert.equal(changed.json().accent,'#165D46');
  assert.equal((await request(adminB,'PATCH',`/organizations/${ids.a}/branding`,{name:current.name,accent:'#165D46',version:changed.json().version})).statusCode,403);
  assert.equal((await request(teamA,'PATCH',`/organizations/${ids.a}/branding`,{name:current.name,accent:'#165D46',version:changed.json().version})).statusCode,403);
});
test('T02: emblema de torneo privado hasta publicar y aislado por organización', async () => {
  const tournament = await newTournament();
  const { tournamentId, categoryId } = tournament.response.json();
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z8sAAAAASUVORK5CYII=', 'base64');
  const boundary = 'tournament-emblem-test';
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="copa.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const path = `/organizations/${ids.a}/tournaments/${tournamentId}/emblem`;
  const upload = (session: Session) => app.inject({ method: 'POST', url: `/api/v1${path}`, headers: { ...headers(session), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal((await upload(adminB)).statusCode, 403);
  assert.equal((await upload(teamA)).statusCode, 403);
  const saved = await upload(adminA);
  assert.equal(saved.statusCode, 201, saved.body);
  assert.equal((await request(adminA, 'GET', `/organizations/${ids.a}/tournaments`)).json().find((item: {id:string}) => item.id === tournamentId).has_emblem, true);
  assert.deepEqual((await request(adminA, 'GET', path)).rawPayload, image);
  assert.equal((await request(adminB, 'GET', path)).statusCode, 403);
  const publicPath = `/api/v1/public${path}`;
  assert.equal((await app.inject(publicPath)).statusCode, 404);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Reglas sintéticas revisadas', expectedRevision: 1 })).statusCode, 200);
  assert.deepEqual((await app.inject(publicPath)).rawPayload, image);
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.b}/tournaments/${tournamentId}/emblem`)).statusCode, 404);
});
test('T08: diseño del flyer guarda colores y tres logos con alcance de torneo', async () => {
  const tournament=await newTournament(),tournamentId=tournament.response.json().tournamentId;
  const path=`/organizations/${ids.a}/tournaments/${tournamentId}/flyer-settings`;
  assert.equal((await request(adminB,'GET',path)).statusCode,403);
  assert.equal((await request(teamA,'PATCH',path,{})).statusCode,403);
  const initial=await request(adminA,'GET',path);assert.equal(initial.statusCode,200,initial.body);assert.equal(initial.json().revision,0);
  const input={revision:0,template:'forest',size:'portrait',format:'png',primaryColor:'#122C3A',accentColor:'#D9F166'};
  assert.equal((await request(adminB,'PATCH',path,input)).statusCode,403);
  const saved=await request(adminA,'PATCH',path,input);assert.equal(saved.statusCode,200,saved.body);assert.equal(saved.json().revision,1);
  assert.equal((await request(adminA,'PATCH',path,input)).statusCode,409);
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z8sAAAAASUVORK5CYII=','base64');
  const boundary='flyer-brand-test';const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="marca.png"\r\nContent-Type: image/png\r\n\r\n`),image,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  for(const slot of ['cup','organizer','federation']){
    const url=`/api/v1${path}/logos/${slot}`,upload=(session:Session)=>app.inject({method:'POST',url,headers:{...headers(session),'content-type':`multipart/form-data; boundary=${boundary}`},payload});
    assert.equal((await upload(adminB)).statusCode,403);assert.equal((await upload(teamA)).statusCode,403);
    assert.equal((await upload(adminA)).statusCode,201);assert.deepEqual((await request(adminA,'GET',`${path}/logos/${slot}`)).rawPayload,image);
  }
  const current=(await request(adminA,'GET',path)).json();assert.ok(current.cup_logo_id&&current.organizer_logo_id&&current.federation_logo_id);
  assert.equal(current.primary_color,'#122C3A');assert.equal(current.accent_color,'#D9F166');assert.equal(current.revision,4);
  assert.equal((await request(adminA,'GET',`/organizations/${ids.b}/tournaments/${tournamentId}/flyer-settings`)).statusCode,403);
  const svg=renderFlyerSvg({kind:'match',sourceId:randomUUID(),title:'Próximo encuentro',kicker:'Copa',competition:'Edición',subline:'',footer:'',lines:[],note:null,orgAssetId:null,entryIds:[],scorerRegistrationIds:[],matchdayId:null,sourceRevision:null,approvalId:null,pageNo:1,totalPages:1,brand:{primaryColor:current.primary_color,accentColor:current.accent_color,cupAssetId:current.cup_logo_id,organizerAssetId:current.organizer_logo_id,federationAssetId:current.federation_logo_id}},'square','forest',{});
  assert.match(svg,/#122C3A/);assert.match(svg,/#D9F166/);assert.match(svg,/Generado por /);assert.match(svg,/alacancha\.top/);
});
test('recuperación: un uso y revocación de las sesiones anteriores', async () => {
  const before = await login('a', password, ids.a);
  const recovery = await request(owner, 'POST', `/admin/users/${ids.adminA}/recovery`, { reason: 'Recuperación de cuenta sintética' }); assert.equal(recovery.statusCode, 200, recovery.body);
  const token = recovery.json().token;
  const changed = await app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token, password: 'NuevaPrueba!2026' } }); assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await request(before, 'GET', '/auth/me')).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token, password: 'OtraPrueba!2026' } })).statusCode, 410);
  adminA = await login('a', 'NuevaPrueba!2026', ids.a);
  assert.equal(adminA.me.id, ids.adminA);
});
test('auditoría conserva motivos y no incluye contraseñas ni tokens en claro', async () => {
  const response = await request(owner, 'GET', '/admin/audit'); assert.equal(response.statusCode, 200);
  const serialized = response.body;
  assert.equal(serialized.includes(password), false); assert.equal(serialized.includes(owner.cookie.split('=')[1]), false);
  const { rows } = await pool.query("SELECT reason,before_data,after_data FROM audit_logs WHERE resource_id=$1 AND action='membership.access_changed'", [ids.memberB]);
  assert.ok(rows.some((row) => row.reason === 'Bloqueo sintético de B' && row.before_data.status === 'active' && row.after_data.status === 'blocked'));
});
test('limitación de intentos responde sin revelar si el usuario existe', async () => {
  for (let index = 0; index < 11; index++) {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', remoteAddress: '198.51.100.240', payload: { username: 'inexistente@ejemplo.test', password } });
    assert.equal(response.statusCode, index < 10 ? 401 : 429);
  }
});
test('migración repetible y seed rechazado fuera de las bases locales autorizadas', async () => {
  const { rows: [beforeCount] } = await pool.query('SELECT count(*)::int total FROM schema_migrations');
  await migrate(pool);
  const { rows: [count] } = await pool.query('SELECT count(*)::int total FROM schema_migrations'); assert.equal(count.total, beforeCount.total);
  await assert.rejects(seed(pool, 'postgresql://no:sinuso@127.0.0.1:55461/produccion'), /solo se permiten/);
});

const fiveRules: RuleConfig = { initialPhase: { mode: 'league', legs: 1, groupCount: null }, playersOnField: 5, minimumToStart: 4, minimumToContinue: 3, maxMatchRoster: 12, maxBenchPlayers: 7, maxBenchStaff: 3, lineupRoles: { goalkeeperRequired: false, captainRequired: false }, maxRegisteredPlayers: 25, substitutions: { mode: 'limited', maxChanges: 5, maxWindows: 3, reentry: false }, eligibility: { age: null, requiredDocuments: [] }, advanced: { tiebreakers: ['head_to_head_points', 'goal_difference', 'goals_for', 'wins', 'yellow_cards', 'manual_draw'], discipline: { yellowCards: true, redCards: true, secondYellowRed: false, yellowAccumulation: null, redReviewRequired: true }, walkover: { enabled: false, winnerGoals: null, loserGoals: null, winnerPoints: null, loserPoints: null } }, periods: [{ name: 'Primer tiempo', minutes: 20 }, { name: 'Segundo tiempo', minutes: 20 }], points: { win: 3, draw: 1, loss: 0 } };
async function newTournament(organizationId = ids.a, rules: RuleConfig = fiveRules, preset = 'F5') {
  const body = { requestId: randomUUID(), name: `Copa sintética ${randomUUID().slice(0, 6)}`, timezone: 'America/Asuncion', editionName: 'Temporada 2026', categoryName: 'Libre', preset, teamLimit: 16, rules };
  const response = await request(adminA, 'POST', `/organizations/${organizationId}/tournaments`, body);
  return { body, response };
}
test('presentación pública muestra equipos sin publicar reglamento ni fixture y respeta organización',async()=>{
  const created=await newTournament(ids.a,{...fiveRules,initialPhase:null,competitionPlan:null});
  assert.equal(created.response.statusCode,201,created.response.body);
  const {tournamentId,categoryId}=created.response.json();
  const path=`/organizations/${ids.a}/tournaments/${tournamentId}/public-preview`;
  const team=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Club de presentación ${runId}`,color:'#165D46',categoryId});
  assert.equal(team.statusCode,201,team.body);
  let publicPage=await app.inject({method:'GET',url:`/api/v1/public/organizations/${ids.a}/tournaments`});
  assert.equal(publicPage.json().tournaments.some((item:{id:string})=>item.id===tournamentId),false);
  assert.equal((await request(adminB,'PATCH',path,{publicVisible:true})).statusCode,403);
  assert.equal((await request(owner,'PATCH',path,{publicVisible:true})).statusCode,403);
  const shown=await request(adminA,'PATCH',path,{publicVisible:true});assert.equal(shown.statusCode,200,shown.body);
  assert.equal(shown.json().teamsPublished,1);
  publicPage=await app.inject({method:'GET',url:`/api/v1/public/organizations/${ids.a}/tournaments`});
  const preview=publicPage.json().tournaments.find((item:{id:string})=>item.id===tournamentId);
  assert.equal(preview.presentation_only,true);assert.equal(preview.rules,null);
  assert.equal(publicPage.json().teams.some((item:{id:string})=>item.id===team.json().teamId),true);
  const hidden=await request(adminA,'PATCH',path,{publicVisible:false});assert.equal(hidden.statusCode,200,hidden.body);
  publicPage=await app.inject({method:'GET',url:`/api/v1/public/organizations/${ids.a}/tournaments`});
  assert.equal(publicPage.json().tournaments.some((item:{id:string})=>item.id===tournamentId),false);
});
test('Pagos: tarifas por torneo, multa pendiente, cobro parcial, ingresos, salidas y ámbito',async()=>{
  const setup={requestId:randomUUID(),name:`Copa pagos ${runId}`,timezone:'America/Asuncion',editionName:'Temporada 2026',categoryName:'Libre',preset:'F5',teamLimit:8,rules:{...fiveRules,advanced:{...fiveRules.advanced!,discipline:{...fiveRules.advanced!.discipline,customCards:[{code:'azul',label:'Azul',color:'#2278C7',suspensionMatches:1}]}}},paymentRates:{yellowGuaranies:12000,redGuaranies:50000,customCardRates:{azul:18000}}};
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/tournaments`,{...setup,requestId:randomUUID(),paymentRates:{...setup.paymentRates,customCardRates:{desconocida:18000}}})).json().code,'CARD_UNKNOWN');
  const tournament=await request(adminA,'POST',`/organizations/${ids.a}/tournaments`,setup);assert.equal(tournament.statusCode,201,tournament.body);
  const {tournamentId,categoryId}=tournament.json();const root=`/organizations/${ids.a}/tournaments/${tournamentId}/payments`;
  assert.deepEqual((await request(adminA,'GET',root)).json().rates.customCardRates,{[`${categoryId}:azul`]:18000});
  const team=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Equipo pagos ${runId}`,color:'#165D46',categoryId});assert.equal(team.statusCode,201,team.body);
  const entryId=team.json().entryId;
  assert.equal((await request(adminB,'GET',root)).statusCode,403);
  assert.equal((await request(owner,'GET',root)).statusCode,403);
  assert.equal((await request(teamA,'GET',root)).statusCode,403);
  assert.equal((await request(teamA,'POST',root,{kind:'expense'})).statusCode,403);
  assert.equal((await request(adminA,'GET',root)).json().rates.redGuaranies,50000);
  const charge=await request(adminA,'POST',root,{kind:'charge',category:'fine_red',entryId,description:'Tarjeta roja',occurredOn:'2026-10-30'});assert.equal(charge.statusCode,201,charge.body);assert.equal(charge.json().amountGuaranies,50000);
  const other=await newTournament();assert.equal(other.response.statusCode,201);
  const wrongTeam=await request(adminA,'POST',`/organizations/${ids.a}/tournaments/${other.response.json().tournamentId}/payments`,{kind:'charge',category:'fine_red',entryId,description:'Equipo ajeno al torneo',occurredOn:'2026-10-30'});assert.equal(wrongTeam.statusCode,404);
  const pay=(amountGuaranies:number)=>request(adminA,'POST',root,{kind:'income',category:'fine_payment',linkedChargeId:charge.json().id,entryId,amountGuaranies,description:'Cobro de multa',occurredOn:'2026-10-30'});
  assert.equal((await pay(20000)).statusCode,201);assert.equal((await pay(40000)).statusCode,409);
  assert.equal((await request(adminA,'POST',root,{kind:'income',category:'tickets',entryId:null,amountGuaranies:10000,description:'Entradas primera fecha',occurredOn:'2026-10-30'})).statusCode,201);
  const expense=await request(adminA,'POST',root,{kind:'expense',category:'referee',entryId:null,amountGuaranies:15000,description:'Arbitraje primera fecha',occurredOn:'2026-10-30'});assert.equal(expense.statusCode,201,expense.body);
  const book=(await request(adminA,'GET',root)).json();assert.deepEqual(book.summary,{incomeGuaranies:30000,expenseGuaranies:15000,pendingGuaranies:30000});
  assert.equal((await request(adminA,'POST',`${root}/${charge.json().id}/void`,{reason:'Corrección de cargo'})).statusCode,409);
  assert.equal((await request(adminA,'POST',`${root}/${expense.json().id}/void`,{reason:'Pago duplicado'})).statusCode,200);
  assert.equal((await request(adminA,'GET',root)).json().summary.expenseGuaranies,0);
  const customCardRates={[`${categoryId}:azul`]:18000};
  assert.equal((await request(adminB,'POST',`${root}/rates`,{yellowGuaranies:15000,redGuaranies:60000,customCardRates})).statusCode,403);
  assert.equal((await request(adminA,'POST',`${root}/rates`,{yellowGuaranies:15000,redGuaranies:60000,customCardRates:{[`${randomUUID()}:azul`]:18000}})).json().code,'CARD_UNKNOWN');
  const changed=await request(adminA,'POST',`${root}/rates`,{yellowGuaranies:15000,redGuaranies:60000,customCardRates});assert.equal(changed.statusCode,200,changed.body);assert.equal(changed.json().version,2);
  assert.deepEqual((await request(adminA,'GET',root)).json().rates.customCardRates,customCardRates);
  assert.equal((await request(adminA,'GET',root)).json().entries.find((item:any)=>item.id===charge.json().id).amount_guaranies,50000);
  assert.equal((await request(adminB,'POST',`${root}/cards`,{categoryId,label:'Verde',color:'#168040',suspensionMatches:0,amountGuaranies:7000})).statusCode,403);
  assert.equal((await request(adminA,'POST',`${root}/cards`,{categoryId,label:'Verde',color:'#168040',suspensionMatches:0,amountGuaranies:7000})).json().code,'RULES_DRAFT');
  const published=await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/publish`,{expectedRevision:1,reason:'Reglamento inicial confirmado'});assert.equal(published.statusCode,200,published.body);
  const added=await request(adminA,'POST',`${root}/cards`,{categoryId,label:'Verde',color:'#168040',suspensionMatches:0,amountGuaranies:7000});assert.equal(added.statusCode,200,added.body);
  const key=`${categoryId}:${added.json().code}`;
  const cardBook=(await request(adminA,'GET',root)).json();assert.equal(cardBook.rates.customCardRates[key],7000);assert.equal(cardBook.cards.find((card:any)=>card.key===key)?.label,'Verde');
  assert.equal((await request(adminA,'POST',`${root}/cards`,{categoryId,label:'Verde',color:'#168040',suspensionMatches:0,amountGuaranies:7000})).json().code,'CARD_EXISTS');
  assert.equal((await request(adminA,'POST',`${root}/cards`,{categoryId:other.response.json().categoryId,label:'Naranja',color:'#ff8800',suspensionMatches:0,amountGuaranies:1})).statusCode,404);
});
test('T02: un administrador crea un borrador con reglas propias y otro tenant no lo consulta ni edita', async () => {
  const { body, response } = await newTournament();
  assert.equal(response.statusCode, 201, response.body);
  const id = response.json().tournamentId;
  const own = await request(adminA, 'GET', `/organizations/${ids.a}/tournaments/${id}`);
  assert.equal(own.statusCode, 200, own.body);
  assert.equal(own.json()[0].rules.playersOnField, 5);
  assert.equal(own.json()[0].rules.maxMatchRoster, 12);
  assert.equal(own.json()[0].rules.maxBenchStaff, 3);
  assert.equal(own.json()[0].status, 'draft');
  assert.equal((await request(adminB, 'GET', `/organizations/${ids.a}/tournaments/${id}`)).statusCode, 403);
  assert.equal((await request(teamA, 'POST', `/organizations/${ids.a}/tournaments`, { ...body, requestId: randomUUID() })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.b}/tournaments`, { ...body, requestId: randomUUID() })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/tournaments`, { ...body, requestId: randomUUID(), organization_id: ids.b })).statusCode, 400);
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.a}/tournaments`)).json().tournaments.some((item: { id: string }) => item.id === id), false);
});

test('T02: el preset es editable, reglas imposibles y zona horaria inválida se rechazan', async () => {
  const eleven: RuleConfig = { ...fiveRules, playersOnField: 11, minimumToStart: 7, minimumToContinue: 6, maxMatchRoster: 18, maxBenchPlayers: 7, maxRegisteredPlayers: 30 };
  const created = await newTournament(ids.a, eleven, 'F11');
  assert.equal(created.response.statusCode, 201, created.response.body);
  const impossible = await newTournament(ids.a, { ...fiveRules, maxMatchRoster: 6 });
  assert.equal(impossible.response.statusCode, 400);
  assert.equal((await newTournament(ids.a, { ...fiveRules, maxMatchRoster: 13 })).response.statusCode, 400);
  assert.equal((await newTournament(ids.a, { ...fiveRules, maxBenchStaff: 51 })).response.statusCode, 400);
  const invalidZone = await request(adminA, 'POST', `/organizations/${ids.a}/tournaments`, { ...created.body, requestId: randomUUID(), timezone: 'Zona/Inexistente' });
  assert.equal(invalidZone.statusCode, 400);
  const smallRoster = await newTournament(ids.a, { ...fiveRules, maxRegisteredPlayers: 9 });
  assert.equal(smallRoster.response.statusCode, 400);
});

test('T02: fase inicial configurable y versionada antes de publicar', async () => {
  const created = await newTournament(ids.a, { ...fiveRules, initialPhase: null });
  assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const path = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  assert.equal((await request(adminA, 'POST', path, { reason: 'Fase pendiente', expectedRevision: 1 })).json().code, 'INITIAL_PHASE_REQUIRED');
  assert.equal((await request(adminB, 'POST', path, { reason: 'Otro ámbito', expectedRevision: 1 })).statusCode, 403);
  assert.equal((await newTournament(ids.a, { ...fiveRules, initialPhase: { mode: 'league', legs: 2, groupCount: 2 } })).response.statusCode, 400);
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  const groups = { mode: 'groups' as const, legs: 2 as const, groupCount: 9 };
  const saved = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, initialPhase: groups }, expectedRevision: 1, reason: 'Primera fase de grupos' });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal((await request(adminA, 'POST', path, { reason: 'No caben grupos', expectedRevision: 2 })).json().code, 'GROUP_LIMIT');
  const valid = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, initialPhase: { ...groups, groupCount: 4 } }, expectedRevision: 2, reason: 'Cuatro grupos posibles' });
  assert.equal(valid.statusCode, 200, valid.body);
  assert.equal((await request(adminA, 'POST', path, { reason: 'Fase oficial', expectedRevision: 3 })).statusCode, 200);
  const publicRow = (await app.inject(`/api/v1/public/organizations/${ids.a}/tournaments`)).json().tournaments.find((item: { category_id: string }) => item.category_id === categoryId);
  assert.equal(publicRow.rules.initialPhase.mode, 'groups');
  assert.equal(publicRow.rules.initialPhase.groupCount, 4);
  const changed = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, initialPhase: { mode: 'knockout', legs: 1, groupCount: null } }, expectedRevision: 3, reason: 'Fase siguiente de prueba' });
  assert.equal(changed.statusCode, 200);
  const stillOfficial = (await app.inject(`/api/v1/public/organizations/${ids.a}/tournaments`)).json().tournaments.find((item: { category_id: string }) => item.category_id === categoryId);
  assert.equal(stillOfficial.rules.initialPhase.mode, 'groups');
});

test('T02: reintento de creación y reglamento publicado conserva versiones, permisos y portal', async () => {
  const created = await newTournament(); assert.equal(created.response.statusCode, 201);
  const id = created.response.json().tournamentId, categoryId = created.response.json().categoryId;
  const retry = await request(adminA, 'POST', `/organizations/${ids.a}/tournaments`, created.body);
  assert.equal(retry.statusCode, 200); assert.equal(retry.json().tournamentId, id);
  const changedPayload = await request(adminA, 'POST', `/organizations/${ids.a}/tournaments`, { ...created.body, name: 'Otro nombre' });
  assert.equal(changedPayload.statusCode, 409);
  const publicCatalogPath='/api/v1/public/tournaments';
  assert.equal((await app.inject(publicCatalogPath)).json().some((item:{id:string})=>item.id===id),false);
  assert.doesNotMatch((await app.inject('/sitemap.xml')).body,new RegExp(id));
  const pubPath = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  assert.equal((await request(adminB, 'POST', pubPath, { reason: 'Intento ajeno', expectedRevision: 1 })).statusCode, 403);
  assert.equal((await request(teamA, 'POST', pubPath, { reason: 'Intento de equipo', expectedRevision: 1 })).statusCode, 403);
  const first = await request(adminA, 'POST', pubPath, { reason: 'Reglamento inicial aprobado', expectedRevision: 1 });
  assert.equal(first.statusCode, 200, first.body); assert.equal(first.json().version, 1);
  const catalog=await app.inject(publicCatalogPath);assert.equal(catalog.statusCode,200);
  assert.deepEqual(catalog.json().find((item:{id:string})=>item.id===id)?.organization_id,ids.a);
  assert.match(catalog.json().find((item:{id:string})=>item.id===id)?.organization_slug||'',/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const searched=await app.inject(`${publicCatalogPath}?q=sintetica`);assert.equal(searched.statusCode,200);
  assert.equal(searched.json().some((item:{id:string})=>item.id===id),true);
  assert.equal((await app.inject(`${publicCatalogPath}?q=sin-coincidencia-${runId}`)).json().length,0);
  const withoutPublication=randomUUID();await pool.query("INSERT INTO organizations(id,name,status) VALUES($1,'Organización sin torneo público','active')",[withoutPublication]);
  const directory=await app.inject('/api/v1/public/organizations');assert.equal(directory.statusCode,200);
  const listed=directory.json().find((item:{id:string})=>item.id===ids.a);assert.ok(listed);
  assert.equal(typeof listed.tournament_count,'number');assert.equal('accent' in listed,false);
  assert.equal(listed.public_slug,catalog.json().find((item:{id:string})=>item.id===id)?.organization_slug);
  assert.equal(directory.json().some((item:{id:string})=>item.id===withoutPublication),false);
  const sitemap=(await app.inject('/sitemap.xml')).body;
  assert.match(sitemap,new RegExp(`${listed.public_slug}/${id}`));
  assert.doesNotMatch(sitemap,new RegExp(withoutPublication));
  assert.equal('rules' in catalog.json().find((item:{id:string})=>item.id===id),false);
  const publicPath = `/api/v1/public/organizations/${ids.a}/tournaments`;
  let publicRows = (await app.inject(publicPath)).json().tournaments;
  assert.equal(publicRows.find((item: { id: string }) => item.id === id).rules.playersOnField, 5);
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  const edited = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, playersOnField: 6, minimumToStart: 5, minimumToContinue: 4, maxMatchRoster: 13 }, expectedRevision: 1, reason: 'Ajuste de cupo sintético' });
  assert.equal(edited.statusCode, 200, edited.body); assert.equal(edited.json().version, 2);
  const revised = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, playersOnField: 6, minimumToStart: 5, minimumToContinue: 4, maxMatchRoster: 14, maxBenchPlayers: 8, maxBenchStaff: 5 }, expectedRevision: 1, reason: 'Ajuste del banco y cuerpo técnico' });
  assert.equal(revised.statusCode, 200, revised.body); assert.equal(revised.json().revision, 2);
  assert.equal((await request(adminA, 'POST', draftPath, { rules: fiveRules, expectedRevision: 1, reason: 'Versión antigua' })).statusCode, 409);
  publicRows = (await app.inject(publicPath)).json().tournaments;
  assert.equal(publicRows.find((item: { id: string }) => item.id === id).rule_version, 1);
  assert.equal(publicRows.find((item: { id: string }) => item.id === id).rules.maxBenchStaff, 3);
  assert.equal((await request(adminA, 'POST', pubPath, { reason: 'Revisión de cupo', expectedRevision: 2 })).statusCode, 200);
  publicRows = (await app.inject(publicPath)).json().tournaments;
  const latest = publicRows.find((item: { id: string }) => item.id === id);
  assert.equal(latest.rule_version, 2); assert.equal(latest.rules.playersOnField, 6); assert.equal(latest.rules.maxMatchRoster, 14); assert.equal(latest.rules.maxBenchStaff, 5);
  await assert.rejects(pool.query("UPDATE rule_versions SET rules='{}'::jsonb WHERE organization_id=$1 AND category_id=$2 AND version=1", [ids.a, categoryId]), /published rule versions are immutable/);
  const { rows: [old] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=1', [ids.a, categoryId]);
  assert.equal(old.rules.playersOnField, 5);
  assert.equal(old.rules.maxBenchStaff, 3);
});

test('T02: una regla histórica sin cupo técnico se lee sin modificar su versión publicada', async () => {
  const created = await newTournament(); assert.equal(created.response.statusCode, 201);
  const categoryId = created.response.json().categoryId;
  await pool.query("UPDATE rule_versions SET rules=rules-'maxBenchStaff' WHERE organization_id=$1 AND category_id=$2 AND status='draft'", [ids.a, categoryId]);
  const publication = await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Reglamento histórico de prueba', expectedRevision: 1 });
  assert.equal(publication.statusCode, 200, publication.body);
  const publicRows = (await app.inject(`/api/v1/public/organizations/${ids.a}/tournaments`)).json().tournaments;
  assert.equal(publicRows.find((item: { category_id: string }) => item.category_id === categoryId).rules.maxBenchStaff, 0);
  const { rows: [stored] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=1', [ids.a, categoryId]);
  assert.equal(Object.hasOwn(stored.rules, 'maxBenchStaff'), false);
});

test('T02: los cambios se eligen por categoría y v2 no reescribe el modo publicado', async () => {
  const created = await newTournament(ids.a, { ...fiveRules, substitutions: null });
  assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const tournamentId = created.response.json().tournamentId;
  const publicPath = `/api/v1/public/organizations/${ids.a}/tournaments`;
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  const publishPath = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  await pool.query("UPDATE rule_versions SET rules=rules-'substitutions' WHERE organization_id=$1 AND category_id=$2 AND status='draft'", [ids.a, categoryId]);
  const oldDraft = await request(adminA, 'GET', `/organizations/${ids.a}/tournaments/${tournamentId}`);
  assert.equal(oldDraft.json()[0].rules.substitutions, null);
  assert.equal((await request(adminB, 'POST', publishPath, { reason: 'Intento ajeno', expectedRevision: 1 })).statusCode, 403);
  assert.equal((await request(teamA, 'POST', draftPath, { rules: fiveRules, expectedRevision: 1, reason: 'Intento de equipo' })).statusCode, 403);
  const withoutMode = await request(adminA, 'POST', publishPath, { reason: 'Falta definir cambios', expectedRevision: 1 });
  assert.equal(withoutMode.statusCode, 400); assert.equal(withoutMode.json().code, 'SUBSTITUTIONS_REQUIRED');
  assert.equal((await newTournament(ids.a, { ...fiveRules, substitutions: { mode: 'limited', maxChanges: 0, maxWindows: null, reentry: false } })).response.statusCode, 400);
  assert.equal((await newTournament(ids.a, { ...fiveRules, substitutions: { mode: 'limited', maxChanges: 1, maxWindows: 2, reentry: false } })).response.statusCode, 400);
  assert.equal((await newTournament(ids.a, { ...fiveRules, substitutions: { mode: 'unlimited', maxChanges: 5, maxWindows: null, reentry: true } })).response.statusCode, 400);
  assert.equal((await newTournament(ids.a, { ...fiveRules, substitutions: { mode: 'none', maxChanges: 0, maxWindows: null, reentry: true } })).response.statusCode, 400);
  const noChanges: RuleConfig = { ...fiveRules, substitutions: { mode: 'none', maxChanges: 0, maxWindows: null, reentry: false } };
  const draft = await request(adminA, 'POST', draftPath, { rules: noChanges, expectedRevision: 1, reason: 'Categoría sin sustituciones' });
  assert.equal(draft.statusCode, 200, draft.body);
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Publicar sin sustituciones', expectedRevision: 2 })).statusCode, 200);
  let publicRows = (await app.inject(publicPath)).json().tournaments;
  assert.equal(publicRows.find((row: { category_id: string }) => row.category_id === categoryId).rules.substitutions.mode, 'none');
  const unlimited: RuleConfig = { ...fiveRules, substitutions: { mode: 'unlimited', maxChanges: null, maxWindows: 2, reentry: true } };
  const next = await request(adminA, 'POST', draftPath, { rules: unlimited, expectedRevision: 2, reason: 'Nueva modalidad de cambios' });
  assert.equal(next.statusCode, 200, next.body); assert.equal(next.json().version, 2);
  publicRows = (await app.inject(publicPath)).json().tournaments;
  assert.equal(publicRows.find((row: { category_id: string }) => row.category_id === categoryId).rules.substitutions.mode, 'none');
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Aprobar cambios ilimitados', expectedRevision: 1 })).statusCode, 200);
  publicRows = (await app.inject(publicPath)).json().tournaments;
  assert.deepEqual(publicRows.find((row: { category_id: string }) => row.category_id === categoryId).rules.substitutions, unlimited.substitutions);
  const { rows: [old] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=1', [ids.a, categoryId]);
  assert.equal(old.rules.substitutions.mode, 'none');
});

test('T02: elegibilidad histórica sin definir exige decisión antes de publicar', async () => {
  const created = await newTournament(ids.a, { ...fiveRules, eligibility: null });
  assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  await pool.query("UPDATE rule_versions SET rules=rules-'eligibility' WHERE organization_id=$1 AND category_id=$2 AND status='draft'", [ids.a, categoryId]);
  const own = await request(adminA, 'GET', `/organizations/${ids.a}/tournaments/${created.response.json().tournamentId}`);
  assert.equal(own.json()[0].rules.eligibility, null);
  const publishPath = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  assert.equal((await request(adminB, 'POST', publishPath, { reason: 'Intento ajeno', expectedRevision: 1 })).statusCode, 403);
  const blocked = await request(adminA, 'POST', publishPath, { reason: 'Requisito aún indefinido', expectedRevision: 1 });
  assert.equal(blocked.statusCode, 400); assert.equal(blocked.json().code, 'ELIGIBILITY_REQUIRED');
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  assert.equal((await request(teamA, 'POST', draftPath, { rules: fiveRules, expectedRevision: 1, reason: 'Intento de equipo' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', draftPath, { rules: fiveRules, expectedRevision: 1, reason: 'Sin límites adicionales' })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Elegibilidad revisada sin requisitos', expectedRevision: 2 })).statusCode, 200);
  const publicRows = (await app.inject(`/api/v1/public/organizations/${ids.a}/tournaments`)).json().tournaments;
  assert.deepEqual(publicRows.find((row: { category_id: string }) => row.category_id === categoryId).rules.eligibility, fiveRules.eligibility);
});

test('T02: edad, fecha y documentos configurables conservan v1 al preparar v2', async () => {
  const eligibility: NonNullable<RuleConfig['eligibility']> = { age: { minYears: 14, maxYears: 18, reference: 'fixed_date', fixedDate: '2026-12-31' }, requiredDocuments: ['Documento de identidad', 'Constancia de pase'] };
  const unfinishedAge = await newTournament(ids.a, { ...fiveRules, eligibility: { ...eligibility, age: { minYears: null, maxYears: null, reference: 'match_date', fixedDate: null } } });
  assert.equal(unfinishedAge.response.statusCode, 201);
  const unfinishedPublication = await request(adminA, 'POST', `/organizations/${ids.a}/categories/${unfinishedAge.response.json().categoryId}/rules/publish`, { reason: 'Edad incompleta', expectedRevision: 1 });
  assert.equal(unfinishedPublication.statusCode, 400); assert.equal(unfinishedPublication.json().code, 'AGE_LIMIT_REQUIRED');
  const noCutoff = await newTournament(ids.a, { ...fiveRules, eligibility: { ...eligibility, age: { ...eligibility.age!, fixedDate: null } } });
  assert.equal(noCutoff.response.statusCode, 201);
  const noCutoffPublication = await request(adminA, 'POST', `/organizations/${ids.a}/categories/${noCutoff.response.json().categoryId}/rules/publish`, { reason: 'Falta fecha de corte', expectedRevision: 1 });
  assert.equal(noCutoffPublication.statusCode, 400); assert.equal(noCutoffPublication.json().code, 'AGE_DATE_REQUIRED');
  const invalidAge = await newTournament(ids.a, { ...fiveRules, eligibility: { ...eligibility, age: { ...eligibility.age!, minYears: 19 } } });
  assert.equal(invalidAge.response.statusCode, 400);
  const invalidDate = await newTournament(ids.a, { ...fiveRules, eligibility: { ...eligibility, age: { ...eligibility.age!, fixedDate: '2026-02-29' } } });
  assert.equal(invalidDate.response.statusCode, 400);
  const duplicateDocuments = await newTournament(ids.a, { ...fiveRules, eligibility: { ...eligibility, requiredDocuments: ['Ficha', 'ficha'] } });
  assert.equal(duplicateDocuments.response.statusCode, 400);
  const created = await newTournament(ids.a, { ...fiveRules, eligibility });
  assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  const publishPath = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  const publicPath = `/api/v1/public/organizations/${ids.a}/tournaments`;
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Requisitos iniciales aprobados', expectedRevision: 1 })).statusCode, 200);
  const first = (await app.inject(publicPath)).json().tournaments.find((row: { category_id: string }) => row.category_id === categoryId);
  assert.deepEqual(first.rules.eligibility, eligibility);
  const revised: NonNullable<RuleConfig['eligibility']> = { age: { minYears: null, maxYears: 17, reference: 'match_date', fixedDate: null }, requiredDocuments: ['Documento de identidad'] };
  const next = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, eligibility: revised }, expectedRevision: 1, reason: 'Revisar edad y documentos' });
  assert.equal(next.statusCode, 200, next.body); assert.equal(next.json().version, 2);
  assert.deepEqual((await app.inject(publicPath)).json().tournaments.find((row: { category_id: string }) => row.category_id === categoryId).rules.eligibility, eligibility);
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Aprobar segunda versión', expectedRevision: 1 })).statusCode, 200);
  assert.deepEqual((await app.inject(publicPath)).json().tournaments.find((row: { category_id: string }) => row.category_id === categoryId).rules.eligibility, revised);
  const { rows: [old] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=1', [ids.a, categoryId]);
  assert.deepEqual(old.rules.eligibility, eligibility);
});

test('T02: criterios deportivos antiguos requieren revisión explícita y respetan el ámbito', async () => {
  const created = await newTournament(ids.a, { ...fiveRules, advanced: null });
  assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  await pool.query("UPDATE rule_versions SET rules=rules-'advanced' WHERE organization_id=$1 AND category_id=$2 AND status='draft'", [ids.a, categoryId]);
  const own = await request(adminA, 'GET', `/organizations/${ids.a}/tournaments/${created.response.json().tournamentId}`);
  assert.equal(own.json()[0].rules.advanced, null);
  const publishPath = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  assert.equal((await request(adminB, 'POST', publishPath, { reason: 'Intento ajeno', expectedRevision: 1 })).statusCode, 403);
  const blocked = await request(adminA, 'POST', publishPath, { reason: 'Sin revisión', expectedRevision: 1 });
  assert.equal(blocked.statusCode, 400); assert.equal(blocked.json().code, 'ADVANCED_RULES_REQUIRED');
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  assert.equal((await request(teamA, 'POST', draftPath, { rules: fiveRules, expectedRevision: 1, reason: 'Intento de equipo' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', draftPath, { rules: fiveRules, expectedRevision: 1, reason: 'Criterios revisados' })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Publicar criterios revisados', expectedRevision: 2 })).statusCode, 200);
});

test('T02: tarjetas, walkover y desempates se validan y v2 preserva v1', async () => {
  const advanced = fiveRules.advanced!;
  const invalidTie = await newTournament(ids.a, { ...fiveRules, advanced: { ...advanced, tiebreakers: ['manual_draw', 'goal_difference'] } });
  assert.equal(invalidTie.response.statusCode, 400);
  const repeatedTie = await newTournament(ids.a, { ...fiveRules, advanced: { ...advanced, tiebreakers: ['goals_for', 'goals_for'] } });
  assert.equal(repeatedTie.response.statusCode, 400);
  const badCards = await newTournament(ids.a, { ...fiveRules, advanced: { ...advanced, discipline: { ...advanced.discipline, yellowCards: false, yellowAccumulation: 3 } } });
  assert.equal(badCards.response.statusCode, 400);
  const badWalkover = await newTournament(ids.a, { ...fiveRules, advanced: { ...advanced, walkover: { enabled: true, winnerGoals: 0, loserGoals: 3, winnerPoints: null, loserPoints: null } } });
  assert.equal(badWalkover.response.statusCode, 400);
  const created = await newTournament(); assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const publishPath = `/organizations/${ids.a}/categories/${categoryId}/rules/publish`;
  const draftPath = `/organizations/${ids.a}/categories/${categoryId}/rules/draft`;
  const publicPath = `/api/v1/public/organizations/${ids.a}/tournaments`;
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Primera versión', expectedRevision: 1 })).statusCode, 200);
  const revised: NonNullable<RuleConfig['advanced']> = { tiebreakers: ['head_to_head_points', 'head_to_head_goal_difference', 'goal_difference', 'manual_draw'], discipline: { yellowCards: true, redCards: true, secondYellowRed: true, yellowAccumulation: 4, redReviewRequired: true }, walkover: { enabled: true, winnerGoals: 3, loserGoals: 0, winnerPoints: 3, loserPoints: 0 } };
  const next = await request(adminA, 'POST', draftPath, { rules: { ...fiveRules, advanced: revised }, expectedRevision: 1, reason: 'Cambiar criterios deportivos' });
  assert.equal(next.statusCode, 200, next.body); assert.equal(next.json().version, 2);
  assert.deepEqual((await app.inject(publicPath)).json().tournaments.find((row: { category_id: string }) => row.category_id === categoryId).rules.advanced, advanced);
  assert.equal((await request(adminA, 'POST', publishPath, { reason: 'Publicar nueva versión', expectedRevision: 1 })).statusCode, 200);
  assert.deepEqual((await app.inject(publicPath)).json().tournaments.find((row: { category_id: string }) => row.category_id === categoryId).rules.advanced, revised);
  const { rows: [old] } = await pool.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=1', [ids.a, categoryId]);
  assert.deepEqual(old.rules.advanced, advanced);
});

test('T02: desempate entre tres equipos usa mini tabla de todos y recalcula subempates', () => {
  const match = (homeTeamId: string, awayTeamId: string, homeGoals: number, awayGoals: number, status: RankedMatch['status'] = 'official'): RankedMatch => ({ homeTeamId, awayTeamId, homeGoals, awayGoals, status, homePoints: homeGoals > awayGoals ? 3 : homeGoals === awayGoals ? 1 : 0, awayPoints: awayGoals > homeGoals ? 3 : homeGoals === awayGoals ? 1 : 0, homeYellowCards: 0, awayYellowCards: 0, homeRedCards: 0, awayRedCards: 0 });
  const games = [match('A','B',1,0), match('B','C',3,0), match('C','A',2,0), match('A','B',8,0,'provisional')];
  const ranking = rankStandings(['A','B','C'], games, ['head_to_head_points','head_to_head_goal_difference','head_to_head_goals_for']);
  assert.deepEqual(ranking.groups.map((group) => group.teamIds), [['B'],['C'],['A']]);
  assert.deepEqual(ranking.totals.map((row) => row.points), [3,3,3]);
  assert.equal(ranking.totals.find((row) => row.teamId === 'A')?.goalsFor, 1);
});

test('T02: el orden elegido cambia el resultado; menos tarjetas gana y sorteo queda pendiente', () => {
  const games: RankedMatch[] = [
    { homeTeamId: 'A', awayTeamId: 'B', status: 'official', homeGoals: 1, awayGoals: 0, homePoints: 3, awayPoints: 0, homeYellowCards: 2, awayYellowCards: 0, homeRedCards: 0, awayRedCards: 0 },
    { homeTeamId: 'B', awayTeamId: 'C', status: 'official', homeGoals: 5, awayGoals: 0, homePoints: 3, awayPoints: 0, homeYellowCards: 0, awayYellowCards: 0, homeRedCards: 0, awayRedCards: 0 },
    { homeTeamId: 'C', awayTeamId: 'A', status: 'official', homeGoals: 1, awayGoals: 0, homePoints: 3, awayPoints: 0, homeYellowCards: 0, awayYellowCards: 0, homeRedCards: 0, awayRedCards: 0 },
  ];
  assert.deepEqual(rankStandings(['A','B','C'], games, ['head_to_head_points']).groups.map((group) => group.teamIds), [['A','B','C']]);
  assert.deepEqual(rankStandings(['A','B','C'], games, ['goals_for','head_to_head_points']).groups.map((group) => group.teamIds), [['B'],['C'],['A']]);
  const drawn: RankedMatch = { homeTeamId: 'A', awayTeamId: 'B', status: 'official', homeGoals: 0, awayGoals: 0, homePoints: 1, awayPoints: 1, homeYellowCards: 2, awayYellowCards: 1, homeRedCards: 0, awayRedCards: 0 };
  assert.deepEqual(rankStandings(['A','B'], [drawn], ['yellow_cards']).groups.map((group) => group.teamIds), [['B'],['A']]);
  assert.deepEqual(rankStandings(['A','B'], [drawn], ['manual_draw']).groups, [{ position: 1, teamIds: ['A','B'], unresolved: true }]);
});

test('T02: un equipo entra en dos categorías y su administrador ve solo asignaciones propias', async () => {
  const first = await newTournament(); const second = await newTournament();
  assert.equal(first.response.statusCode, 201); assert.equal(second.response.statusCode, 201);
  const categoryA = first.response.json().categoryId, categoryB = second.response.json().categoryId;
  const teamBody = { requestId: randomUUID(), name: `Club sintético ${randomUUID().slice(0, 6)}`, color: '#234F7D', categoryId: categoryA };
  const created = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, teamBody);
  assert.equal(created.statusCode, 201, created.body);
  const teamId = created.json().teamId, entryA = created.json().entryId;
  const retry = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, teamBody);
  assert.equal(retry.statusCode, 200); assert.equal(retry.json().teamId, teamId);
  const joined = await request(adminA, 'POST', `/organizations/${ids.a}/teams/${teamId}/entries`, { categoryId: categoryB });
  assert.equal(joined.statusCode, 201, joined.body);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/teams/${teamId}/entries`, { categoryId: categoryB })).statusCode, 200);
  assert.equal((await request(adminB, 'GET', `/organizations/${ids.a}/teams/${teamId}`)).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.b}/teams`, { ...teamBody, requestId: randomUUID() })).statusCode, 403);
  const assigned = await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entryA}/administrators`, { name: 'Cuenta equipo sintética', username: username('equipo') });
  assert.equal(assigned.statusCode, 201, assigned.body); assert.equal(assigned.json().invitation, null);
  const own = await request(teamA, 'GET', `/organizations/${ids.a}/teams/${teamId}`);
  assert.equal(own.statusCode, 200); assert.equal(own.json().length, 1); assert.equal(own.json()[0].entry_id, entryA);
  const otherEntry = joined.json().entryId;
  assert.equal((await request(teamA, 'POST', `/organizations/${ids.a}/entries/${otherEntry}/commission`, { name: 'Persona ajena', role: 'Presidencia' })).statusCode, 403);
  const proposed = await request(teamA, 'POST', `/organizations/${ids.a}/entries/${entryA}/commission`, { name: 'Comisionista sintético', role: 'Presidencia' });
  assert.equal(proposed.statusCode, 201, proposed.body);
  assert.equal((await request(teamA, 'POST', `/organizations/${ids.a}/commission/${proposed.json().id}/confirm`, { reason: 'Intento de autoconfirmación' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/commission/${proposed.json().id}/confirm`, { reason: 'Comisión revisada' })).statusCode, 200);
  const detail = await request(adminA, 'GET', `/organizations/${ids.a}/teams/${teamId}`);
  assert.equal(detail.json().find((row: { entry_id: string }) => row.entry_id === entryA).commission[0].status, 'confirmed');
  await assert.rejects(pool.query('INSERT INTO team_entries(id,organization_id,team_id,category_id) VALUES($1,$2,$3,$4)', [randomUUID(), ids.b, teamId, categoryB]), (error: unknown) => (error as { code: string }).code === '23503');
});

test('T07-01: bandeja limitada al equipo y a la organización, con tareas resolubles', async () => {
  const created = await newTournament(); assert.equal(created.response.statusCode, 201);
  const categoryId = created.response.json().categoryId;
  const ownTeam = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Bandeja propia ${runId}`, color: '#165D46', categoryId });
  const otherTeam = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Bandeja ajena ${runId}`, color: '#165D46', categoryId });
  assert.equal(ownTeam.statusCode, 201, ownTeam.body); assert.equal(otherTeam.statusCode, 201, otherTeam.body);
  const ownEntry = ownTeam.json().entryId, otherEntry = otherTeam.json().entryId;
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/entries/${ownEntry}/administrators`, { name: 'Cuenta equipo sintética', username: username('equipo') })).statusCode, 201);
  const ownProposal = await request(teamA, 'POST', `/organizations/${ids.a}/entries/${ownEntry}/commission`, { name: 'Responsable sintético', role: 'Secretaría', validFrom: '2026-10-01', validUntil: '2027-09-30' });
  const otherProposal = await request(adminA, 'POST', `/organizations/${ids.a}/entries/${otherEntry}/commission`, { name: 'Responsable ajeno', role: 'Presidencia' });
  assert.equal(otherProposal.statusCode,201,otherProposal.body);assert.equal(otherProposal.json().status,'confirmed');
  assert.equal(ownProposal.statusCode, 201, ownProposal.body); assert.equal(otherProposal.statusCode, 201, otherProposal.body);
  const unassignedId=randomUUID();
  await pool.query('INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)',[unassignedId,username('secretaria'),'Secretaría sintética',await hashPassword(password)]);
  await pool.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'team_admin','active')",[randomUUID(),ids.a,unassignedId]);
  const unassigned=await login('secretaria',password,ids.a);
  assert.equal((await request(unassigned,'GET',`/organizations/${ids.a}/teams/${ownTeam.json().teamId}`)).statusCode,403);
  const player=await request(teamA,'POST',`/organizations/${ids.a}/entries/${ownEntry}/players`,{givenNames:'Lista',familyNames:'De Prueba',documentKind:'ci',documentNumber:`${runId}77001`,birthDate:'2000-01-01',registrationNumber:'T07-1',origin:{kind:'unknown'}});
  assert.equal(player.statusCode,201,player.body);
  const listPath=`/organizations/${ids.a}/entries/${ownEntry}/good-faith`;
  const firstList=await request(teamA,'POST',`${listPath}/submit`,{registrationIds:[player.json().id],expectedVersion:0,reason:'Presentación inicial del equipo'});
  assert.equal(firstList.statusCode,201,firstList.body);
  const path = `/organizations/${ids.a}/review-inbox`;
  const organizerInbox = await request(adminA, 'GET', path); assert.equal(organizerInbox.statusCode, 200, organizerInbox.body);
  const organizerTask = organizerInbox.json().items.find((item: {id:string}) => item.id===ownProposal.json().id);
  assert.equal(organizerTask.kind, 'commission'); assert.equal(organizerTask.owner, 'organizer'); assert.equal(organizerTask.due_at, null);
  assert.equal(organizerInbox.json().items.some((item:{kind:string;entry_id:string})=>item.kind==='good_faith'&&item.entry_id===ownEntry),true);
  const laterPage=await request(adminA,'GET',`${path}?offset=1`);assert.equal(laterPage.statusCode,200);assert.notEqual(laterPage.json().items[0].id,organizerInbox.json().items[0].id);
  const teamInbox = await request(teamA, 'GET', path); assert.equal(teamInbox.statusCode, 200, teamInbox.body);
  assert.equal(teamInbox.json().items.some((item: {id:string}) => item.id===otherProposal.json().id), false);
  assert.equal(teamInbox.json().items.some((item: {id:string}) => item.id===ownProposal.json().id), false);
  assert.equal((await request(adminA,'POST',`${listPath}/review`,{version:1,decision:'observed',reason:'Corregir la presentación inicial'})).statusCode,200);
  const observedInbox=await request(teamA,'GET',path);assert.equal(observedInbox.statusCode,200);
  assert.equal(observedInbox.json().items.some((item:{kind:string;state:string})=>item.kind==='good_faith'&&item.state==='observed'),true);
  assert.equal((await request(teamA,'POST',`${listPath}/submit`,{registrationIds:[player.json().id],expectedVersion:1,reason:'Presentación corregida del equipo'})).statusCode,201);
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/publish`,{reason:'Reglas revisadas para la lista',expectedRevision:1})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${listPath}/review`,{version:2,decision:'approved',reason:'Nómina corregida y verificada'})).statusCode,200);
  const approvedExport=`/organizations/${ids.a}/entries/${ownEntry}/exports/good-faith/list/2`;
  assert.equal((await request(teamA,'GET',`${approvedExport}/pdf`)).statusCode,200);
  assert.equal((await request(teamA,'GET',`${approvedExport}/csv`)).statusCode,200);
  assert.equal((await request(teamA,'GET',`/organizations/${ids.a}/entries/${ownEntry}/exports/good-faith/list/1/pdf`)).statusCode,404);
  assert.equal((await request(unassigned,'GET',`${approvedExport}/pdf`)).statusCode,403);
  assert.equal((await request(adminB, 'GET', path)).statusCode, 403);
  assert.equal((await app.inject(`/api/v1${path}`)).statusCode, 401);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/commission/${ownProposal.json().id}/confirm`, { reason: 'Comisión comprobada' })).statusCode, 200);
  const detail = await request(teamA, 'GET', `/organizations/${ids.a}/teams/${ownTeam.json().teamId}`);
  assert.equal(detail.statusCode, 200); assert.equal(detail.json()[0].commission.find((item: {id:string}) => item.id===ownProposal.json().id).valid_until, '2027-09-30');
  assert.equal((await request(teamA, 'POST', `/organizations/${ids.a}/commission/${ownProposal.json().id}/end`, { reason: 'Intento de equipo' })).statusCode, 403);
  assert.equal((await request(adminB, 'POST', `/organizations/${ids.a}/commission/${ownProposal.json().id}/end`, { reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/commission/${ownProposal.json().id}/end`, { reason: 'Mandato finalizado' })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/commission/${ownProposal.json().id}/end`, { reason: 'Reintento con motivo' })).json().reused, true);
  const refreshed = await request(adminA, 'GET', path); assert.equal(refreshed.statusCode, 200);
  assert.equal(refreshed.json().items.some((item: {id:string}) => item.id===ownProposal.json().id), false);
});

test('T02: un administrador de equipo nuevo recibe invitación, luego acceso a su equipo', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201);
  const categoryId = tournament.response.json().categoryId;
  const create = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Barrio sintético ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId });
  assert.equal(create.statusCode, 201, create.body);
  const teamId = create.json().teamId, entryId = create.json().entryId;
  const account = username(`nuevo-equipo-${randomUUID().slice(0, 5)}`);
  const assigned = await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entryId}/administrators`, { name: 'Responsable sintético', username: account });
  assert.equal(assigned.statusCode, 201, assigned.body);
  assert.ok(assigned.json().invitation.token);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token: assigned.json().invitation.token, password } })).statusCode, 200);
  const admin = await login(account, password, ids.a);
  assert.equal(admin.me.memberships[0].role, 'team_admin');
  assert.equal((await request(admin, 'GET', `/organizations/${ids.a}/teams/${teamId}`)).statusCode, 200);
  assert.equal((await request(admin, 'GET', `/organizations/${ids.b}/teams`)).statusCode, 403);
  assert.equal((await request(admin, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: 'No autorizado', color: '#165D46', categoryId })).statusCode, 403);
});

test('T02: el organizador puede corregir el nombre de un equipo sin abrir acceso ajeno', async () => {
  const tournament = await newTournament();
  const categoryId = tournament.response.json().categoryId;
  const created = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Nombre provisional ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId });
  assert.equal(created.statusCode, 201, created.body);
  const teamId = created.json().teamId, path = `/organizations/${ids.a}/teams/${teamId}`;
  const name = `Nombre confirmado ${randomUUID().slice(0, 6)}`;
  assert.equal((await request(adminB, 'PATCH', path, { name })).statusCode, 403);
  assert.equal((await request(teamA, 'PATCH', path, { name })).statusCode, 403);
  assert.equal((await request(adminA, 'PATCH', `/organizations/${ids.b}/teams/${teamId}`, { name })).statusCode, 403);
  assert.equal((await request(adminA, 'PATCH', path, { name: ' ' })).statusCode, 400);
  const renamed = await request(adminA, 'PATCH', path, { name });
  assert.equal(renamed.statusCode, 200, renamed.body);
  assert.equal(renamed.json().name, name);
  assert.equal((await request(adminA, 'GET', path)).json()[0].name, name);
  assert.equal((await request(adminA, 'PATCH', path, { name })).json().reused, true);
  const otherName = `Otro ${randomUUID().slice(0, 6)}`;
  const other = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: otherName, color: '#165D46', categoryId });
  assert.equal(other.statusCode, 201, other.body);
  const conflict = await request(adminA, 'PATCH', path, { name: otherName });
  assert.equal(conflict.statusCode, 409);
});

test('T04: plan privado por posiciones conserva Fechas/Jornadas y resuelve el sorteo sin crear partidos', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201, tournament.response.body);
  const categoryId = tournament.response.json().categoryId;
  const base = `/organizations/${ids.a}/categories/${categoryId}/fixture/blueprint`;
  const first = await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Fariña ${randomUUID().slice(0,6)}`,color:'#123456',categoryId});
  const second = await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Barrio ${randomUUID().slice(0,6)}`,color:'#654321',categoryId});
  assert.equal(first.statusCode,201,first.body); assert.equal(second.statusCode,201,second.body);
  assert.equal((await request(adminB,'GET',base)).statusCode,403);
  assert.equal((await request(teamA,'POST',base,fcfsPositionPlan)).statusCode,403);
  const created=await request(adminA,'POST',base,fcfsPositionPlan);assert.equal(created.statusCode,201,created.body);
  assert.equal((await request(adminA,'POST',base,fcfsPositionPlan)).statusCode,200);
  let plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.games.length,35);assert.equal(plan.slots.length,10);
  assert.deepEqual(plan.games.filter((game:{sporting_round:string;jornada_no:number|null})=>game.sporting_round==='F1').map((game:{jornada_no:number|null})=>game.jornada_no),[null,null,null,null,null]);
  assert.deepEqual(plan.games.filter((game:{jornada_no:number;sporting_round:string})=>game.jornada_no===4).map((game:{sporting_round:string})=>game.sporting_round),['F2','F2','F3']);
  assert.deepEqual(plan.games.filter((game:{jornada_no:number;sporting_round:string})=>game.jornada_no===6).map((game:{sporting_round:string})=>game.sporting_round),['F3','F4','F4']);
  const firstEntry=first.json().entryId,secondEntry=second.json().entryId;
  assert.equal((await request(adminB,'PATCH',`${base}/slots/A1`,{entryId:firstEntry})).statusCode,403);
  assert.equal((await request(teamA,'PATCH',`${base}/slots/A1`,{entryId:firstEntry})).statusCode,403);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:firstEntry})).statusCode,200);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/B1`,{entryId:secondEntry})).statusCode,200);
  const swap=await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:secondEntry});assert.equal(swap.statusCode,200,swap.body);
  assert.equal(swap.json().swappedWith,'B1');
  plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.slots.find((slot:{slot_code:string})=>slot.slot_code==='A1').entry_id,secondEntry);
  assert.equal(plan.slots.find((slot:{slot_code:string})=>slot.slot_code==='B1').entry_id,firstEntry);
  const replacement=await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:firstEntry});assert.equal(replacement.statusCode,200,replacement.body);
  plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.slots.find((slot:{slot_code:string})=>slot.slot_code==='A1').entry_id,firstEntry);
  assert.equal(plan.slots.find((slot:{slot_code:string})=>slot.slot_code==='B1').entry_id,secondEntry);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/B1`,{entryId:null})).statusCode,200);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:secondEntry})).statusCode,200);
  plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.slots.find((slot:{slot_code:string})=>slot.slot_code==='A1').entry_id,secondEntry);
  assert.equal(plan.slots.find((slot:{slot_code:string})=>slot.slot_code==='B1').entry_id,null);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:null})).statusCode,200);
  const opening=await request(adminA,'PATCH',`${base}/opening`,{firstJornadaCodes:['G01','G02']});assert.equal(opening.statusCode,200,opening.body);
  plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.games.filter((game:{sporting_round:string;jornada_no:number})=>game.sporting_round==='F1'&&game.jornada_no===1).length,2);
  assert.equal(plan.games.filter((game:{sporting_round:string;jornada_no:number})=>game.sporting_round==='F1'&&game.jornada_no===2).length,3);
  assert.equal((await request(adminA,'PATCH',`${base}/opening`,{firstJornadaCodes:[]})).statusCode,200);
  plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.games.filter((game:{sporting_round:string;jornada_no:number|null})=>game.sporting_round==='F1'&&game.jornada_no===null).length,5);
  assert.equal((await request(adminA,'PATCH',`${base}/opening`,{firstJornadaCodes:['G01','G01']})).statusCode,400);
  const {rows:[count]}=await pool.query('SELECT count(*)::int total FROM draft_matches WHERE organization_id=$1 AND category_id=$2',[ids.a,categoryId]);
  assert.equal(count.total,0);
});

test('T04/T08: el plan parcial se publica sin resultados ni asignaciones inventadas', async () => {
  const tournament=await newTournament(ids.a,{...fiveRules,points:{win:2,draw:1,loss:0},initialPhase:null,competitionPlan:null});
  const {categoryId,tournamentId}=tournament.response.json();
  const publicSlug=`copa-${randomUUID().replaceAll('-','').slice(0,12)}`;
  const slugPath=`/organizations/${ids.a}/tournaments/${tournamentId}/public-slug`;
  assert.equal((await request(adminB,'PATCH',slugPath,{slug:publicSlug})).statusCode,403);
  assert.equal((await request(teamA,'PATCH',slugPath,{slug:publicSlug})).statusCode,403);
  assert.equal((await request(adminA,'PATCH',slugPath,{slug:publicSlug})).statusCode,200);
  const base=`/organizations/${ids.a}/categories/${categoryId}/fixture/blueprint`;
  assert.equal((await request(adminA,'POST',base,fcfsPositionPlan)).statusCode,201);
  const entries:string[]=[];
  for(let index=0;index<10;index++){
    const created=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Equipo plan ${index+1} ${randomUUID().slice(0,5)}`,color:'#123456',categoryId});
    assert.equal(created.statusCode,201,created.body);
    entries.push(created.json().entryId);
  }
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:entries[0]})).statusCode,200);
  const plan=(await request(adminA,'GET',base)).json();
  assert.equal((await request(adminB,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).statusCode,403);
  assert.equal((await request(teamA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).statusCode,403);
  assert.equal((await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).statusCode,200);
  const alias=(await app.inject(`/api/v1/public/tournaments/by-slug/${publicSlug}`));
  assert.equal(alias.statusCode,200,alias.body);assert.equal(alias.json().id,tournamentId);
  assert.equal((await app.inject(`/api/v1/public/tournaments/by-slug/absent-${publicSlug}`)).statusCode,404);
  const resolved=(await app.inject(`/api/v1/public/resolve/${publicSlug}`));
  assert.equal(resolved.statusCode,200,resolved.body);
  assert.deepEqual(resolved.json(),{kind:'tournament',tournament_id:tournamentId,organization_id:ids.a});
  assert.equal((await app.inject(`/api/v1/public/resolve/absent-${publicSlug}`)).statusCode,404);
  const publicOrganization=(await app.inject('/api/v1/public/organizations')).json().find((item:{id:string})=>item.id===ids.a);
  const resolvedOrganization=await app.inject(`/api/v1/public/resolve/${publicOrganization.public_slug}`);
  assert.equal(resolvedOrganization.statusCode,200,resolvedOrganization.body);
  assert.equal(resolvedOrganization.json().kind,'organization');
  assert.equal(resolvedOrganization.json().organization_id,ids.a);
  const publicPath=`/api/v1/public/organizations/${ids.a}/draws`;
  const snapshot=(await app.inject({method:'GET',url:publicPath})).json().find((row:{tournament_id:string})=>row.tournament_id===tournamentId).snapshot;
  assert.equal(snapshot.slots.length,10);
  assert.equal(snapshot.slots.filter((slot:{entry_id:string|null})=>slot.entry_id).length,1);
  assert.equal(snapshot.teams.length,10);
  assert.equal(snapshot.games.length,35);
  assert.equal(snapshot.games.filter((game:{jornada_no:number|null})=>game.jornada_no===null).length,5);
  assert.equal((await app.inject({method:'GET',url:`${publicPath}/${categoryId}/competition`})).json().available,false);
  assert.equal((await app.inject({method:'GET',url:`/api/v1/public/organizations/${ids.b}/draws`})).json().some((row:{tournament_id:string})=>row.tournament_id===tournamentId),false);
});

test('T04/T08: el sorteo completo se publica por versión y queda visible sin sesión', async () => {
  const specialRules={...fiveRules,points:{win:2,draw:1,loss:0},initialPhase:null,competitionPlan:null};
  const tournament=await newTournament(ids.a,specialRules);
  const {categoryId,tournamentId}=tournament.response.json();
  const base=`/organizations/${ids.a}/categories/${categoryId}/fixture/blueprint`;
  const publicPath=`/api/v1/public/organizations/${ids.a}/draws`;
  assert.equal((await request(adminA,'POST',base,fcfsPositionPlan)).statusCode,201);
  const locked=await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/draft`,{expectedRevision:1,reason:'Intento de cambiar el formato',rules:fiveRules});
  assert.equal(locked.statusCode,409);assert.equal(locked.json().code,'FORMAT_LOCKED');
  const edited=await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/draft`,{expectedRevision:1,reason:'Actualizar cupos',rules:{...specialRules,maxBenchPlayers:6,maxMatchRoster:11}});
  assert.equal(edited.statusCode,200,edited.body);
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/publish`,{expectedRevision:2,reason:'Faltó confirmar puntuación'})).json().code,'FORMAT_CONFIRMATION_REQUIRED');
  assert.equal((await request(adminB,'POST',`${base}/publish-draw`,{expectedRevision:1})).statusCode,403);
  assert.equal((await request(teamA,'POST',`${base}/publish-draw`,{expectedRevision:1})).statusCode,403);
  assert.equal((await app.inject({method:'GET',url:publicPath})).json().some((row:{tournament_id:string})=>row.tournament_id===tournamentId),false);
  const entryIds:string[]=[];
  for(let index=0;index<10;index++){
    const created=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Club sorteo ${index+1} ${randomUUID().slice(0,5)}`,color:'#123456',categoryId});
    assert.equal(created.statusCode,201,created.body);
    entryIds.push(created.json().entryId);
    const slot=`${index<5?'A':'B'}${index%5+1}`;
    assert.equal((await request(adminA,'PATCH',`${base}/slots/${slot}`,{entryId:entryIds[index]})).statusCode,200);
  }
  let plan=(await request(adminA,'GET',base)).json();
  assert.equal((await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:1})).statusCode,409);
  const published=await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision});
  assert.equal(published.statusCode,200,published.body);
  assert.equal((await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).json().reused,true);
  let draws=(await app.inject({method:'GET',url:publicPath})).json();
  const first=draws.find((row:{tournament_id:string})=>row.tournament_id===tournamentId);
  assert.equal(first.snapshot.slots.length,10);
  assert.equal(first.snapshot.games.length,35);
  assert.equal(first.snapshot.slots[0].entry_id,entryIds[0]);
  assert.equal(first.snapshot.games.filter((game:{sporting_round:string;jornada_no:number|null})=>game.sporting_round==='F1'&&game.jornada_no===null).length,5);
  assert.ok((await app.inject({method:'GET',url:'/api/v1/public/organizations'})).json().some((row:{id:string})=>row.id===ids.a));
  assert.ok((await app.inject({method:'GET',url:`/api/v1/public/tournaments?q=${encodeURIComponent(tournament.body.name)}`})).json().some((row:{id:string})=>row.id===tournamentId));
  assert.equal((await app.inject({method:'GET',url:'/api/v1/public/organizations/'+ids.b+'/draws'})).json().some((row:{tournament_id:string})=>row.tournament_id===tournamentId),false);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:entryIds[1]})).statusCode,200);
  draws=(await app.inject({method:'GET',url:publicPath})).json();
  assert.equal(draws.find((row:{tournament_id:string})=>row.tournament_id===tournamentId).snapshot.slots[0].entry_id,entryIds[0]);
  plan=(await request(adminA,'GET',base)).json();
  assert.equal(plan.blueprint.published_revision,first.revision);
  assert.equal((await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).statusCode,200);
  draws=(await app.inject({method:'GET',url:publicPath})).json();
  assert.equal(draws.find((row:{tournament_id:string})=>row.tournament_id===tournamentId).snapshot.slots[0].entry_id,entryIds[1]);
  assert.equal((await request(adminA,'PATCH',`${base}/opening`,{firstJornadaCodes:['G01','G02']})).statusCode,200);
  draws=(await app.inject({method:'GET',url:publicPath})).json();
  assert.equal(draws.find((row:{tournament_id:string})=>row.tournament_id===tournamentId).snapshot.games.filter((game:{sporting_round:string;jornada_no:number|null})=>game.sporting_round==='F1'&&game.jornada_no===null).length,5);
  plan=(await request(adminA,'GET',base)).json();
  assert.equal((await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).statusCode,200);
  draws=(await app.inject({method:'GET',url:publicPath})).json();
  assert.equal(draws.find((row:{tournament_id:string})=>row.tournament_id===tournamentId).snapshot.games.filter((game:{sporting_round:string;jornada_no:number|null})=>game.sporting_round==='F1'&&game.jornada_no===1).length,2);
  assert.equal((await request(adminB,'POST',`${base}/sync`,{})).statusCode,403);
  assert.equal((await request(teamA,'POST',`${base}/sync`,{})).statusCode,403);
  const confirmed=await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/publish`,{expectedRevision:2,reason:'Puntos y desempates revisados',fixedFormatConfirmed:true});
  assert.equal(confirmed.statusCode,200,confirmed.body);
  const sync=await request(adminA,'POST',`${base}/sync`,{});
  assert.equal(sync.statusCode,200,sync.body);
  assert.equal(sync.json().created,25);
  assert.equal((await request(adminA,'POST',`${base}/sync`,{})).json().created,0);
  const competition=await request(adminA,'GET',`${base}/competition`);
  assert.equal(competition.statusCode,200,competition.body);
  assert.equal(competition.json().preparedMatches,25);
  assert.equal(competition.json().competition.groupA.totals.length,5);
  assert.equal(competition.json().competition.groupB.totals.length,5);
  assert.deepEqual(competition.json().competition.groupA.totals.map((row:{points:number})=>row.points),[0,0,0,0,0]);
  assert.equal(competition.json().competition.blocked,'group_results');
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:entryIds[0]})).json().code,'POSITION_MATCHES_ACTIVE');
  assert.equal((await app.inject({method:'GET',url:`${publicPath}/${categoryId}/competition`})).json().available,true);
  const entrySlot=new Map<string,string>(plan.slots.map((slot:{slot_code:string;entry_id:string})=>[slot.slot_code,slot.entry_id]));
  const createSyntheticActa=async(code:string,homeGoals:number,awayGoals:number,homePenalties=0,awayPenalties=0)=>{
    const {rows:[match]}=await pool.query(`SELECT m.id,m.home_entry_id,m.away_entry_id FROM draft_matches m JOIN fixture_position_games g ON g.organization_id=m.organization_id AND g.id=m.position_game_id
      WHERE m.organization_id=$1 AND m.category_id=$2 AND g.code=$3`,[ids.a,categoryId,code]);
    assert.ok(match,`Falta el partido ${code}`);
    const events:MatchJournalEvent[]=[];
    for(const [team,count,kind] of [[match.home_entry_id,homeGoals,'goal'],[match.away_entry_id,awayGoals,'goal'],[match.home_entry_id,homePenalties,'shootout_goal'],[match.away_entry_id,awayPenalties,'shootout_goal']] as const)
      for(let index=0;index<count;index++)events.push({id:randomUUID(),sequence:events.length+1,kind,teamEntryId:team,registrationId:null,relatedRegistrationId:null,incidentNote:null,cardCode:null,windowNo:null,period:kind==='goal'?'PT':null,minute:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()});
    assert.deepEqual(projectMatchJournal(events,match.home_entry_id,match.away_entry_id).score,{home:homeGoals,away:awayGoals});
    const recordId=randomUUID(),snapshotId=randomUUID();
    await pool.query("INSERT INTO match_records(id,organization_id,match_id,status,rule_version,revision,started_by) VALUES($1,$2,$3,'official',1,$4,$5)",[recordId,ids.a,match.id,events.length,ids.adminA]);
    await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,1,'approved',$4,$5,$6,$7)",[snapshotId,ids.a,match.id,events.length,JSON.stringify({score:{home:homeGoals,away:awayGoals},shootout:{home:homePenalties,away:awayPenalties},events}),`Acta sintética ${code}`,ids.adminA]);
    await pool.query('UPDATE match_records SET approval_id=$3 WHERE organization_id=$1 AND match_id=$2',[ids.a,match.id,snapshotId]);
  };
  for(const game of fcfsPositionPlan.games.filter(game=>game.stage==='groups')){
    const home=Number(game.homeRef.slice(1)),away=Number(game.awayRef.slice(1));
    const homeGoals=game.homeRef[0]!==game.awayRef[0]?2:home<away?1:0;
    const awayGoals=game.homeRef[0]!==game.awayRef[0]?0:home>away?1:0;
    await createSyntheticActa(game.code,homeGoals,awayGoals);
  }
  const afterGroups=await request(adminA,'GET',`${base}/competition`);
  assert.equal(afterGroups.statusCode,200,afterGroups.body);
  assert.equal(afterGroups.json().competition.official.groups,25);
  assert.equal(afterGroups.json().competition.groupA.totals[0].played,5);
  assert.equal(afterGroups.json().competition.groupB.totals[0].played,5);
  assert.equal(afterGroups.json().competition.general.totals[0].points,10);
  const privateDaysPublic=(await app.inject({method:'GET',url:`${publicPath}/${categoryId}/competition`})).json();
  assert.equal(privateDaysPublic.competition.official.groups,0);
  assert.deepEqual(privateDaysPublic.players,[]);
  assert.deepEqual(privateDaysPublic.defense.map((row:{played:number})=>row.played),Array(10).fill(0));
  assert.equal((await request(adminA,'POST',`${base}/sync`,{})).json().created,4);
  const afterQuarterPairs=(await request(adminA,'GET',`${base}/competition`)).json();
  assert.deepEqual(afterQuarterPairs.competition.participants.MM1,{homeEntryId:entrySlot.get('A1'),awayEntryId:entrySlot.get('B4')});
  await createSyntheticActa('MM1',0,1);
  await createSyntheticActa('MM2',1,0);
  await createSyntheticActa('MM3',0,0,4,3);
  await createSyntheticActa('MM4',1,0);
  assert.equal((await request(adminA,'POST',`${base}/sync`,{})).json().created,6);
  const afterQuarterfinals=(await request(adminA,'GET',`${base}/competition`)).json();
  assert.equal(afterQuarterfinals.competition.seeds.includes(entrySlot.get('A1')),false);
  assert.deepEqual(afterQuarterfinals.competition.participants.Q1,{homeEntryId:entrySlot.get('A2'),awayEntryId:entrySlot.get('B4')});
  assert.equal(afterQuarterfinals.preparedMatches,35);
  assert.equal(afterQuarterfinals.defense.find((row:{entryId:string})=>row.entryId===entrySlot.get('A2')).played,6);
  for(const game of fcfsPositionPlan.games.filter(game=>game.stage==='quadrangular'))await createSyntheticActa(game.code,0,0);
  const finalState=(await request(adminA,'GET',`${base}/competition`)).json();
  assert.equal(finalState.competition.official.quadrangular,6);
  assert.equal(finalState.titleTie.length,4);
  const extraPath=`${base}/title-extra`;
  assert.equal((await request(adminB,'POST',extraPath,{decision:'no_extra'})).statusCode,403);
  assert.equal((await request(teamA,'POST',extraPath,{decision:'no_extra'})).statusCode,403);
  assert.equal((await request(adminA,'POST',extraPath,{decision:'no_extra'})).statusCode,200);
  const titlePair=[entrySlot.get('A2')!,entrySlot.get('B4')!];
  const extra=await request(adminA,'POST',extraPath,{decision:'extra',homeEntryId:titlePair[0],awayEntryId:titlePair[1]});
  assert.equal(extra.statusCode,200,extra.body);
  assert.ok(extra.json().matchId);
  assert.equal((await request(adminA,'GET',`${base}/competition`)).json().titleExtra.decision,'extra');
  assert.equal((await app.inject({method:'GET',url:`${publicPath}/${categoryId}/competition`})).json().titleExtra,null);
  const extraMatchId=extra.json().matchId,extraApproval=randomUUID();
  await pool.query("INSERT INTO match_records(id,organization_id,match_id,status,rule_version,revision,started_by) VALUES($1,$2,$3,'official',1,1,$4)",[randomUUID(),ids.a,extraMatchId,ids.adminA]);
  const extraEvents=Array.from({length:7},(_,index)=>({id:randomUUID(),sequence:index+1,kind:'shootout_goal',teamEntryId:index<4?titlePair[0]:titlePair[1],registrationId:null,relatedRegistrationId:null,incidentNote:null,cardCode:null,windowNo:null,period:null,minute:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()}));
  await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,1,'approved',7,$4,'Partido extra sintético',$5)",[extraApproval,ids.a,extraMatchId,JSON.stringify({score:{home:0,away:0},shootout:{home:4,away:3},events:extraEvents}),ids.adminA]);
  await pool.query('UPDATE match_records SET approval_id=$3 WHERE organization_id=$1 AND match_id=$2',[ids.a,extraMatchId,extraApproval]);
  assert.equal((await request(adminA,'GET',`${base}/competition`)).json().titleExtra.winnerEntryId,titlePair[0]);
  assert.equal((await request(adminA,'POST',extraPath,{decision:'no_extra'})).json().code,'TITLE_EXTRA_ACTIVE');
  const flyerPath=`/organizations/${ids.a}/flyers/preview`;
  assert.equal((await request(adminA,'POST',flyerPath,{kind:'bracket',sourceId:categoryId,size:'square',pageNo:1,note:null,template:'forest'})).statusCode,409);
  const {rows:stageDays}=await pool.query(`SELECT md.id,md.ordinal FROM matchdays md JOIN categories c ON c.organization_id=md.organization_id AND c.edition_id=md.edition_id
    WHERE md.organization_id=$1 AND c.id=$2 AND md.ordinal BETWEEN 10 AND 14 ORDER BY md.ordinal`,[ids.a,categoryId]);
  assert.equal(stageDays.length,5);
  for(const day of stageDays){
    const preview=await request(adminA,'GET',`/organizations/${ids.a}/matchdays/${day.id}/preview`);
    assert.deepEqual(preview.json().missing,[]);
    assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/matchdays/${day.id}/publish`,{expectedRevision:preview.json().revision,reason:'Publicación de etapa sintética'})).statusCode,201);
  }
  const quarters=await loadFlyerSource(pool,ids.a,'bracket',categoryId,'square',1,null);
  const finals=await loadFlyerSource(pool,ids.a,'final',categoryId,'square',1,null);
  assert.equal(quarters.title,'Cuartos de final');assert.equal(quarters.lines.length,4);
  assert.equal(finals.title,'Finales');assert.equal(finals.lines.length,6);
  assert.match(renderFlyerSvg(quarters,'square','forest'),/Cuartos de final/);
  assert.equal((await request(adminB,'POST',flyerPath,{kind:'final',sourceId:categoryId,size:'square',pageNo:1,note:null,template:'forest'})).statusCode,403);
  assert.equal((await request(adminA,'POST',flyerPath,{kind:'champion',sourceId:categoryId,size:'square',pageNo:1,note:null,template:'forest'})).statusCode,409);
});

test('T04/T05: una jornada de Copa con fecha prevista se publica y abre el acta sin hora ni sede',async()=>{
  const tournament=await newTournament(ids.a,{...fiveRules,points:{win:2,draw:1,loss:0},initialPhase:null,competitionPlan:null});
  assert.equal(tournament.response.statusCode,201,tournament.response.body);
  const {categoryId,editionId}=tournament.response.json(),root=`/organizations/${ids.a}`;
  const base=`${root}/categories/${categoryId}/fixture/blueprint`;
  assert.equal((await request(adminA,'POST',base,fcfsPositionPlan)).statusCode,201);
  for(let index=0;index<10;index++){
    const created=await request(adminA,'POST',`${root}/teams`,{requestId:randomUUID(),name:`Club jornada ${index+1} ${randomUUID().slice(0,5)}`,color:'#165D46',categoryId});
    assert.equal(created.statusCode,201,created.body);
    assert.equal((await request(adminA,'PATCH',`${base}/slots/${index<5?'A':'B'}${index%5+1}`,{entryId:created.json().entryId})).statusCode,200);
  }
  assert.equal((await request(adminA,'PATCH',`${base}/opening`,{firstJornadaCodes:['G01','G02']})).statusCode,200);
  const plan=(await request(adminA,'GET',base)).json();
  assert.equal((await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision})).statusCode,200);
  const rules=await request(adminA,'POST',`${root}/categories/${categoryId}/rules/publish`,{expectedRevision:1,reason:'Puntos y formato revisados',fixedFormatConfirmed:true});
  assert.equal(rules.statusCode,200,rules.body);
  const synced=await request(adminA,'POST',`${base}/sync`,{});assert.equal(synced.statusCode,200,synced.body);
  const days=(await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json();
  const firstDay=days.find((day:{ordinal:number})=>day.ordinal===1);assert.ok(firstDay);
  const match=firstDay.matches[0];assert.ok(match.match_date);assert.equal(match.match_time,'');assert.equal(match.venue_id,null);
  assert.equal(match.position_match,true);assert.equal(match.acta_status,null);
  assert.equal((await request(adminA,'POST',`${root}/matches/${match.id}/record/start`,{})).json().code,'FIXTURE_NOT_PUBLISHED');
  const preview=await request(adminA,'GET',`${root}/matchdays/${firstDay.id}/preview`);assert.deepEqual(preview.json().missing,[]);
  assert.equal((await request(adminB,'POST',`${root}/matchdays/${firstDay.id}/publish`,{expectedRevision:preview.json().revision,reason:'Intento externo'})).statusCode,403);
  const published=await request(adminA,'POST',`${root}/matchdays/${firstDay.id}/publish`,{expectedRevision:preview.json().revision,reason:'Jornada sintética confirmada'});
  assert.equal(published.statusCode,201,published.body);
  const publicDays=(await app.inject({method:'GET',url:`/api/v1/public/organizations/${ids.a}/fixture`})).json();
  const publicMatch=publicDays.flatMap((day:{matches:Array<{id:string;match_time:string;result:unknown}>})=>day.matches).find((item:{id:string})=>item.id===match.id);
  assert.ok(publicMatch);assert.equal(publicMatch.match_time,'');assert.equal(publicMatch.result,null);
  const publicCompetition=(await app.inject({method:'GET',url:`/api/v1/public/organizations/${ids.a}/draws/${categoryId}/competition`})).json();
  assert.equal(publicCompetition.available,true);assert.ok(publicCompetition.matches.some((item:{match_id:string})=>item.match_id===match.id));
  assert.equal((await request(adminB,'POST',`${root}/matches/${match.id}/record/start`,{})).statusCode,403);
  const started=await request(adminA,'POST',`${root}/matches/${match.id}/record/start`,{});assert.equal(started.statusCode,201,started.body);
  assert.equal((await request(adminA,'GET',`${root}/matches/${match.id}/record`)).json().status,'capturing');
  assert.equal((await request(adminB,'GET',`${root}/matches/${match.id}/record`)).statusCode,403);
});

test('T04: orden manual de grupos y general avanza solo con actas vigentes y permiso propio',async()=>{
  const created=await newTournament();assert.equal(created.response.statusCode,201,created.response.body);
  const {categoryId}=created.response.json(),base=`/organizations/${ids.a}/categories/${categoryId}/fixture/blueprint`;
  assert.equal((await request(adminA,'POST',base,fcfsPositionPlan)).statusCode,201);
  const entries:string[]=[];
  for(let index=0;index<10;index++){
    const team=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Empate ${index+1} ${randomUUID().slice(0,5)}`,color:'#165D46',categoryId});
    assert.equal(team.statusCode,201,team.body);entries.push(team.json().entryId);
    assert.equal((await request(adminA,'PATCH',`${base}/slots/${index<5?'A':'B'}${index%5+1}`,{entryId:entries[index]})).statusCode,200);
  }
  assert.equal((await request(adminA,'PATCH',`${base}/opening`,{firstJornadaCodes:['G01','G02']})).statusCode,200);
  const specialRules={...fiveRules,points:{win:2,draw:1,loss:0},initialPhase:null,competitionPlan:null};
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/draft`,{expectedRevision:1,reason:'Copa sintética',rules:specialRules})).statusCode,200);
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/publish`,{expectedRevision:2,reason:'Reglas sintéticas',fixedFormatConfirmed:true})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${base}/sync`,{})).json().created,25);
  const addActa=async(code:string,homeGoals:number,awayGoals:number)=>{
    const {rows:[match]}=await pool.query(`SELECT m.id,m.home_entry_id,m.away_entry_id FROM draft_matches m JOIN fixture_position_games g ON g.organization_id=m.organization_id AND g.id=m.position_game_id WHERE m.organization_id=$1 AND m.category_id=$2 AND g.code=$3`,[ids.a,categoryId,code]);
    assert.ok(match);
    const events=Array.from({length:homeGoals+awayGoals},(_,index)=>({id:randomUUID(),sequence:index+1,kind:'goal',teamEntryId:index<homeGoals?match.home_entry_id:match.away_entry_id,registrationId:null,relatedRegistrationId:null,incidentNote:null,cardCode:null,windowNo:null,period:'PT',minute:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()}));
    const approvalId=randomUUID();
    await pool.query("INSERT INTO match_records(id,organization_id,match_id,status,rule_version,revision,started_by) VALUES($1,$2,$3,'official',1,$4,$5)",[randomUUID(),ids.a,match.id,events.length,ids.adminA]);
    await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,1,'approved',$4,$5,$6,$7)",[approvalId,ids.a,match.id,events.length,JSON.stringify({score:{home:homeGoals,away:awayGoals},shootout:{home:0,away:0},events}),`Acta sintética ${code}`,ids.adminA]);
    await pool.query('UPDATE match_records SET approval_id=$3 WHERE organization_id=$1 AND match_id=$2',[ids.a,match.id,approvalId]);
    return {matchId:match.id,approvalId};
  };
  let firstGroup:{matchId:string;approvalId:string}|null=null;
  for(const game of fcfsPositionPlan.games.filter(game=>game.stage==='groups')){
    const acta=await addActa(game.code,0,0);if(!firstGroup)firstGroup=acta;
  }
  assert.equal((await request(adminA,'GET',`${base}/competition`)).json().competition.blocked,'group_tiebreak');
  const tiePath=`${base}/tiebreak`;
  const groupA={table:'A',position:1,entryOrder:entries.slice(0,5)};
  assert.equal((await request(adminB,'POST',tiePath,groupA)).statusCode,403);
  assert.equal((await request(teamA,'POST',tiePath,groupA)).statusCode,403);
  assert.equal((await request(adminA,'POST',tiePath,{...groupA,entryOrder:[entries[0],entries[0]]})).json().code,'TIE_CHANGED');
  assert.equal((await request(adminA,'POST',tiePath,groupA)).statusCode,200);
  const groupB={table:'B',position:1,entryOrder:entries.slice(5)};
  const bDecision=await request(adminA,'POST',tiePath,groupB);assert.equal(bDecision.statusCode,200,bDecision.body);
  assert.equal(bDecision.json().createdMatches,4);
  assert.equal((await request(adminA,'GET',`${base}/competition`)).json().competition.participants.MM1.homeEntryId,entries[0]);
  await addActa('MM1',1,0);await addActa('MM2',1,0);await addActa('MM3',1,0);await addActa('MM4',1,0);
  assert.equal((await request(adminA,'GET',`${base}/competition`)).json().competition.blocked,'general_tiebreak');
  const generalOrder=[entries[1],entries[5],entries[6],entries[0],entries[2],entries[3],entries[4],entries[7],entries[8],entries[9]];
  const resolved=await request(adminA,'POST',tiePath,{table:'general',position:1,entryOrder:generalOrder});
  assert.equal(resolved.statusCode,200,resolved.body);assert.equal(resolved.json().createdMatches,6);
  const after=(await request(adminA,'GET',`${base}/competition`)).json();
  assert.deepEqual(after.competition.seeds,[entries[1],entries[5],entries[6],entries[0]]);
  assert.equal(after.competition.participants.Q1.homeEntryId,entries[1]);
  const {rows:[original]}=await pool.query('SELECT snapshot FROM match_acta_snapshots WHERE id=$1',[firstGroup!.approvalId]);
  const revisedId=randomUUID();
  await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,2,'approved',0,$4,'Corrección sintética',$5)",[revisedId,ids.a,firstGroup!.matchId,JSON.stringify(original.snapshot),ids.adminA]);
  await pool.query('UPDATE match_records SET approval_id=$3 WHERE organization_id=$1 AND match_id=$2',[ids.a,firstGroup!.matchId,revisedId]);
  assert.equal((await request(adminA,'GET',`${base}/competition`)).json().competition.blocked,'group_tiebreak');
});

test('T02: revocar una asignación corta acceso al equipo y reasignar lo recupera con historial', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201);
  const categoryId = tournament.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Revocación ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId });
  assert.equal(team.statusCode, 201, team.body);
  const { teamId, entryId } = team.json();
  const account = username(`revocable-${randomUUID().slice(0, 6)}`);
  const assigned = await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entryId}/administrators`, { name: 'Admin temporal', username: account });
  assert.equal(assigned.statusCode, 201, assigned.body);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/invitations/accept', payload: { token: assigned.json().invitation.token, password } })).statusCode, 200);
  const teamAdmin = await login(account, password, ids.a);
  assert.equal((await request(teamAdmin, 'GET', `/organizations/${ids.a}/teams/${teamId}`)).statusCode, 200);
  const revokePath = `/organizations/${ids.a}/entries/${entryId}/administrators/${assigned.json().membershipId}/revoke`;
  assert.equal((await request(adminB, 'POST', revokePath, { reason: 'Intento de otro torneo' })).statusCode, 403);
  assert.equal((await request(teamAdmin, 'POST', revokePath, { reason: 'Intento propio' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', revokePath, { reason: 'Cambio de responsable sintético' })).statusCode, 200);
  assert.equal((await request(teamAdmin, 'GET', `/organizations/${ids.a}/teams/${teamId}`)).statusCode, 403);
  assert.equal((await request(teamAdmin, 'GET', `/organizations/${ids.a}/teams`)).statusCode, 403);
  assert.equal((await request(teamAdmin, 'GET', `/organizations/${ids.a}/origin-teams`)).statusCode, 403);
  assert.equal((await request(teamAdmin, 'GET', `/organizations/${ids.a}/entries/${entryId}/players`)).statusCode, 403);
  const history = (await request(adminA, 'GET', `/organizations/${ids.a}/teams/${teamId}`)).json()[0].administrators;
  assert.equal(history[0].assignment, 'revoked');
  const reassigned = await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entryId}/administrators`, { name: 'Admin temporal', username: account });
  assert.equal(reassigned.statusCode, 201, reassigned.body);
  assert.equal((await request(teamAdmin, 'GET', `/organizations/${ids.a}/teams/${teamId}`)).statusCode, 200);
  const { rows: events } = await pool.query("SELECT action FROM audit_logs WHERE organization_id=$1 AND resource_id=$2 AND action LIKE 'team_admin.%' ORDER BY created_at", [ids.a, assigned.json().membershipId]);
  assert.ok(events.some((event) => event.action === 'team_admin.revoked'));
  assert.ok(events.some((event) => event.action === 'team_admin.reassigned'));
});

test('T02: sedes y patrocinadores son privados por defecto, se publican y archivan por torneo', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201);
  const { tournamentId, categoryId } = tournament.response.json();
  const base = `/organizations/${ids.a}/tournaments/${tournamentId}`;
  const publicPath = `/api/v1/public/organizations/${ids.a}/tournaments`;
  assert.equal((await request(adminB, 'GET', `${base}/resources`)).statusCode, 403);
  assert.equal((await request(adminB, 'POST', `${base}/venues`, { name: 'Cancha ajena', city: null })).statusCode, 403);
  assert.equal((await request(teamA, 'POST', `${base}/sponsors`, { name: 'Marca ajena' })).statusCode, 403);
  const venue = await request(adminA, 'POST', `${base}/venues`, { name: 'Polideportivo Sintético', city: 'Asunción' });
  const sponsor = await request(adminA, 'POST', `${base}/sponsors`, { name: 'Patrocinador de Prueba' });
  assert.equal(venue.statusCode, 201, venue.body); assert.equal(sponsor.statusCode, 201, sponsor.body);
  assert.equal((await request(adminA, 'GET', `${base}/resources`)).json().venues.length, 1);
  assert.equal((await app.inject(publicPath)).json().sponsors.some((row: { id: string }) => row.id === sponsor.json().id), false);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Publicar prueba de sedes', expectedRevision: 1 })).statusCode, 200);
  assert.equal(JSON.stringify((await app.inject(publicPath)).json()).includes(venue.json().id), false);
  assert.equal((await app.inject(publicPath)).json().sponsors.some((row: { id: string }) => row.id === sponsor.json().id), false);
  const sponsorPath = `${base}/sponsors/${sponsor.json().id}/publication`;
  assert.equal((await request(adminB, 'POST', sponsorPath, { publicVisible: true, reason: 'Otro ámbito' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', sponsorPath, { publicVisible: true, reason: 'Autorización pública sintética' })).statusCode, 200);
  assert.equal((await app.inject(publicPath)).json().sponsors.some((row: { id: string }) => row.id === sponsor.json().id), true);
  assert.equal((await request(adminA, 'POST', `${base}/sponsors/${sponsor.json().id}/archive`, { reason: 'Fin del patrocinio' })).statusCode, 200);
  assert.equal((await app.inject(publicPath)).json().sponsors.some((row: { id: string }) => row.id === sponsor.json().id), false);
  assert.equal((await request(adminA, 'POST', `${base}/venues/${venue.json().id}/archive`, { reason: 'Sede no disponible' })).statusCode, 200);
  assert.equal(JSON.stringify((await app.inject(publicPath)).json()).includes(venue.json().id), false);
  await assert.rejects(pool.query('INSERT INTO tournament_venues(organization_id,tournament_id,venue_id,created_by) VALUES($1,$2,$3,$4)', [ids.b, tournamentId, venue.json().id, ids.adminA]), (error: unknown) => (error as { code: string }).code === '23503');
});

test('T02: publicar el torneo muestra equipos y escudos; el organizador puede ocultarlos', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201);
  const categoryId = tournament.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Escudo sintético ${randomUUID().slice(0, 6)}`, color: '#234F7D', categoryId });
  assert.equal(team.statusCode, 201, team.body);
  const teamId = team.json().teamId, entryId = team.json().entryId;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z8sAAAAASUVORK5CYII=', 'base64');
  const boundary = 'team-shield-test';
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="escudo.png"\r\nContent-Type: image/png\r\n\r\n`), image, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const shield = await app.inject({ method: 'POST', url: `/api/v1/organizations/${ids.a}/teams/${teamId}/shield`, headers: { ...headers(adminA), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(shield.statusCode, 201, shield.body);
  assert.equal((await request(adminB, 'GET', `/organizations/${ids.a}/teams/${teamId}/shield`)).statusCode, 403);
  const publicShield = `/api/v1/public/organizations/${ids.a}/teams/${teamId}/shield`;
  assert.equal((await app.inject(publicShield)).statusCode, 404);
  const publicList = `/api/v1/public/organizations/${ids.a}/tournaments`;
  assert.equal((await app.inject(publicList)).json().teams.some((item: { id: string }) => item.id === teamId), false);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { expectedRevision: 1, reason: 'Reglamento publicado' })).statusCode, 200);
  assert.equal((await app.inject(publicList)).json().teams.some((item: { id: string }) => item.id === teamId), true);
  const downloaded = await app.inject(publicShield); assert.equal(downloaded.statusCode, 200); assert.deepEqual(downloaded.rawPayload, image);
  assert.equal((await request(teamA, 'POST', `/organizations/${ids.a}/entries/${entryId}/publication`, { publicVisible: false, reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminB, 'POST', `/organizations/${ids.a}/entries/${entryId}/publication`, { publicVisible: false, reason: 'Intento de otro tenant' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entryId}/publication`, { publicVisible: false, reason: 'Retiro de visibilidad' })).statusCode, 200);
  assert.equal((await app.inject(publicShield)).statusCode, 404);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entryId}/publication`, { publicVisible: true, reason: 'Mostrar de nuevo' })).statusCode, 200);
  assert.equal((await app.inject(publicShield)).statusCode, 200);
});

test('T02: categorías nuevas comparten o crean edición y un equipo puede entrar en ambas', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201);
  const tournamentId = tournament.response.json().tournamentId;
  const categoryPath = `/organizations/${ids.a}/tournaments/${tournamentId}/categories`;
  const base = { requestId: randomUUID(), editionName: 'Temporada 2026', categoryName: 'Juvenil', preset: 'F5', teamLimit: 2, rules: fiveRules };
  const same = await request(adminA, 'POST', categoryPath, base);
  assert.equal(same.statusCode, 201, same.body); assert.equal(same.json().editionId, tournament.response.json().editionId);
  assert.equal((await request(adminA, 'POST', categoryPath, base)).statusCode, 200);
  assert.equal((await request(adminA, 'POST', categoryPath, { ...base, categoryName: 'Otra' })).statusCode, 409);
  const later = await request(adminA, 'POST', categoryPath, { ...base, requestId: randomUUID(), editionName: 'Temporada 2027', categoryName: 'Libre' });
  assert.equal(later.statusCode, 201, later.body); assert.notEqual(later.json().editionId, same.json().editionId);
  const categoryB = same.json().categoryId;
  const one = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Primero ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId: categoryB });
  const two = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Segundo ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId: categoryB });
  assert.equal(one.statusCode, 201, one.body); assert.equal(two.statusCode, 201, two.body);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Tercero ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId: categoryB })).statusCode, 409);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/teams/${one.json().teamId}/entries`, { categoryId: later.json().categoryId })).statusCode, 201);
  const rows = (await request(adminA, 'GET', `/organizations/${ids.a}/teams/${one.json().teamId}`)).json();
  assert.equal(rows.length, 2); assert.equal(new Set(rows.map((row: { edition_name: string }) => row.edition_name)).size, 2);
  assert.equal((await request(adminB, 'POST', categoryPath, { ...base, requestId: randomUUID() })).statusCode, 403);
});

test('T03: borrador privado cifra documento, declara origen externo y limita acceso al equipo', async () => {
  const tournament = await newTournament(ids.a, { ...fiveRules, maxRegisteredPlayers: 12 }); assert.equal(tournament.response.statusCode, 201);
  const categoryId = tournament.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Equipo buena fe ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId });
  assert.equal(team.statusCode, 201, team.body);
  const entryId = team.json().entryId, path = `/organizations/${ids.a}/entries/${entryId}/players`;
  assert.equal((await request(teamA, 'GET', `/organizations/${ids.a}/origin-teams`)).statusCode, 200);
  assert.equal((await request(adminB, 'GET', `/organizations/${ids.a}/origin-teams`)).statusCode, 403);
  const input = { givenNames: 'Lucía Elena', familyNames: 'Prueba Sintética', documentKind: 'ci', documentNumber: '1234.5678', birthDate: '2009-04-15', registrationNumber: 'FICHA-123', origin: { kind: 'external', teamName: 'Club externo ficticio', city: 'Ciudad de muestra', league: null } };
  assert.equal((await request(adminB, 'GET', path)).statusCode, 403);
  assert.equal((await request(teamA, 'POST', path, input)).statusCode, 403);
  const created = await request(adminA, 'POST', path, input); assert.equal(created.statusCode, 201, created.body);
  const { rows: [privateRow] } = await pool.query('SELECT document_ciphertext,document_fingerprint,document_last_four FROM players WHERE organization_id=$1 AND id=$2', [ids.a, created.json().playerId]);
  assert.equal(decryptDocument(config.appSecret, privateRow.document_ciphertext), input.documentNumber);
  assert.equal(privateRow.document_ciphertext.includes(input.documentNumber), false);
  assert.equal(privateRow.document_fingerprint.includes(input.documentNumber), false);
  const list = await request(adminA, 'GET', path); assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json()[0].document_last_four, '5678');
  assert.equal(list.json()[0].origin_team_name, input.origin.teamName);
  assert.equal(JSON.stringify(list.json()).includes(input.documentNumber), false);
  const { rows: [externalCount] } = await pool.query('SELECT count(*)::int total FROM teams WHERE organization_id=$1 AND name=$2', [ids.a, input.origin.teamName]);
  assert.equal(externalCount.total, 0);
  const duplicate = await request(adminA, 'POST', path, { ...input, documentNumber: '12345678', registrationNumber: 'OTRA-FICHA' });
  assert.equal(duplicate.statusCode, 409); assert.equal(duplicate.json().code, 'PLAYER_DUPLICATE');
  const badOrigin = await request(adminA, 'POST', path, { ...input, documentNumber: '98765432', registrationNumber: 'OTRA-FICHA', origin: { kind: 'internal', teamId: randomUUID(), city: 'Ciudad de muestra', league: null } });
  assert.equal(badOrigin.statusCode, 400); assert.equal(badOrigin.json().code, 'ORIGIN_NOT_FOUND');
  const future = await request(adminA, 'POST', path, { ...input, documentNumber: '98765432', registrationNumber: 'OTRA-FICHA', birthDate: '2999-01-01' });
  assert.equal(future.statusCode, 400);
  const { rows: [membership] } = await pool.query('SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2', [ids.a, ids.teamA]);
  await pool.query('INSERT INTO team_admin_assignments(organization_id,entry_id,membership_id,assigned_by) VALUES($1,$2,$3,$4)', [ids.a, entryId, membership.id, ids.adminA]);
  assert.equal((await request(teamA, 'GET', path)).statusCode, 200);
  assert.equal((await request(teamA, 'GET', `/organizations/${ids.b}/entries/${entryId}/players`)).statusCode, 403);
  for (let index = 0; index < 11; index++) {
    const added = await request(teamA, 'POST', path, { ...input, givenNames: `Persona ${index + 1}`, documentNumber: String(77000000 + index), registrationNumber: `FICHA-${index + 2}`, origin: { kind: 'unknown' } });
    assert.equal(added.statusCode, 201, added.body);
  }
  const full = await request(teamA, 'POST', path, { ...input, documentNumber: '77999999', registrationNumber: 'FICHA-EXTRA', origin: { kind: 'none' } });
  assert.equal(full.statusCode, 409); assert.equal(full.json().code, 'ROSTER_FULL');
});

test('T03: lista de buena fe se presenta, revisa y versiona sin reescribir snapshots', async () => {
  const tournament = await newTournament(); assert.equal(tournament.response.statusCode, 201);
  const categoryId = tournament.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Equipo lista ${randomUUID().slice(0, 6)}`, color: '#165D46', categoryId });
  assert.equal(team.statusCode, 201, team.body);
  const entryId = team.json().entryId, base = `/organizations/${ids.a}/entries/${entryId}`;
  const registrationIds: string[] = [];
  for (const index of [1,2]) {
    const player = await request(adminA, 'POST', `${base}/players`, { givenNames: `Persona ${index}`, familyNames: 'Prueba Sintética', documentKind: 'ci', documentNumber: `${runId}${index}1234`, birthDate: '2008-03-15', registrationNumber: `T03-${index}`, origin: { kind: 'unknown' } });
    assert.equal(player.statusCode, 201, player.body); registrationIds.push(player.json().id);
  }
  const submitPath = `${base}/good-faith/submit`, reviewPath = `${base}/good-faith/review`;
  const body = { registrationIds, expectedVersion: 0, reason: 'Primera lista sintética' };
  assert.equal((await request(adminB, 'POST', submitPath, body)).statusCode, 403);
  assert.equal((await request(teamA, 'POST', submitPath, body)).statusCode, 403);
  const staleSelection = await request(adminA, 'POST', submitPath, { ...body, registrationIds: registrationIds.slice(0, 1) });
  assert.equal(staleSelection.statusCode, 409); assert.equal(staleSelection.json().code, 'ROSTER_CHANGED');
  const first = await request(adminA, 'POST', submitPath, body); assert.equal(first.statusCode, 201, first.body); assert.equal(first.json().version, 1);
  const pending = await request(adminA, 'POST', submitPath, { ...body, expectedVersion: 1 });
  assert.equal(pending.statusCode, 409); assert.equal(pending.json().code, 'REVIEW_PENDING');
  const list = await request(adminA, 'GET', `${base}/good-faith`); assert.equal(list.statusCode, 200);
  assert.equal(list.json()[0].snapshot.length, 2);
  assert.equal(JSON.stringify(list.json()).includes(`${runId}11234`), false);
  assert.equal((await request(teamA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Intento de equipo' })).statusCode, 403);
  assert.equal((await request(adminB, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Intento ajeno' })).statusCode, 403);
  const unpublished = await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Aprobar lista' });
  assert.equal(unpublished.statusCode, 409); assert.equal(unpublished.json().code, 'RULES_NOT_PUBLISHED');
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Reglamento completo', expectedRevision: 1 })).statusCode, 200);
  const approved = await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Identidades revisadas' });
  assert.equal(approved.statusCode, 200, approved.body); assert.equal(approved.json().status, 'approved');
  const pdf = await request(adminA, 'GET', `${base}/good-faith/1/pdf`);
  assert.equal(pdf.statusCode, 200); assert.equal(pdf.headers['content-type'], 'application/pdf'); assert.ok(pdf.rawPayload.subarray(0,8).toString().startsWith('%PDF-1.4'));
  const exportPath=`${base}/exports/good-faith/list/1`;
  const csv=await request(adminA,'GET',`${exportPath}/csv`);assert.equal(csv.statusCode,200,csv.body);
  assert.match(csv.body,/Lista de buena fe aprobada/);assert.match(csv.body,/"1"/);assert.doesNotMatch(csv.body,new RegExp(`${runId}11234`));
  const repeat=await request(adminA,'GET',`${exportPath}/csv`);assert.equal(repeat.statusCode,200);assert.equal(repeat.body.replace(/"Generado","[^"]+"/,''),csv.body.replace(/"Generado","[^"]+"/,''));
  assert.equal((await request(adminB,'GET',`${exportPath}/csv`)).statusCode,403);
  assert.equal((await request(teamA,'GET',`${exportPath}/csv`)).statusCode,403);
  assert.equal((await app.inject(`/api/v1${exportPath}/csv`)).statusCode,401);
  const {rows:[downloads]}=await pool.query("SELECT count(*)::int total FROM audit_logs WHERE organization_id=$1 AND action='private_export.downloaded' AND resource_id=$2",[ids.a,entryId]);assert.ok(downloads.total>=3);
  assert.equal((await request(adminB, 'GET', `${base}/good-faith/1/pdf`)).statusCode, 403);
  assert.equal((await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Reintento' })).statusCode, 409);
  const { rows: [status] } = await pool.query('SELECT count(*)::int total FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 AND status=\'approved\'', [ids.a, entryId]);
  assert.equal(status.total, 2);
  await assert.rejects(pool.query("UPDATE good_faith_versions SET snapshot='[]'::jsonb WHERE organization_id=$1 AND entry_id=$2 AND version=1", [ids.a, entryId]));
  const second = await request(adminA, 'POST', submitPath, { registrationIds, expectedVersion: 1, reason: 'Segunda revisión sintética' });
  assert.equal(second.statusCode, 201, second.body); assert.equal(second.json().version, 2);
  const changedRules = await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/draft`, { rules: { ...fiveRules, eligibility: { age: null, requiredDocuments: ['Documento de identidad'] } }, expectedRevision: 1, reason: 'Exigir documento privado' });
  assert.equal(changedRules.statusCode, 200, changedRules.body);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Nueva exigencia documental', expectedRevision: 1 })).statusCode, 200);
  const missingDocuments = await request(adminA, 'POST', reviewPath, { version: 2, decision: 'approved', reason: 'Intentar aprobación' });
  assert.equal(missingDocuments.statusCode, 200, missingDocuments.body);
  assert.equal((await request(adminA, 'POST', reviewPath, { version: 2, decision: 'observed', reason: 'Revisar datos de origen' })).statusCode, 409);
  const history = (await request(adminA, 'GET', `${base}/good-faith`)).json();
  assert.deepEqual(history.map((item: { status: string }) => item.status), ['approved','approved']);
  assert.deepEqual(history[1].snapshot, list.json()[0].snapshot);
});

test('T03: documento privado revisado habilita buena fe y restricciones bloquean por fecha', async () => {
  const rules: RuleConfig = { ...fiveRules, eligibility: { age: { minYears: 18, maxYears: null, reference: 'match_date', fixedDate: null }, requiredDocuments: ['Documento de identidad'] } };
  const created = await newTournament(ids.a, rules); assert.equal(created.response.statusCode, 201);
  const categoryId = created.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Equipo evidencia ${randomUUID().slice(0,6)}`, color: '#165D46', categoryId });
  assert.equal(team.statusCode, 201); const entryId = team.json().entryId;
  const base = `/organizations/${ids.a}/entries/${entryId}`;
  const player = await request(adminA, 'POST', `${base}/players`, { givenNames: 'Persona', familyNames: 'Documentada', documentKind: 'ci', documentNumber: `${runId}88001`, birthDate: '2007-06-20', registrationNumber: 'DOC-1', origin: { kind: 'none' } });
  assert.equal(player.statusCode, 201, player.body); const registration = player.json().id, playerBase = `${base}/players/${registration}`;
  assert.equal((await request(adminB, 'GET', `${playerBase}/evidence`)).statusCode, 403);
  assert.equal((await request(teamA, 'GET', `${playerBase}/evidence`)).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${base}/good-faith/submit`, { registrationIds: [registration], expectedVersion: 0, reason: 'Lista con documento' })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Reglamento con documento', expectedRevision: 1 })).statusCode, 200);
  const reviewPath = `${base}/good-faith/review`;
  assert.equal((await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Revisar documento' })).statusCode, 200);
  const boundary = `----doc-${randomUUID()}`;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="muestra.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),pdf,Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload = (session: Session) => app.inject({ method: 'POST', url: `/api/v1${playerBase}/documents/Documento%20de%20identidad`, headers: { ...headers(session), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal((await upload(adminB)).statusCode, 403);
  const uploaded = await upload(adminA); assert.equal(uploaded.statusCode, 201, uploaded.body); const documentId = uploaded.json().id;
  assert.equal((await request(adminB, 'GET', `${playerBase}/documents/${documentId}/file`)).statusCode, 403);
  assert.equal((await request(adminA, 'GET', `${playerBase}/documents/${documentId}/file`)).statusCode, 200);
  assert.equal((await request(adminB, 'POST', `${playerBase}/documents/${documentId}/review`, { decision: 'approved', reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${playerBase}/documents/${documentId}/review`, { decision: 'approved', reason: 'Identidad sintética comprobada' })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Documento validado' })).statusCode, 409);
  const beforeBirthday = await request(adminA, 'GET', `${playerBase}/eligibility?date=2025-06-19`);
  assert.equal(beforeBirthday.json().status, 'warning');
  const afterBirthday = await request(adminA, 'GET', `${playerBase}/eligibility?date=2025-06-20`);
  assert.equal(afterBirthday.json().status, 'allowed');
  const restriction = await request(adminA, 'POST', `${playerBase}/restrictions`, { startsOn: '2025-06-20', endsOn: '2025-07-20', reason: 'Suspensión sintética' });
  assert.equal(restriction.statusCode, 201, restriction.body);
  assert.equal((await request(adminA, 'GET', `${playerBase}/eligibility?date=2025-07-01`)).json().status, 'warning');
  assert.equal((await request(adminB, 'POST', `${playerBase}/restrictions/${restriction.json().id}/lift`, { reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${playerBase}/restrictions/${restriction.json().id}/lift`, { reason: 'Revisión sintética' })).statusCode, 200);
  assert.equal((await request(adminA, 'GET', `${playerBase}/eligibility?date=2025-07-01`)).json().status, 'allowed');
});

test('T03: ficha y documento opcionales conservan el aislamiento', async () => {
  const created = await newTournament(ids.a, fiveRules); assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Sin ficha ${randomUUID().slice(0,6)}`, color: '#165D46', categoryId });
  assert.equal(team.statusCode, 201, team.body);
  const path = `/organizations/${ids.a}/entries/${team.json().entryId}/players`;
  const player = { givenNames: 'María', familyNames: 'Sintética', documentKind: null, documentNumber: null, birthDate: '2001-01-01', registrationNumber: null, origin: { kind: 'unknown' } };
  assert.equal((await request(adminB, 'POST', path, player)).statusCode, 403);
  const saved = await request(adminA, 'POST', path, player); assert.equal(saved.statusCode, 201, saved.body);
  const listed = await request(adminA, 'GET', path); assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().find((item: {id:string}) => item.id === saved.json().id).document_last_four, null);
});

test('T03: ventana de inscripción y comprobante de pase por procedencia', async () => {
  const closed: RuleConfig = { ...fiveRules, eligibility: { age: null, requiredDocuments: [], registrationWindow: { opensOn: '2020-01-01', closesOn: '2020-12-31' }, transferProof: { requiredFor: 'external', label: 'Comprobante de pase' }, registrationFields: [{ key: 'posicion', label: 'Posición habitual' }] } };
  const created = await newTournament(ids.a, closed); assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Equipo ventana ${randomUUID().slice(0,6)}`, color: '#165D46', categoryId });
  assert.equal(team.statusCode, 201, team.body);
  const entryId = team.json().entryId, base = `/organizations/${ids.a}/entries/${entryId}`;
  const payload = { givenNames: 'Persona', familyNames: 'Pase Sintético', documentKind: 'ci', documentNumber: `${runId}pase1`, birthDate: '2000-01-01', registrationNumber: 'PASE-1', details: { posicion: 'Arquera' }, origin: { kind: 'external', teamName: 'Club de prueba externo', city: 'Ciudad ficticia', league: null } };
  assert.equal((await request(adminB, 'POST', `${base}/players`, payload)).statusCode, 403);
  const registered = await request(adminA, 'POST', `${base}/players`, payload);
  assert.equal(registered.statusCode, 201, registered.body);
  const opened = { ...closed, eligibility: { ...closed.eligibility!, registrationWindow: { opensOn: '2020-01-01', closesOn: '2099-12-31' } } };
  const draft = await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/draft`, { rules: opened, expectedRevision: 1, reason: 'Abrir inscripciones sintéticas' });
  assert.equal(draft.statusCode, 200, draft.body);
  const extra = await request(adminA, 'POST', `${base}/players`, { ...payload, details: { dato_no_configurado: 'No permitido' } });
  assert.equal(extra.statusCode, 400, extra.body); assert.equal(extra.json().code, 'REGISTRATION_FIELD_UNKNOWN');
  const player = registered;
  assert.deepEqual((await request(adminA, 'GET', `${base}/players`)).json()[0].details, { posicion: 'Arquera' });
  assert.equal((await request(adminB, 'GET', `${base}/players`)).statusCode, 403);
  const registration = player.json().id, playerBase = `${base}/players/${registration}`;
  assert.equal((await request(adminA, 'POST', `${base}/good-faith/submit`, { registrationIds: [registration], expectedVersion: 0, reason: 'Presentar pase sintético' })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Publicar política de pase', expectedRevision: 2 })).statusCode, 200);
  const reviewPath = `${base}/good-faith/review`;
  const missing = await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Intentar sin pase' });
  assert.equal(missing.statusCode, 200, missing.body);
  const boundary = `----pase-${randomUUID()}`;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
  const multipart = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="pase.pdf"\r\nContent-Type: application/pdf\r\n\r\n`), pdf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload = await app.inject({ method: 'POST', url: `/api/v1${playerBase}/documents/Comprobante%20de%20pase`, headers: { ...headers(adminA), 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: multipart });
  assert.equal(upload.statusCode, 201, upload.body);
  assert.equal((await request(adminB, 'POST', `${playerBase}/documents/${upload.json().id}/review`, { decision: 'approved', reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${playerBase}/documents/${upload.json().id}/review`, { decision: 'approved', reason: 'Pase ficticio revisado' })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', reviewPath, { version: 1, decision: 'approved', reason: 'Pase ficticio aprobado' })).statusCode, 409);
  assert.equal((await request(adminA, 'GET', `${playerBase}/eligibility?date=2026-10-29`)).json().status, 'warning');
});

test('T03: planilla F7 versionada limita 7+8, congela aprobada y valida copia/ámbito', async () => {
  const rules: RuleConfig = { ...fiveRules, playersOnField: 7, minimumToStart: 7, minimumToContinue: 5, maxBenchPlayers: 8, maxMatchRoster: 15, maxRegisteredPlayers: 30, lineupRoles: { goalkeeperRequired: true, captainRequired: true } };
  const created = await newTournament(ids.a, rules, 'F7'); assert.equal(created.response.statusCode, 201, created.response.body);
  const categoryId = created.response.json().categoryId;
  const createTeam = async (name: string) => request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `${name} ${randomUUID().slice(0,6)}`, color: '#165D46', categoryId });
  const home = await createTeam('Local planilla'), away = await createTeam('Visitante planilla');
  assert.equal(home.statusCode, 201); assert.equal(away.statusCode, 201);
  const entryId = home.json().entryId, awayId = away.json().entryId, base = `/organizations/${ids.a}/entries/${entryId}`;
  const registrations: string[] = [];
  for (let index = 0; index < 30; index++) {
    const player = await request(adminA, 'POST', `${base}/players`, { givenNames: `Persona ${index}`, familyNames: 'Ficticia Planilla', documentKind: 'ci', documentNumber: `${runId}77${String(index).padStart(4,'0')}`, birthDate: '2000-01-01', registrationNumber: `F7-${index}`, origin: { kind: 'none' } });
    assert.equal(player.statusCode, 201, player.body); registrations.push(player.json().id);
  }
  assert.equal((await request(adminA, 'POST', `${base}/good-faith/submit`, { registrationIds: registrations, expectedVersion: 0, reason: 'Treinta jugadores ficticios' })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Reglamento F7 sintético', expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', `${base}/good-faith/review`, { version: 1, decision: 'approved', reason: 'Nómina sintética revisada' })).statusCode, 200);
  const matchPath = `/organizations/${ids.a}/categories/${categoryId}/draft-matches`;
  assert.equal((await request(adminB, 'POST', matchPath, { homeEntryId: entryId, awayEntryId: awayId, matchDate: '2026-10-28' })).statusCode, 403);
  const match = await request(adminA, 'POST', matchPath, { homeEntryId: entryId, awayEntryId: awayId, matchDate: '2026-10-28' }); assert.equal(match.statusCode, 201, match.body);
  const matchId = match.json().id, lineupPath = `/organizations/${ids.a}/draft-matches/${matchId}/entries/${entryId}/lineup`;
  assert.equal((await request(adminB, 'GET', lineupPath)).statusCode, 403);
  assert.equal((await request(adminB, 'GET', `${base}/draft-matches`)).statusCode, 403);
  const selection = registrations.slice(0,15).map((registrationId,index) => ({ registrationId, role: index < 7 ? 'starter' : 'bench', goalkeeper: index === 0, captain: index === 1 }));
  const overStarters = selection.map((player,index) => index === 7 ? { ...player, role: 'starter' } : player);
  assert.equal(overStarters.length, 15);
  const overBench = registrations.slice(0,16).map((registrationId,index) => ({ registrationId, role: index < 7 ? 'starter' : 'bench', goalkeeper: index === 0, captain: index === 1 }));
  assert.equal(overBench.length, 16);
  const duplicateShirts = selection.map((player,index) => ({ ...player, shirtNumber: index < 2 ? 10 : index + 10 }));
  assert.equal((await request(adminA, 'POST', lineupPath, { players: duplicateShirts, staffIds: [], expectedVersion: 0, reason: 'Dorsales repetidos' })).statusCode, 400);
  const saved = await request(adminA, 'POST', lineupPath, { players: selection, staffIds: [], expectedVersion: 0, reason: 'Convocatoria sintética F7' });
  assert.equal(saved.statusCode, 201, saved.body); assert.equal(saved.json().version, 1);
  assert.equal((await request(adminA, 'POST', lineupPath, { players: selection, staffIds: [], expectedVersion: 0, reason: 'Edición antigua' })).json().code, 'STALE_VERSION');
  assert.equal((await request(adminA, 'POST', `${lineupPath}/submit`, { expectedVersion: 1, reason: 'Enviar convocatoria' })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', lineupPath, { players: selection, staffIds: [], expectedVersion: 1, reason: 'Edición durante revisión' })).json().code, 'REVIEW_PENDING');
  assert.equal((await request(adminB, 'POST', `${lineupPath}/review`, { expectedVersion: 1, decision: 'approved', reason: 'Intento ajeno' })).statusCode, 403);
  const approved = await request(adminA, 'POST', `${lineupPath}/review`, { expectedVersion: 1, decision: 'approved', reason: 'Convocados revisados' }); assert.equal(approved.statusCode, 200, approved.body);
  await assert.rejects(pool.query("UPDATE lineup_versions SET snapshot='{}'::jsonb WHERE organization_id=$1 AND match_id=$2 AND entry_id=$3 AND version=1", [ids.a, matchId, entryId]));
  const v2 = await request(adminA, 'POST', lineupPath, { players: selection.slice(0,14), staffIds: [], expectedVersion: 1, reason: 'Nueva selección ficticia' }); assert.equal(v2.statusCode, 201, v2.body);
  const history = (await request(adminA, 'GET', lineupPath)).json(); assert.deepEqual(history.map((item: { status: string }) => item.status), ['draft','approved']); assert.equal(history[1].snapshot.players.length, 15);
  const secondMatch = await request(adminA, 'POST', matchPath, { homeEntryId: entryId, awayEntryId: awayId, matchDate: '2026-11-03' }); assert.equal(secondMatch.statusCode, 201);
  const previous = await request(adminA, 'GET', `${base}/lineups/previous?exclude=${secondMatch.json().id}`); assert.equal(previous.statusCode, 200); assert.equal(previous.json().snapshot.players.length, 15);
  const loan = await request(adminA, 'POST', `${base}/players/${registrations[0]}/movements`, { kind: 'loan', startsOn: '2026-01-01', endsOn: '2026-10-31', reason: 'Préstamo de prueba vencido' }); assert.equal(loan.statusCode, 201, loan.body);
  assert.equal((await request(adminA, 'POST', `${base}/players/${registrations[0]}/movements/${loan.json().id}/review`, { decision: 'approved', reason: 'Vigencia comprobada' })).statusCode, 200);
  assert.equal((await request(adminA, 'GET', `${base}/players/${registrations[0]}/eligibility?date=2026-11-03`)).json().status, 'warning');
  const secondPath = `/organizations/${ids.a}/draft-matches/${secondMatch.json().id}/entries/${entryId}/lineup`;
  assert.equal((await request(adminA, 'POST', secondPath, { players: selection, staffIds: [], expectedVersion: 0, reason: 'Copiar con advertencia' })).statusCode, 201);
  assert.equal((await request(adminB, 'POST', `/organizations/${ids.a}/draft-matches/${secondMatch.json().id}/entries/${entryId}/players/${registrations[0]}/exception`, { reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/draft-matches/${secondMatch.json().id}/entries/${entryId}/players/${registrations[0]}/exception`, { reason: 'Excepción sintética documentada' })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', secondPath, { players: selection, staffIds: [], expectedVersion: 0, reason: 'Versión vencida' })).statusCode, 409);
  const thirdMatch = await request(adminA, 'POST', matchPath, { homeEntryId: entryId, awayEntryId: awayId, matchDate: '2026-10-30' }); assert.equal(thirdMatch.statusCode, 201);
  const thirdPath = `/organizations/${ids.a}/draft-matches/${thirdMatch.json().id}/entries/${entryId}/lineup`;
  const noRoles = selection.map((player) => ({ ...player, goalkeeper: false, captain: false }));
  assert.equal((await request(adminA, 'POST', thirdPath, { players: noRoles, staffIds: [], expectedVersion: 0, reason: 'Sin roles marcados' })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `${thirdPath}/submit`, { expectedVersion: 1, reason: 'Presentación sin roles deportivos' })).statusCode, 200);
});

test('T03: CSV se previsualiza, importa y revierte sin borrar historial', async () => {
  const created = await newTournament(); assert.equal(created.response.statusCode, 201);
  const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Equipo CSV ${randomUUID().slice(0,6)}`, color: '#165D46', categoryId: created.response.json().categoryId });
  assert.equal(team.statusCode, 201); const base = `/organizations/${ids.a}/entries/${team.json().entryId}/players`;
  const rows = [1,2].map((number) => ({ givenNames: `Persona ${number}`, familyNames: 'Importada', documentKind: 'ci', documentNumber: `${runId}9900${number}`, birthDate: '2000-01-01', registrationNumber: `CSV-${number}`, origin: { kind: 'unknown' } }));
  assert.equal((await request(adminB, 'POST', `${base}/import/preview`, { rows })).statusCode, 403);
  const preview = await request(adminA, 'POST', `${base}/import/preview`, { rows }); assert.equal(preview.statusCode, 200, preview.body);
  assert.equal((await request(adminA, 'POST', `${base}/import`, { rows: rows.slice(0,1), previewToken: preview.json().previewToken, reason: 'Lote alterado' })).json().code, 'PREVIEW_EXPIRED');
  const imported = await request(adminA, 'POST', `${base}/import`, { rows, previewToken: preview.json().previewToken, reason: 'Lote CSV sintético' }); assert.equal(imported.statusCode, 201, imported.body);
  assert.equal((await request(adminA, 'GET', base)).json().length, 2);
  const batchId = imported.json().id;
  const { rows: [importedRegistration] } = await pool.query('SELECT id FROM player_registrations WHERE organization_id=$1 AND import_batch_id=$2 LIMIT 1', [ids.a, batchId]);
  assert.equal((await request(adminB, 'POST', `${base}/import-batches/${batchId}/revert`, { reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${base}/import-batches/${batchId}/revert`, { reason: 'Error sintético de carga' })).statusCode, 200);
  assert.equal((await request(adminA, 'GET', base)).json().length, 0);
  assert.equal((await request(adminA, 'GET', `${base}/${importedRegistration.id}/eligibility?date=2026-10-28`)).statusCode, 404);
  const { rows: [batch] } = await pool.query('SELECT status FROM player_import_batches WHERE organization_id=$1 AND id=$2', [ids.a, batchId]); assert.equal(batch.status, 'reverted');
  const { rows: [retained] } = await pool.query('SELECT count(*)::int total FROM player_registrations WHERE organization_id=$1 AND import_batch_id=$2 AND reverted_at IS NOT NULL', [ids.a, batchId]); assert.equal(retained.total, 2);
});

test('T03: identidad compartida se reutiliza y corrige con versión cifrada sin cambiar buena fe histórica', async () => {
  const created = await newTournament(); assert.equal(created.response.statusCode, 201);
  const categoryId = created.response.json().categoryId;
  const makeTeam = async (name: string) => request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `${name} ${randomUUID().slice(0,6)}`, color: '#165D46', categoryId });
  const a = await makeTeam('Equipo origen'), b = await makeTeam('Equipo destino'); assert.equal(a.statusCode, 201); assert.equal(b.statusCode, 201);
  const baseA = `/organizations/${ids.a}/entries/${a.json().entryId}`, baseB = `/organizations/${ids.a}/entries/${b.json().entryId}`;
  const player = await request(adminA, 'POST', `${baseA}/players`, { givenNames: 'Nombre Inicial', familyNames: 'Apellido Inicial', documentKind: 'ci', documentNumber: `${runId}66111`, birthDate: '2001-02-03', registrationNumber: 'ORIG-1', origin: { kind: 'none' } });
  assert.equal(player.statusCode, 201, player.body); const registration = player.json().id, playerId = player.json().playerId;
  assert.equal((await request(adminB, 'GET', `/organizations/${ids.a}/players/search?q=Inicial`)).statusCode, 403);
  const search = await request(adminA, 'GET', `/organizations/${ids.a}/players/search?q=Inicial`); assert.equal(search.statusCode, 200); assert.ok(search.json().some((row: { id: string }) => row.id === playerId));
  assert.equal(JSON.stringify(search.json()).includes(`${runId}66111`), false);
  const reused = await request(adminA, 'POST', `${baseB}/players/reuse`, { playerId, registrationNumber: 'DEST-1', origin: { kind: 'unknown' }, reason: 'Cambio de equipo sintético' });
  assert.equal(reused.statusCode, 201, reused.body); assert.equal(reused.json().playerId, playerId);
  assert.equal((await request(adminB, 'POST', `${baseB}/players/reuse`, { playerId, registrationNumber: 'X', origin: { kind: 'none' }, reason: 'Intento ajeno' })).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${baseB}/players/reuse`, { playerId, registrationNumber: 'DEST-2', origin: { kind: 'none' }, reason: 'Duplicación' })).json().code, 'ALREADY_REGISTERED');
  assert.equal((await request(adminA, 'POST', `${baseA}/good-faith/submit`, { registrationIds: [registration], expectedVersion: 0, reason: 'Nómina previa a corrección' })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${categoryId}/rules/publish`, { reason: 'Reglas de identidad', expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', `${baseA}/good-faith/review`, { version: 1, decision: 'approved', reason: 'Identidad inicial revisada' })).statusCode, 200);
  const editPath = `${baseA}/players/${registration}/identity`;
  assert.equal((await request(adminA, 'PATCH', editPath, { givenNames: 'Nombre Nuevo', familyNames: 'Apellido Inicial', birthDate: '2001-02-03', expectedRevision: 2, reason: 'Versión obsoleta' })).json().code, 'STALE_VERSION');
  const changed = await request(adminA, 'PATCH', editPath, { givenNames: 'Nombre Nuevo', familyNames: 'Apellido Inicial', birthDate: '2001-02-03', expectedRevision: 1, reason: 'Corrección sintética' });
  assert.equal(changed.statusCode, 200, changed.body); assert.equal(changed.json().revision, 2);
  const history = await request(adminA, 'GET', `${editPath}/history`); assert.equal(history.statusCode, 200); assert.equal(history.json()[0].before.givenNames, 'Nombre Inicial'); assert.equal(history.json()[0].after.givenNames, 'Nombre Nuevo');
  assert.equal(JSON.stringify(history.json()).includes(`${runId}66111`), false);
  const former = (await request(adminA, 'GET', `${baseA}/good-faith`)).json()[0]; assert.equal(former.snapshot[0].givenNames, 'Nombre Inicial'); assert.equal(former.status, 'approved');
  assert.equal((await request(adminA, 'GET', `${baseA}/players`)).json()[0].status, 'observed');
  const { rows: [cipher] } = await pool.query('SELECT before_ciphertext,after_ciphertext FROM player_identity_changes WHERE organization_id=$1 AND player_id=$2', [ids.a, playerId]); assert.equal(cipher.before_ciphertext.includes('Nombre Inicial'), false); assert.equal(cipher.after_ciphertext.includes('Nombre Nuevo'), false);
  assert.equal((await request(adminA, 'GET', `${baseB}/players`)).json()[0].given_names, 'Nombre Nuevo');
});

test('T04: round robin par e impar genera cruces únicos, descanso e inversión de localía', () => {
  for (const count of [4, 5, 6]) {
    const ids = Array.from({ length: count }, (_, index) => `equipo-${index + 1}`);
    const single = roundRobin(ids, 1), double = roundRobin(ids, 2);
    assert.equal(single.length, count % 2 ? count : count - 1);
    assert.equal(double.length, single.length * 2);
    assert.equal(single.flatMap((round) => round.matches).length, count * (count - 1) / 2);
    const pairs = new Set(single.flatMap((round) => round.matches.map((match) => [match.homeEntryId, match.awayEntryId].sort().join(':'))));
    assert.equal(pairs.size, count * (count - 1) / 2);
    for (const round of single) {
      const used = round.matches.flatMap((match) => [match.homeEntryId, match.awayEntryId]);
      assert.equal(new Set([...used, ...round.byeEntryIds]).size, count);
      assert.equal(round.byeEntryIds.length, count % 2);
    }
    assert.deepEqual(double.slice(single.length).flatMap((round) => round.matches), single.flatMap((round) => round.matches.map((match) => ({ homeEntryId: match.awayEntryId, awayEntryId: match.homeEntryId }))));
  }
});

test('T04: global de ida/vuelta y tanda deciden ganador sin inventar empate', () => {
  const home=randomUUID(),away=randomUUID();
  assert.equal(tieWinner(home,away,{score:{home:2,away:1},shootout:{home:0,away:0}},{score:{home:1,away:1},shootout:{home:0,away:0}}),home);
  assert.equal(tieWinner(home,away,{score:{home:2,away:1},shootout:{home:0,away:0}},{score:{home:2,away:1},shootout:{home:3,away:4}}),home);
  assert.equal(tieWinner(home,away,{score:{home:0,away:0},shootout:{home:0,away:0}}),null);
  assert.equal(tieWinner(home,away,{score:{home:0,away:0},shootout:{home:0,away:0}},null),null);
});

test('T04: puntos por partido ignoran diferencia de goles; penales o tercer partido resuelven la llave',()=>{
  const home=randomUUID(),away=randomUUID();
  const first={score:{home:1,away:0},shootout:{home:0,away:0}};
  const returnLeg={score:{home:4,away:0},shootout:{home:3,away:4}};
  assert.equal(tieWinner(home,away,first,returnLeg,'aggregate'),away);
  assert.equal(tieWinner(home,away,first,returnLeg,'match_points_penalties'),home);
  assert.equal(tieWinner(home,away,first,returnLeg,'match_points_third'),null);
  assert.equal(tieWinner(home,away,first,returnLeg,'match_points_third',{score:{home:2,away:1},shootout:{home:0,away:0}}),home);
  assert.equal(tieWinner(home,away,first,returnLeg,'match_points_third',{score:{home:1,away:1},shootout:{home:2,away:3}}),away);
  assert.equal(tieWinner(home,away,first,{score:{home:1,away:1},shootout:{home:0,away:0}},'match_points_third',null,{win:2,draw:1,loss:0}),home);
});

test('T04: empate de mejores restantes exige orden manual del mismo corte',()=>{
  const [a1,a2,b1,b2]=Array.from({length:4},()=>randomUUID());
  const total=(teamId:string,points:number)=>({teamId,points,wins:points/3,goalDifference:0,goalsFor:0,goalsAgainst:0,yellowCards:0,redCards:0});
  const projection={tables:[{groupNo:1,groups:[{position:1,teamIds:[a1],unresolved:false},{position:2,teamIds:[a2],unresolved:false}],totals:[total(a1,6),total(a2,3)]},{groupNo:2,groups:[{position:1,teamIds:[b1],unresolved:false},{position:2,teamIds:[b2],unresolved:false}],totals:[total(b1,6),total(b2,3)]}]} as any;
  const qualification={from:'groups' as const,perGroup:1,bestRemaining:1},criteria=['wins','goal_difference','manual_draw'];
  assert.deepEqual(new Set(bestRemainingTie(projection,qualification,criteria)),new Set([a2,b2]));
  assert.equal(qualifiedEntries(projection,qualification,criteria),null);
  assert.equal(qualifiedEntries(projection,qualification,criteria,[a1,b2]),null);
  assert.deepEqual(qualifiedEntries(projection,qualification,criteria,[b2,a2]),[a1,b1,b2]);
});

test('T04: reparto de grupos y árbol eliminatorio dejan ganadores pendientes', () => {
  const ids = Array.from({ length: 5 }, (_, index) => `equipo-${index}`);
  const groups = drawGroups(ids, 2);
  assert.deepEqual(groups, [[ids[0], ids[3], ids[4]], [ids[1], ids[2]]]);
  assert.equal(new Set(groups.flat()).size, 5);
  const bracket = knockoutBracket(ids);
  assert.equal(bracket.length, 7);
  assert.equal(bracket.filter((slot) => slot.stage === 1 && slot.homeEntryId && slot.awayEntryId).length, 1);
  assert.equal(bracket.filter((slot) => slot.stage === 1 && (slot.homeEntryId || slot.awayEntryId) && !(slot.homeEntryId && slot.awayEntryId)).length, 3);
  assert.equal(bracket.filter((slot) => slot.stage > 1 && slot.homeEntryId === null && slot.awayEntryId === null).length, 3);
});

test('T04: el plan versionado valida clasificación y muestra octavos, cuartos, semis y final sin ganador supuesto', () => {
  const plan = { qualification: { from: 'groups' as const, perGroup: 2, bestRemaining: 0 }, bracketSize: 16, rounds: [16,8,4,2].map((size,index) => ({ size, pairing: index === 1 ? 'draw' as const : 'positions' as const, legs: index === 3 ? 1 as const : 2 as const })) };
  const rules = { ...fiveRules, initialPhase: { mode: 'groups' as const, legs: 1 as const, groupCount: 8 }, competitionPlan: plan };
  assert.equal(ruleSchema.safeParse(rules).success, true);
  const rounds = previewCompetitionBracket(plan, 8);
  assert.deepEqual(rounds.map((round) => round.name), ['Octavos de final','Cuartos de final','Semifinales','Final']);
  assert.deepEqual([rounds[0].ties[0].home, rounds[0].ties[0].away], ['1.º Grupo 1','2.º Grupo 8']);
  assert.equal(rounds[1].ties[0].home, 'Ganador por sortear');
  assert.equal(ruleSchema.safeParse({ ...rules, competitionPlan: { ...plan, bracketSize: 8 } }).success, false);
  assert.equal(ruleSchema.safeParse({ ...rules, competitionPlan: { ...plan, qualification: { from: 'league', top: 8 } } }).success, false);
  assert.equal(ruleSchema.safeParse({ ...rules, competitionPlan: { ...plan, rounds: plan.rounds.slice(1) } }).success, false);
  assert.equal(knockoutBracket(['a','b','c','d','e','f'],8).filter((slot) => slot.stage === 1).length, 4);
  const seeded = knockoutBracket(['1','2','3','4','5','6','7','8']);
  assert.deepEqual(seeded.filter((slot) => slot.stage === 2).map((slot) => [slot.homeSourceSlot,slot.awaySourceSlot]), [[1,4],[2,3]]);
  assert.deepEqual(seeded.filter((slot) => slot.stage === 3).map((slot) => [slot.homeSourceSlot,slot.awaySourceSlot]), [[1,2]]);
  const repechage = { qualification: { from: 'direct' as const, entrants: 6 }, bracketSize: 8, repechage: true, rounds: [{ size: 8, pairing: 'positions' as const, legs: 1 as const }, { size: 4, pairing: 'positions' as const, legs: 1 as const }, { size: 2, pairing: 'positions' as const, legs: 1 as const }] };
  assert.equal(ruleSchema.safeParse({ ...fiveRules, initialPhase: { mode: 'knockout', legs: 1, groupCount: null }, competitionPlan: repechage }).success, true);
  assert.equal(previewCompetitionBracket(repechage, null)[0].name, 'Repechaje');
  assert.deepEqual(knockoutBracket(['1','2','3','4','5','6'],8).filter(slot=>slot.stage===1 && !slot.awayEntryId).map(slot=>slot.homeEntryId), ['1','2']);
});

test('T04: copa directa respeta participantes, sortea una vez y espera nuevo sorteo sin fijar rivales', async () => {
  const plan = { qualification: { from: 'direct' as const, entrants: 6 }, bracketSize: 8, rounds: [{ size: 8, pairing: 'draw' as const, legs: 1 as const }, { size: 4, pairing: 'draw' as const, legs: 2 as const }, { size: 2, pairing: 'positions' as const, legs: 1 as const }] };
  const rules: RuleConfig = { ...fiveRules, initialPhase: { mode: 'knockout', legs: 1, groupCount: null }, competitionPlan: plan };
  const created = await newTournament(ids.a, rules); assert.equal(created.response.statusCode, 201, created.response.body);
  const category = created.response.json().categoryId, base = `/organizations/${ids.a}/categories/${category}/fixture`;
  const entries: string[] = [];
  for (let number = 0; number < 5; number++) { const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Copa plan ${number} ${runId}`, color: '#165D46', categoryId: category }); assert.equal(team.statusCode, 201); entries.push(team.json().entryId); }
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/rules/publish`, { reason: 'Plan de copa directa', expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request(adminB, 'GET', base)).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${base}/phase`, {})).statusCode, 201);
  const premature = await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 }); assert.equal(premature.json().code, 'PARTICIPANT_COUNT');
  const last = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Copa plan sexto ${runId}`, color: '#165D46', categoryId: category }); assert.equal(last.statusCode, 201); entries.push(last.json().entryId);
  assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).statusCode, 201);
  const overview = (await request(adminA, 'GET', base)).json();
  assert.equal(overview.bracket.length, 4);
  assert.equal(overview.bracket.filter((slot: { match_id: string | null }) => slot.match_id).length, 2);
  assert.equal(overview.bracket.filter((slot: { stage: number }) => slot.stage > 1).length, 0);
  assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).json().reused, true);
  const { rows: [draw] } = await pool.query("SELECT after_data FROM audit_logs WHERE organization_id=$1 AND resource_id=$2 AND action='fixture.draw_completed'", [ids.a, overview.phase.id]);
  assert.equal(draw.after_data.entryOrder.length, 6);
  assert.equal(new Set(draw.after_data.entryOrder).size, 6);
  for (const entry of entries) assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entry}/publication`, { publicVisible: true, reason: 'Cuadro sintético autorizado' })).statusCode, 200);
  const venue = await request(adminA, 'POST', `/organizations/${ids.a}/tournaments/${created.response.json().tournamentId}/venues`, { name: `Sede plan ${runId}`, city: null }); assert.equal(venue.statusCode, 201);
  const day = await request(adminA, 'POST', `/organizations/${ids.a}/editions/${created.response.json().editionId}/matchdays`, { ordinal: 1 }); assert.equal(day.statusCode, 201);
  const firstMatches = overview.rounds.flatMap((round: { matches: Array<{ id: string }> }) => round.matches);
  for (let index = 0; index < firstMatches.length; index++) assert.equal((await request(adminA, 'PATCH', `/organizations/${ids.a}/fixture/matches/${firstMatches[index].id}/schedule`, { matchdayId: day.json().id, venueId: venue.json().id, courtLabel: 'Principal', date: '2026-11-14', time: index ? '11:00' : '10:00', durationMinutes: 60, refereeName: null, expectedRevision: 0, reason: 'Cuadro planificado' })).statusCode, 200);
  const preview = await request(adminA, 'GET', `/organizations/${ids.a}/matchdays/${day.json().id}/preview`); assert.deepEqual(preview.json().missing, []);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/matchdays/${day.json().id}/publish`, { expectedRevision: preview.json().revision, reason: 'Cuadro planificado visible' })).statusCode, 201);
  const published = (await app.inject(`/api/v1/public/organizations/${ids.a}/brackets`)).json().find((item: { tournament_name: string }) => item.tournament_name === created.body.name);
  assert.equal(published.slots.length, 7);
  assert.equal(published.slots.filter((slot: { stage: number }) => slot.stage === 1).length, 4);
  assert.ok(published.slots.filter((slot: { stage: number; matchId: string | null }) => slot.stage === 1 && slot.matchId).every((slot: { matchId: string; matchIds: { first: string } }) => firstMatches.some((match: { id: string }) => match.id === slot.matchId && match.id === slot.matchIds.first)));
  assert.ok(published.slots.filter((slot: { stage: number }) => slot.stage > 1).every((slot: { matchId: string | null }) => slot.matchId === null));
  assert.equal(published.slots.find((slot: { stage: number }) => slot.stage === 2).home, 'Ganador por sortear');
  assert.equal((await request(adminB,'POST',`${base}/advance`,{reason:'Intento ajeno'})).statusCode,403);
  const pending=await request(adminA,'POST',`${base}/advance`,{reason:'Revisar actas sintéticas'});
  assert.equal(pending.statusCode,200,pending.body);assert.equal(pending.json().status,'pending');
  for(const fixture of firstMatches){
    const {rows:[match]}=await pool.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE id=$1',[fixture.id]);
    const homeLineup=randomUUID(),awayLineup=randomUUID(),recordId=randomUUID(),snapshotId=randomUUID();
    for(const [lineupId,entryId] of [[homeLineup,match.home_entry_id],[awayLineup,match.away_entry_id]])await pool.query(`INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason)
      VALUES($1,$2,$3,$4,1,'approved',$5,1,1,'Planilla sintética',$6,$6,now(),$6,now(),'Revisión sintética')`,[lineupId,ids.a,fixture.id,entryId,JSON.stringify({players:[],staffIds:[]}),ids.adminA]);
    await pool.query("INSERT INTO match_records(id,organization_id,match_id,status,rule_version,home_lineup_id,away_lineup_id,started_by) VALUES($1,$2,$3,'official',1,$4,$5,$6)",[recordId,ids.a,fixture.id,homeLineup,awayLineup,ids.adminA]);
    await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,1,'approved',0,$4,'Acta sintética',$5)",[snapshotId,ids.a,fixture.id,JSON.stringify({score:{home:0,away:0},shootout:{home:1,away:0},events:[]}),ids.adminA]);
    await pool.query('UPDATE match_records SET approval_id=$2 WHERE id=$1',[recordId,snapshotId]);
  }
  const advanced=await request(adminA,'POST',`${base}/advance`,{reason:'Sorteo tras actas oficiales sintéticas'});
  assert.equal(advanced.statusCode,200,advanced.body);assert.equal(advanced.json().stage,2);assert.equal(advanced.json().matches,2);
  const next=(await request(adminA,'GET',base)).json();assert.equal(next.bracket.filter((slot:any)=>slot.stage===2&&slot.match_id&&slot.return_match_id).length,2);
  assert.equal((await request(adminA,'POST',`${base}/advance`,{reason:'Reintento de avance'})).json().status,'pending');
  const changedFixture=firstMatches[0],{rows:[firstMatch]}=await pool.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE id=$1',[changedFixture.id]);
  const {rows:[sourceSlot]}=await pool.query('SELECT id FROM fixture_bracket_slots WHERE organization_id=$1 AND match_id=$2',[ids.a,changedFixture.id]);
  const {rows:[downstreamSlot]}=await pool.query('SELECT match_id,return_match_id FROM fixture_bracket_slots WHERE organization_id=$1 AND (home_source_id=$2 OR away_source_id=$2)',[ids.a,sourceSlot.id]);
  const {rows:[beforeDownstream]}=await pool.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE id=$1',[downstreamSlot.match_id]);
  const submissionId=randomUUID();
  await pool.query("INSERT INTO match_record_events(id,organization_id,match_id,sequence,client_event_id,kind,team_entry_id,recorded_by) VALUES($1,$2,$3,1,$4,'goal',$5,$6)",[randomUUID(),ids.a,changedFixture.id,randomUUID(),firstMatch.away_entry_id,ids.adminA]);
  await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,2,'submitted',1,$4,'Rectificación sintética',$5)",[submissionId,ids.a,changedFixture.id,JSON.stringify({score:{home:0,away:1},shootout:{home:0,away:0},events:[]}),ids.adminA]);
  await pool.query("UPDATE match_records SET status='submitted',revision=1,submission_id=$2 WHERE organization_id=$1 AND match_id=$3",[ids.a,submissionId,changedFixture.id]);
  const corrected=await request(adminA,'POST',`/organizations/${ids.a}/matches/${changedFixture.id}/acta/approve`,{reason:'Rectificación del ganador antes de programar',overrideSignoffs:true});
  assert.equal(corrected.statusCode,201,corrected.body);assert.equal(corrected.json().bracketReassigned,2);
  const {rows:[afterDownstream]}=await pool.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE id=$1',[downstreamSlot.match_id]);
  assert.notDeepEqual(afterDownstream,beforeDownstream);assert.ok([afterDownstream.home_entry_id,afterDownstream.away_entry_id].includes(firstMatch.away_entry_id));
  const nextDay=await request(adminA,'POST',`/organizations/${ids.a}/editions/${created.response.json().editionId}/matchdays`,{ordinal:2});assert.equal(nextDay.statusCode,201,nextDay.body);
  const nextSchedule=await request(adminA,'PATCH',`/organizations/${ids.a}/fixture/matches/${downstreamSlot.match_id}/schedule`,{matchdayId:nextDay.json().id,venueId:venue.json().id,courtLabel:'Principal',date:'2026-11-21',time:'10:00',durationMinutes:60,refereeName:null,expectedRevision:0,reason:'Programación posterior sintética'});assert.equal(nextSchedule.statusCode,200,nextSchedule.body);
  const nextPreview=await request(adminA,'GET',`/organizations/${ids.a}/matchdays/${nextDay.json().id}/preview`);assert.deepEqual(nextPreview.json().missing,[]);
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/matchdays/${nextDay.json().id}/publish`,{expectedRevision:nextPreview.json().revision,reason:'Publicación posterior sintética'})).statusCode,201);
  const {rows:[goal]}=await pool.query("SELECT id FROM match_record_events WHERE organization_id=$1 AND match_id=$2 AND kind='goal'",[ids.a,changedFixture.id]);
  await pool.query("INSERT INTO match_record_events(id,organization_id,match_id,sequence,client_event_id,kind,voids_event_id,reason,recorded_by) VALUES($1,$2,$3,2,$4,'void',$5,'Corrección sintética',$6)",[randomUUID(),ids.a,changedFixture.id,randomUUID(),goal.id,ids.adminA]);
  await pool.query("INSERT INTO match_record_events(id,organization_id,match_id,sequence,client_event_id,kind,team_entry_id,recorded_by) VALUES($1,$2,$3,3,$4,'shootout_goal',$5,$6)",[randomUUID(),ids.a,changedFixture.id,randomUUID(),firstMatch.home_entry_id,ids.adminA]);
  const secondSubmission=randomUUID();
  await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,4,'submitted',3,$4,'Segunda rectificación sintética',$5)",[secondSubmission,ids.a,changedFixture.id,JSON.stringify({score:{home:0,away:0},shootout:{home:1,away:0},events:[]}),ids.adminA]);
  await pool.query("UPDATE match_records SET status='submitted',revision=3,submission_id=$2 WHERE organization_id=$1 AND match_id=$3",[ids.a,secondSubmission,changedFixture.id]);
  assert.equal((await request(adminB,'POST',`/organizations/${ids.a}/matches/${changedFixture.id}/acta/approve`,{reason:'Intento ajeno de rectificación',overrideSignoffs:true})).statusCode,403);
  const correctedPublished=await request(adminA,'POST',`/organizations/${ids.a}/matches/${changedFixture.id}/acta/approve`,{reason:'Rectificación con Fecha posterior publicada',overrideSignoffs:true});
  assert.equal(correctedPublished.statusCode,201,correctedPublished.body);assert.equal(correctedPublished.json().correctedMatchdays,1);
  const {rows:[publication]}=await pool.query("SELECT event_kind FROM fixture_outbox o JOIN matchday_publications p ON p.id=o.publication_id WHERE p.organization_id=$1 AND p.matchday_id=$2 ORDER BY p.revision DESC LIMIT 1",[ids.a,nextDay.json().id]);assert.equal(publication.event_kind,'matchday.corrected');
  const publicNext=(await app.inject(`/api/v1/public/organizations/${ids.a}/fixture`)).json().find((day:{id:string})=>day.id===nextDay.json().id);
  assert.equal(publicNext.matches.length,1);
  const {rows:[fixedDownstream]}=await pool.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE id=$1',[downstreamSlot.match_id]);assert.deepEqual(fixedDownstream,beforeDownstream);
  await pool.query(`INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason)
    VALUES($1,$2,$3,$4,1,'approved',$5,1,1,'Planilla posterior sintética',$6,$6,now(),$6,now(),'Revisión sintética')`,[randomUUID(),ids.a,downstreamSlot.match_id,fixedDownstream.home_entry_id,JSON.stringify({players:[],staffIds:[]}),ids.adminA]);
  await pool.query("INSERT INTO match_record_events(id,organization_id,match_id,sequence,client_event_id,kind,team_entry_id,recorded_by) VALUES($1,$2,$3,4,$4,'goal',$5,$6)",[randomUUID(),ids.a,changedFixture.id,randomUUID(),firstMatch.away_entry_id,ids.adminA]);
  const blockedSubmission=randomUUID();
  await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,6,'submitted',4,$4,'Tercera rectificación sintética',$5)",[blockedSubmission,ids.a,changedFixture.id,JSON.stringify({score:{home:0,away:1},shootout:{home:1,away:0},events:[]}),ids.adminA]);
  await pool.query("UPDATE match_records SET status='submitted',revision=4,submission_id=$2 WHERE organization_id=$1 AND match_id=$3",[ids.a,blockedSubmission,changedFixture.id]);
  const blocked=await request(adminA,'POST',`/organizations/${ids.a}/matches/${changedFixture.id}/acta/approve`,{reason:'No alterar planilla posterior',overrideSignoffs:true});assert.equal(blocked.statusCode,409,blocked.body);assert.equal(blocked.json().code,'BRACKET_DOWNSTREAM_LOCKED');
});

test('T04: repechaje usa el orden explícito de posiciones y niega otra organización', async () => {
  const plan = { qualification: { from: 'direct' as const, entrants: 6 }, bracketSize: 8, repechage: true, rounds: [{size:8,pairing:'positions' as const,legs:1 as const},{size:4,pairing:'positions' as const,legs:1 as const},{size:2,pairing:'positions' as const,legs:1 as const}] };
  const created = await newTournament(ids.a,{...fiveRules,initialPhase:{mode:'knockout',legs:1,groupCount:null},competitionPlan:plan});
  assert.equal(created.response.statusCode,201,created.response.body);
  const category = created.response.json().categoryId, base = `/organizations/${ids.a}/categories/${category}/fixture`, seedOrder:string[]=[];
  for (let index=0;index<6;index++) {
    const team=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Siembra ${index} ${randomUUID().slice(0,4)}`,color:'#165D46',categoryId:category});
    assert.equal(team.statusCode,201,team.body); seedOrder.unshift(team.json().entryId);
  }
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${category}/rules/publish`,{reason:'Copa con repechaje',expectedRevision:1})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${base}/phase`,{})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${base}/generate`,{expectedRevision:1})).json().code,'SEED_ORDER_REQUIRED');
  assert.equal((await request(adminB,'POST',`${base}/generate`,{expectedRevision:1,seedOrder})).statusCode,403);
  assert.equal((await request(adminA,'POST',`${base}/generate`,{expectedRevision:1,seedOrder})).statusCode,201);
  const bracket=(await request(adminA,'GET',base)).json().bracket;
  const first=bracket.filter((slot:{stage:number})=>slot.stage===1);
  assert.deepEqual(first.slice(0,2).map((slot:{home_entry_id:string;away_entry_id:string|null})=>[slot.home_entry_id,slot.away_entry_id]),[[seedOrder[0],null],[seedOrder[1],null]]);
  assert.deepEqual(first.slice(2).map((slot:{home_entry_id:string;away_entry_id:string})=>[slot.home_entry_id,slot.away_entry_id]),[[seedOrder[2],seedOrder[5]],[seedOrder[3],seedOrder[4]]]);
  const second=bracket.filter((slot:{stage:number})=>slot.stage===2);
  assert.deepEqual(second.map((slot:{home_source_id:string;away_source_id:string})=>[slot.home_source_id,slot.away_source_id]),[[first[0].id,first[3].id],[first[1].id,first[2].id]]);
});

test('T04: liga clasifica desde todas las actas oficiales y crea final privada una vez', async () => {
  const rules:RuleConfig={...fiveRules,initialPhase:{mode:'league',legs:1,groupCount:null},competitionPlan:{qualification:{from:'league',top:2},bracketSize:2,rounds:[{size:2,pairing:'positions',legs:1}]}};
  const created=await newTournament(ids.a,rules);assert.equal(created.response.statusCode,201,created.response.body);
  const category=created.response.json().categoryId,base=`/organizations/${ids.a}/categories/${category}/fixture`;
  const entries:string[]=[];
  for(let n=0;n<4;n++){const team=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Liga avance ${n} ${runId}`,color:'#165D46',categoryId:category});assert.equal(team.statusCode,201,team.body);entries.push(team.json().entryId);}
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${category}/rules/publish`,{reason:'Liga sintética con final',expectedRevision:1})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${base}/phase`,{})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${base}/generate`,{expectedRevision:1})).statusCode,201);
  const initial=(await request(adminA,'GET',base)).json().rounds.flatMap((round:{matches:Array<{id:string;home_entry_id:string;away_entry_id:string}>})=>round.matches);
  assert.equal(initial.length,6);
  assert.equal((await request(adminA,'POST',`${base}/advance`,{reason:'Aún faltan resultados'})).json().code,'MATCHES_PENDING');
  for(const fixture of initial){
    const homeLineup=randomUUID(),awayLineup=randomUUID(),recordId=randomUUID(),snapshotId=randomUUID();
    for(const [lineupId,entryId] of [[homeLineup,fixture.home_entry_id],[awayLineup,fixture.away_entry_id]])await pool.query(`INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason)
      VALUES($1,$2,$3,$4,1,'approved',$5,1,1,'Planilla sintética',$6,$6,now(),$6,now(),'Revisión sintética')`,[lineupId,ids.a,fixture.id,entryId,JSON.stringify({players:[],staffIds:[]}),ids.adminA]);
    const homeWins=entries.indexOf(fixture.home_entry_id)<entries.indexOf(fixture.away_entry_id);
    await pool.query("INSERT INTO match_records(id,organization_id,match_id,status,rule_version,home_lineup_id,away_lineup_id,started_by) VALUES($1,$2,$3,'official',1,$4,$5,$6)",[recordId,ids.a,fixture.id,homeLineup,awayLineup,ids.adminA]);
    const goal={id:randomUUID(),sequence:1,kind:'goal',teamEntryId:homeWins?fixture.home_entry_id:fixture.away_entry_id,registrationId:null,relatedRegistrationId:null,period:'PT',minute:null,windowNo:null,incidentNote:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()};
    await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,1,'approved',1,$4,'Acta sintética',$5)",[snapshotId,ids.a,fixture.id,JSON.stringify({score:{home:homeWins?1:0,away:homeWins?0:1},shootout:{home:0,away:0},events:[goal]}),ids.adminA]);
    await pool.query('UPDATE match_records SET approval_id=$2 WHERE id=$1',[recordId,snapshotId]);
  }
  assert.equal((await request(adminB,'POST',`${base}/advance`,{reason:'Intento ajeno'})).statusCode,403);
  const advanced=await request(adminA,'POST',`${base}/advance`,{reason:'Clasificación desde la tabla oficial'});
  assert.equal(advanced.statusCode,200,advanced.body);assert.equal(advanced.json().qualified,2);
  const bracket=(await request(adminA,'GET',base)).json().bracket;assert.equal(bracket.length,1);
  const {rows:[final]}=await pool.query('SELECT home_entry_id,away_entry_id FROM draft_matches WHERE id=$1',[bracket[0].match_id]);
  assert.deepEqual(new Set([final.home_entry_id,final.away_entry_id]),new Set(entries.slice(0,2)));
  assert.equal((await request(adminA,'POST',`${base}/advance`,{reason:'Reintento sin acta final'})).json().status,'pending');
  assert.equal((await request(adminA,'GET',base)).json().bracket.length,1);
});

test('T04: mejores restantes empatados se ordenan con motivo y huella vigente',async()=>{
  const rules:RuleConfig={...fiveRules,initialPhase:{mode:'groups',legs:1,groupCount:2},competitionPlan:{qualification:{from:'groups',perGroup:1,bestRemaining:1},bracketSize:4,rounds:[{size:4,pairing:'positions',legs:1},{size:2,pairing:'positions',legs:1}]}};
  const made=await newTournament(ids.a,rules);assert.equal(made.response.statusCode,201,made.response.body);
  const category=made.response.json().categoryId,base=`/organizations/${ids.a}/categories/${category}/fixture`;
  for(let n=0;n<6;n++)assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Corte ${n} ${runId}`,color:'#165D46',categoryId:category})).statusCode,201);
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${category}/rules/publish`,{reason:'Corte sintético entre grupos',expectedRevision:1})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${base}/phase`,{})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${base}/generate`,{expectedRevision:1})).statusCode,201);
  const fixture=(await request(adminA,'GET',base)).json();
  const grouped=new Map<number,string[]>();for(const row of fixture.groups as Array<{group_no:number;entry_id:string}>){const list=grouped.get(row.group_no)||[];list.push(row.entry_id);grouped.set(row.group_no,list);}
  for(const list of grouped.values())list.sort();
  const rank=new Map([...grouped.values()].flatMap(list=>list.map((id,index)=>[id,index] as const)));
  const matches=fixture.rounds.flatMap((round:{matches:Array<{id:string;home_entry_id:string;away_entry_id:string}>})=>round.matches);assert.equal(matches.length,6);
  for(const fixtureMatch of matches){
    const homeLineup=randomUUID(),awayLineup=randomUUID(),record=randomUUID(),snapshot=randomUUID();
    for(const [lineupId,entryId] of [[homeLineup,fixtureMatch.home_entry_id],[awayLineup,fixtureMatch.away_entry_id]])await pool.query(`INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason)
      VALUES($1,$2,$3,$4,1,'approved',$5,1,1,'Planilla sintética',$6,$6,now(),$6,now(),'Revisión sintética')`,[lineupId,ids.a,fixtureMatch.id,entryId,JSON.stringify({players:[],staffIds:[]}),ids.adminA]);
    const homeWins=rank.get(fixtureMatch.home_entry_id)!<rank.get(fixtureMatch.away_entry_id)!;
    const goal={id:randomUUID(),sequence:1,kind:'goal',teamEntryId:homeWins?fixtureMatch.home_entry_id:fixtureMatch.away_entry_id,registrationId:null,relatedRegistrationId:null,period:'PT',minute:null,windowNo:null,incidentNote:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()};
    await pool.query("INSERT INTO match_records(id,organization_id,match_id,status,rule_version,home_lineup_id,away_lineup_id,started_by) VALUES($1,$2,$3,'official',1,$4,$5,$6)",[record,ids.a,fixtureMatch.id,homeLineup,awayLineup,ids.adminA]);
    await pool.query("INSERT INTO match_acta_snapshots(id,organization_id,match_id,version,kind,event_revision,snapshot,reason,created_by) VALUES($1,$2,$3,1,'approved',1,$4,'Acta sintética',$5)",[snapshot,ids.a,fixtureMatch.id,JSON.stringify({score:{home:homeWins?1:0,away:homeWins?0:1},shootout:{home:0,away:0},events:[goal]}),ids.adminA]);
    await pool.query('UPDATE match_records SET approval_id=$2 WHERE id=$1',[record,snapshot]);
  }
  const tie=await request(adminA,'POST',`${base}/advance`,{reason:'Empate de mejores restantes'});assert.equal(tie.statusCode,200,tie.body);assert.equal(tie.json().status,'tie');assert.equal(tie.json().candidates.length,2);
  const order=tie.json().candidates.map((row:{entryId:string})=>row.entryId).reverse();
  assert.equal((await request(adminB,'POST',`${base}/advance`,{reason:'Decisión ajena',manualOrder:order,sourceKey:tie.json().sourceKey})).statusCode,403);
  assert.equal((await request(adminA,'POST',`${base}/advance`,{reason:'Tabla obsoleta',manualOrder:order,sourceKey:'0'.repeat(64)})).json().code,'QUALIFICATION_CHANGED');
  const advanced=await request(adminA,'POST',`${base}/advance`,{reason:'Sorteo documentado del corte empatado',manualOrder:order,sourceKey:tie.json().sourceKey});assert.equal(advanced.statusCode,200,advanced.body);assert.equal(advanced.json().status,'generated');
  const {rows:[auditRow]}=await pool.query("SELECT after_data FROM audit_logs WHERE organization_id=$1 AND resource_id=$2 AND action='fixture.qualification_generated' ORDER BY created_at DESC LIMIT 1",[ids.a,fixture.phase.id]);assert.deepEqual(auditRow.after_data.manualOrder,order);
});

test('T04: grupos planificados bloquean un fixture que no puede completar sus clasificados', async () => {
  const plan = { qualification: { from: 'groups' as const, perGroup: 3, bestRemaining: 0 }, bracketSize: 8, rounds: [{ size: 8, pairing: 'positions' as const, legs: 1 as const }, { size: 4, pairing: 'draw' as const, legs: 1 as const }, { size: 2, pairing: 'positions' as const, legs: 1 as const }] };
  const rules: RuleConfig = { ...fiveRules, initialPhase: { mode: 'groups', legs: 1, groupCount: 2 }, competitionPlan: plan };
  const created = await newTournament(ids.a, rules); assert.equal(created.response.statusCode, 201, created.response.body);
  const category = created.response.json().categoryId, base = `/organizations/${ids.a}/categories/${category}/fixture`;
  for (let number = 0; number < 4; number++) assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Grupo plan ${number} ${runId}`, color: '#165D46', categoryId: category })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/rules/publish`, { reason: 'Plan de clasificación sintético', expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', `${base}/phase`, {})).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).json().code, 'QUALIFICATION_TEAMS');
  for (let number = 4; number < 6; number++) assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Grupo plan ${number} ${runId}`, color: '#165D46', categoryId: category })).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).statusCode, 201);
  assert.equal((await request(adminB, 'GET', base)).statusCode, 403);
});

test('T04: grupos y eliminación generan llaves privadas sin inventar ganador', async () => {
  for (const mode of ['groups','knockout'] as const) {
    const rules: RuleConfig = { ...fiveRules, initialPhase: { mode, legs: mode === 'knockout' ? 2 : 1, groupCount: mode === 'groups' ? 2 : null } };
    const created = await newTournament(ids.a, rules); assert.equal(created.response.statusCode, 201, created.response.body);
    const category = created.response.json().categoryId, editionId = created.response.json().editionId, tournamentId = created.response.json().tournamentId;
    const base = `/organizations/${ids.a}/categories/${category}/fixture`;
    const entries: string[] = [];
    for (let n = 0; n < (mode === 'groups' ? 6 : 5); n++) {
      const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `${mode} ${n} ${runId}`, color: '#165D46', categoryId: category });
      assert.equal(team.statusCode, 201, team.body); entries.push(team.json().entryId);
    }
    assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/rules/publish`, { reason: 'Formato sintético de prueba', expectedRevision: 1 })).statusCode, 200);
    if (mode === 'knockout') for (const entry of entries) assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/entries/${entry}/publication`, { publicVisible: true, reason: 'Autorización sintética para cuadro' })).statusCode, 200);
    assert.equal((await request(adminB, 'GET', base)).statusCode, 403);
    const phase = await request(adminA, 'POST', `${base}/phase`, {}); assert.equal(phase.statusCode, 201, phase.body);
    assert.equal(phase.json().mode, mode);
    assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).statusCode, 201);
    const overview = (await request(adminA, 'GET', base)).json();
    assert.equal(overview.phase.status, 'generated');
    if (mode === 'groups') {
      assert.equal(overview.groups.length, 6);
      assert.equal(new Set(overview.groups.map((entry: { group_no: number }) => entry.group_no)).size, 2);
      assert.equal(overview.rounds.flatMap((round: { matches: unknown[] }) => round.matches).length, 6);
      const earlyStats=await request(adminA,'GET',`/organizations/${ids.a}/categories/${category}/statistics`);
      assert.equal(earlyStats.statusCode,200,earlyStats.body);assert.equal(earlyStats.json().officialMatches,0);assert.equal(earlyStats.json().tables.length,2);
      assert.ok(earlyStats.json().tables.every((table:{totals:Array<{played:number}>})=>table.totals.every(total=>total.played===0)));
    } else {
      assert.equal(overview.bracket.length, 7);
      assert.equal(overview.bracket.filter((slot: { match_id: string | null }) => slot.match_id).length, 1);
      assert.equal(overview.bracket.filter((slot: { return_match_id: string | null }) => slot.return_match_id).length, 1);
      assert.equal(overview.bracket.filter((slot: { stage: number; match_id: string | null }) => slot.stage > 1 && !slot.match_id).length, 3);
      assert.equal(overview.rounds.flatMap((round: { matches: unknown[] }) => round.matches).length, 2);
      const publicBrackets = `/api/v1/public/organizations/${ids.a}/brackets`;
      assert.equal((await app.inject(publicBrackets)).json().some((item: { category_name: string; tournament_name: string }) => item.category_name === 'Libre' && item.tournament_name === created.body.name), false);
      const venue = await request(adminA, 'POST', `/organizations/${ids.a}/tournaments/${tournamentId}/venues`, { name: `Sede cuadro ${runId}`, city: null }); assert.equal(venue.statusCode, 201);
      const day = await request(adminA, 'POST', `/organizations/${ids.a}/editions/${editionId}/matchdays`, { ordinal: 1 }); assert.equal(day.statusCode, 201);
      const matches = overview.rounds.flatMap((round: { matches: Array<{ id: string }> }) => round.matches);
      for (let index = 0; index < matches.length; index++) {
        const scheduled = await request(adminA, 'PATCH', `/organizations/${ids.a}/fixture/matches/${matches[index].id}/schedule`, { matchdayId: day.json().id, venueId: venue.json().id, courtLabel: 'Principal', date: '2026-11-12', time: index ? '11:00' : '10:00', durationMinutes: 60, refereeName: null, expectedRevision: 0, reason: 'Horario inicial de cuadro' });
        assert.equal(scheduled.statusCode, 200, scheduled.body);
      }
      const preview = await request(adminA, 'GET', `/organizations/${ids.a}/matchdays/${day.json().id}/preview`); assert.deepEqual(preview.json().missing, []);
      assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/matchdays/${day.json().id}/publish`, { expectedRevision: preview.json().revision, reason: 'Cuadro inicial publicado' })).statusCode, 201);
      const published = (await app.inject(publicBrackets)).json().find((item: { tournament_name: string }) => item.tournament_name === created.body.name);
      assert.equal(published.slots.length, 7); assert.ok(published.slots.some((slot: { home: string; away: string }) => slot.home.includes('Ganador de llave') || slot.away.includes('Ganador de llave')));
    }
  }
});

test('T04: organizador cambia equipos de un cruce futuro y otro ámbito no puede', async () => {
  const created = await newTournament(ids.a, fiveRules); assert.equal(created.response.statusCode, 201, created.response.body);
  const category = created.response.json().categoryId, base = `/organizations/${ids.a}/categories/${category}/fixture`;
  const entries: string[] = [];
  for (let index=0; index<3; index++) {
    const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Cambio ${index} ${randomUUID().slice(0,5)}`, color: '#165D46', categoryId: category });
    assert.equal(team.statusCode, 201, team.body); entries.push(team.json().entryId);
  }
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/rules/publish`, { reason: 'Publicación para cruces editables', expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request(adminA, 'POST', `${base}/phase`, {})).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).statusCode, 201);
  const overview = (await request(adminA, 'GET', base)).json();
  const match = overview.rounds[0].matches[0];
  const replacement = entries.find((entry) => entry !== match.home_entry_id && entry !== match.away_entry_id)!;
  const path = `/organizations/${ids.a}/fixture/matches/${match.id}/participants`;
  const change = { homeEntryId: match.home_entry_id, awayEntryId: replacement, reason: 'Cambio de participante del cruce' };
  assert.equal((await request(adminB, 'PATCH', path, change)).statusCode, 403);
  const saved = await request(adminA, 'PATCH', path, change); assert.equal(saved.statusCode, 200, saved.body);
  const after = (await request(adminA, 'GET', base)).json().rounds[0].matches.find((item: {id:string}) => item.id === match.id);
  assert.equal(after.away_entry_id, replacement);
});

test('T04: fase privada genera cruces una vez, con descansos y ámbito de organización', async () => {
  const rules: RuleConfig = { ...fiveRules, initialPhase: { mode: 'league', legs: 2, groupCount: null } };
  const created = await newTournament(ids.a, rules); assert.equal(created.response.statusCode, 201);
  const category = created.response.json().categoryId, base = `/organizations/${ids.a}/categories/${category}/fixture`;
  const entries: string[] = [];
  for (let number = 1; number <= 5; number++) {
    const team = await request(adminA, 'POST', `/organizations/${ids.a}/teams`, { requestId: randomUUID(), name: `Equipo fixture ${number} ${runId}`, color: '#165D46', categoryId: category });
    assert.equal(team.statusCode, 201, team.body); entries.push(team.json().entryId);
  }
  assert.equal((await request(adminB, 'GET', base)).statusCode, 403);
  assert.equal((await request(adminB, 'POST', `${base}/phase`, {})).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${base}/phase`, {})).json().code, 'CATEGORY_NOT_PUBLISHED');
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/rules/publish`, { reason: 'Liga sintética para fixture', expectedRevision: 1 })).statusCode, 200);
  assert.equal((await request(adminA, 'GET', base)).json().phase, null);
  const prepared = await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/draft-matches`, { homeEntryId: entries[0], awayEntryId: entries[1], matchDate: '2026-11-01' });
  assert.equal(prepared.statusCode, 201, prepared.body);
  const phase = await request(adminA, 'POST', `${base}/phase`, {}); assert.equal(phase.statusCode, 201, phase.body);
  const repeatedPhase = await request(adminA, 'POST', `${base}/phase`, {}); assert.equal(repeatedPhase.statusCode, 200); assert.equal(repeatedPhase.json().id, phase.json().id);
  assert.equal((await request(adminB, 'POST', `${base}/generate`, { expectedRevision: 1 })).statusCode, 403);
  const [first, second] = await Promise.all([request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 }), request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 201]);
  const fixture = (await request(adminA, 'GET', base)).json();
  assert.equal(fixture.phase.status, 'generated'); assert.equal(fixture.rounds.length, 10);
  assert.equal(fixture.rounds.flatMap((round: { matches: unknown[] }) => round.matches).length, 20);
  assert.equal(fixture.rounds.reduce((total: number, round: { byes: unknown[] }) => total + round.byes.length, 0), 10);
  assert.ok(fixture.rounds.every((round: { matches: Array<{ id: string; match_date: string | null }> }) => round.matches.every((match) => match.id === prepared.json().id || match.match_date === null)));
  assert.ok(fixture.rounds.some((round: { matches: Array<{ id: string; match_date: string | null }> }) => round.matches.some((match) => match.id === prepared.json().id && match.match_date === '2026-11-01')));
  const { rows: [stored] } = await pool.query('SELECT count(*)::int total FROM draft_matches WHERE organization_id=$1 AND fixture_phase_id=$2', [ids.a, phase.json().id]); assert.equal(stored.total, 20);
  assert.equal((await request(adminA, 'GET', `/organizations/${ids.a}/entries/${entries[0]}/draft-matches`)).json().length, 1);
  assert.equal((await request(adminA, 'POST', `/organizations/${ids.a}/categories/${category}/draft-matches`, { homeEntryId: entries[0], awayEntryId: entries[1], matchDate: '2026-11-01' })).json().code, 'FIXTURE_EXISTS');
});

test('Fixture simple: dos ruedas crean Fechas sin horario y permiten programar después',async()=>{
  const made=await newTournament(ids.a,{...fiveRules,initialPhase:{mode:'league',legs:1,groupCount:null}});
  assert.equal(made.response.statusCode,201,made.response.body);
  const {categoryId,editionId,tournamentId}=made.response.json(),root=`/organizations/${ids.a}`;
  for(let index=0;index<4;index++)assert.equal((await request(adminA,'POST',`${root}/teams`,{requestId:randomUUID(),name:`Sorteo simple ${index} ${runId}`,color:'#165D46',categoryId})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${root}/categories/${categoryId}/rules/publish`,{reason:'Fixture de muestra',expectedRevision:1})).statusCode,200);
  const base=`${root}/categories/${categoryId}/fixture`,phase=await request(adminA,'POST',`${base}/phase`,{});
  assert.equal(phase.statusCode,201,phase.body);
  assert.equal((await request(adminB,'POST',`${base}/generate`,{expectedRevision:phase.json().revision,legs:2,createMatchdays:true})).statusCode,403);
  const generated=await request(adminA,'POST',`${base}/generate`,{expectedRevision:phase.json().revision,legs:2,createMatchdays:true});
  assert.equal(generated.statusCode,201,generated.body);
  const days=await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`);
  assert.equal(days.statusCode,200,days.body);assert.equal(days.json().length,6);
  assert.ok(days.json().every((day:{matches:Array<{match_time:string}>})=>day.matches.length===2&&day.matches.every(match=>match.match_time==='')));
  const preview=await request(adminA,'GET',`${root}/matchdays/${days.json()[0].id}/preview`);
  assert.match(preview.json().missing.join(' '),/Programá día, hora y sede/);
  const venue=await request(adminA,'POST',`${root}/tournaments/${tournamentId}/venues`,{name:`Sede sorteo ${runId}`,city:null});
  assert.equal(venue.statusCode,201);
  const first=days.json()[0].matches[0],scheduled=await request(adminA,'PATCH',`${root}/fixture/matches/${first.id}/schedule`,{matchdayId:days.json()[0].id,venueId:venue.json().id,courtLabel:'Cancha 1',date:'2026-11-21',time:'10:00',durationMinutes:60,refereeName:null,expectedRevision:0,reason:'Horario de muestra'});
  assert.equal(scheduled.statusCode,200,scheduled.body);
  const secondDay=days.json()[1],batchPath=`${root}/matchdays/${secondDay.id}/schedule-batch`;
  const pair=(time:string,courtLabel:string)=>secondDay.matches.map((match:{id:string;schedule_revision:number})=>({matchId:match.id,schedule:{matchdayId:secondDay.id,venueId:venue.json().id,courtLabel,date:'2026-11-28',time,durationMinutes:60,refereeName:null,expectedRevision:match.schedule_revision,reason:'Fecha programada en lote'}}));
  assert.equal((await request(adminB,'POST',batchPath,{matches:pair('10:00','Cancha A')})).statusCode,403);
  assert.equal((await request(adminA,'POST',batchPath,{matches:pair('10:00','Cancha A')})).json().code,'SCHEDULE_CONFLICT');
  assert.ok((await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json()[1].matches.every((match:{match_time:string})=>!match.match_time));
  const valid=pair('10:00','Cancha A');valid[1].schedule.courtLabel='Cancha B';
  assert.equal((await request(adminA,'POST',batchPath,{matches:valid})).statusCode,200);
  assert.ok((await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json()[1].matches.every((match:{match_time:string})=>!!match.match_time));
});

test('T04: jornada multicategoría, conflictos, publicación única y reprogramación con historia', async () => {
  const created = await newTournament(); assert.equal(created.response.statusCode, 201, created.response.body);
  const { tournamentId, editionId, categoryId } = created.response.json();
  const root = `/organizations/${ids.a}`;
  const second = await request(adminA, 'POST', `${root}/tournaments/${tournamentId}/categories`, { requestId: randomUUID(), editionName: 'Temporada 2026', categoryName: 'Juvenil', preset: 'F5', teamLimit: 16, rules: fiveRules });
  assert.equal(second.statusCode, 201, second.body);
  const otherCategory = second.json().categoryId;
  for (const category of [categoryId, otherCategory]) assert.equal((await request(adminA, 'POST', `${root}/categories/${category}/rules/publish`, { reason: 'Fixture público sintético', expectedRevision: 1 })).statusCode, 200);
  for (const [category, count] of [[categoryId, 4], [otherCategory, 2]] as const) for (let n = 0; n < count; n++) {
    const team = await request(adminA, 'POST', `${root}/teams`, { requestId: randomUUID(), name: `Agenda ${category === categoryId ? 'A' : 'B'} ${n} ${runId}`, color: '#165D46', categoryId: category });
    assert.equal(team.statusCode, 201, team.body);
    assert.equal((await request(adminA, 'POST', `${root}/entries/${team.json().entryId}/publication`, { publicVisible: true, reason: 'Autorización sintética del equipo' })).statusCode, 200);
  }
  for (const category of [categoryId, otherCategory]) {
    const base = `${root}/categories/${category}/fixture`;
    assert.equal((await request(adminA, 'POST', `${base}/phase`, {})).statusCode, 201);
    assert.equal((await request(adminA, 'POST', `${base}/generate`, { expectedRevision: 1 })).statusCode, 201);
  }
  const dayPath = `${root}/editions/${editionId}/matchdays`;
  assert.equal((await request(adminB, 'GET', dayPath)).statusCode, 403);
  assert.equal((await request(adminB, 'POST', dayPath, { ordinal: 1 })).statusCode, 403);
  assert.equal((await request(teamA, 'POST', dayPath, { ordinal: 1 })).statusCode, 403);
  const madeDay = await request(adminA, 'POST', dayPath, { ordinal: 1 }); assert.equal(madeDay.statusCode, 201, madeDay.body);
  const dayId = madeDay.json().id;
  assert.equal((await request(adminA, 'POST', dayPath, { ordinal: 1 })).json().id, dayId);
  const venue = await request(adminA, 'POST', `${root}/tournaments/${tournamentId}/venues`, { name: `Sede agenda ${runId}`, city: null }); assert.equal(venue.statusCode, 201, venue.body);
  const firstFixture = (await request(adminA, 'GET', `${root}/categories/${categoryId}/fixture`)).json();
  const secondFixture = (await request(adminA, 'GET', `${root}/categories/${otherCategory}/fixture`)).json();
  const [one, two] = firstFixture.rounds[0].matches, three = secondFixture.rounds[0].matches[0];
  const sameTeamLater = firstFixture.rounds.slice(1).flatMap((round: { matches: any[] }) => round.matches).find((match: { home_entry_id: string; away_entry_id: string }) => match.home_entry_id === one.home_entry_id || match.away_entry_id === one.home_entry_id);
  const path = (matchId: string) => `${root}/fixture/matches/${matchId}/schedule`;
  const slot = (time: string, courtLabel: string, reason = 'Programación sintética') => ({ matchdayId: dayId, venueId: venue.json().id, courtLabel, date: '2026-11-07', time, durationMinutes: 60, refereeName: 'Árbitro sintético', expectedRevision: 0, reason });
  const refereePath=`${root}/fixture/referees`;
  assert.equal((await request(adminB,'GET',refereePath)).statusCode,403);
  assert.equal((await request(adminB,'POST',refereePath,{name:'Árbitro sintético'})).statusCode,403);
  const referee=await request(adminA,'POST',refereePath,{name:'Árbitro sintético'});assert.equal(referee.statusCode,201,referee.body);
  const foreignReferee=await request(adminB,'POST',`/organizations/${ids.b}/fixture/referees`,{name:'Árbitro de otra organización'});assert.equal(foreignReferee.statusCode,201,foreignReferee.body);
  assert.equal((await request(adminA,'GET',refereePath)).json().some((row:{id:string})=>row.id===referee.json().id),true);
  assert.equal((await request(adminA,'POST',`${path(one.id)}/preview`,{...slot('10:00','Cancha A'),refereeId:randomUUID()})).json().code,'REFEREE_NOT_FOUND');
  assert.equal((await request(adminA,'POST',`${path(one.id)}/preview`,{...slot('10:00','Cancha A'),refereeId:foreignReferee.json().id})).json().code,'REFEREE_NOT_FOUND');
  assert.equal((await request(adminB, 'POST', `${path(one.id)}/preview`, slot('10:00', 'Cancha A'))).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${path(one.id)}/preview`, slot('10:00', 'Cancha A'))).json().canSave, true);
  assert.equal((await request(adminA, 'PATCH', path(one.id), {...slot('10:00', 'Cancha A'),refereeId:referee.json().id})).statusCode, 200);
  assert.match((await request(adminA, 'POST', `${path(sameTeamLater.id)}/preview`, { ...slot('10:00', 'Cancha B'), refereeName: null })).json().conflicts.join(' '), /equipo/i);
  assert.match((await request(adminA, 'POST', `${path(two.id)}/preview`, { ...slot('10:00', 'Cancha B'), refereeName: 'Árbitro sintético' })).json().conflicts.join(' '), /árbitro/i);
  assert.match((await request(adminA,'POST',`${path(two.id)}/preview`,{...slot('10:00','Cancha B'),refereeId:referee.json().id,refereeName:'Otro nombre'})).json().conflicts.join(' '),/árbitro/i);
  const courtConflict = await request(adminA, 'POST', `${path(two.id)}/preview`, { ...slot('10:30', 'Cancha A'), refereeName: null });
  assert.equal(courtConflict.json().canSave, false); assert.match(courtConflict.json().conflicts.join(' '), /cancha/i);
  assert.equal((await request(adminA, 'PATCH', path(two.id), { ...slot('10:30', 'Cancha A'), refereeName: null })).json().code, 'SCHEDULE_CONFLICT');
  assert.equal((await request(adminA, 'PATCH', path(two.id), { ...slot('10:00', 'Cancha B'), refereeName: 'Otro árbitro' })).statusCode, 200);
  assert.equal((await request(adminA, 'PATCH', path(three.id), { ...slot('11:30', 'Cancha A'), refereeName: null })).statusCode, 200);
  const days = (await request(adminA, 'GET', dayPath)).json(); assert.equal(days.length, 1); assert.equal(days[0].matches.length, 3);
  assert.equal(new Set(days[0].matches.map((m: { category_id: string }) => m.category_id)).size, 2);
  const publicPath = `/api/v1/public/organizations/${ids.a}/fixture`;
  assert.equal((await app.inject(publicPath)).json().some((day: { id: string }) => day.id === dayId), false);
  const previewPath = `${root}/matchdays/${dayId}/preview`;
  const preview = await request(adminA, 'GET', previewPath); assert.equal(preview.statusCode, 200, preview.body); assert.deepEqual(preview.json().missing, []);
  assert.equal((await request(adminB, 'POST', `${root}/matchdays/${dayId}/publish`, { expectedRevision: preview.json().revision, reason: 'Intento externo' })).statusCode, 403);
  const published = await Promise.all([request(adminA, 'POST', `${root}/matchdays/${dayId}/publish`, { expectedRevision: preview.json().revision, reason: 'Publicación oficial sintética' }), request(adminA, 'POST', `${root}/matchdays/${dayId}/publish`, { expectedRevision: preview.json().revision, reason: 'Publicación oficial sintética' })]);
  assert.deepEqual(published.map((r) => r.statusCode).sort(), [200, 201]);
  assert.equal((await app.inject(publicPath)).json().find((day: { id: string }) => day.id === dayId).matches.length, 3);
  assert.equal('referee_name' in (await app.inject(publicPath)).json().find((day: { id: string }) => day.id === dayId).matches[0], false);
  assert.equal((await request(adminA, 'PATCH', path(sameTeamLater.id), { ...slot('16:00', 'Cancha B'), matchdayId: dayId })).json().code, 'MATCHDAY_PUBLISHED');
  const { rows: [before] } = await pool.query("SELECT count(*)::int total FROM fixture_outbox o JOIN matchday_publications p ON p.id=o.publication_id WHERE p.matchday_id=$1", [dayId]); assert.equal(before.total, 1);
  const fixtureStream=await buildApp(config,pool),fixtureAbort=new AbortController(),fixtureTimeout=setTimeout(()=>fixtureAbort.abort(),12000);
  let revised:Awaited<ReturnType<typeof request>>;
  try{
    const address=await fixtureStream.listen({host:'127.0.0.1',port:0});
    const response=await fetch(`${address}/api/v1/public/organizations/${ids.a}/results/stream`,{signal:fixtureAbort.signal});
    assert.equal(response.status,200);
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    assert.match(decoder.decode((await reader.read()).value),/event: ready/);
    revised=await request(adminA, 'PATCH', path(one.id), { ...slot('15:00', 'Cancha A', 'Lluvia sintética, se cambia el horario'), expectedRevision: 1 });
    let received='';
    while(!received.includes('event: fixture')){const chunk=await reader.read();if(chunk.done)break;received+=decoder.decode(chunk.value);}
    assert.match(received,/event: fixture/);
  }finally{clearTimeout(fixtureTimeout);fixtureAbort.abort();await fixtureStream.close();}
  assert.equal(revised.statusCode, 200, revised.body);
  const updated = (await app.inject(publicPath)).json().find((day: { id: string }) => day.id === dayId);
  assert.equal(updated.matches.find((m: { id: string }) => m.id === one.id).match_time, '15:00');
  const { rows: [history] } = await pool.query('SELECT count(*)::int total FROM match_schedule_history WHERE organization_id=$1 AND match_id=$2', [ids.a, one.id]); assert.equal(history.total, 2);
  const { rows: [afterPublication] } = await pool.query('SELECT count(*)::int total FROM matchday_publications WHERE organization_id=$1 AND matchday_id=$2', [ids.a, dayId]); assert.equal(afterPublication.total, 2);
  let processedEvents=0, batch=0;
  do {batch=await processFixtureOutbox(pool,1000);processedEvents+=batch;} while(batch>0 && processedEvents<100000);
  assert.ok(processedEvents>=2);
  const {rows:[processed]}=await pool.query('SELECT count(*)::int total FROM fixture_outbox o JOIN matchday_publications p ON p.id=o.publication_id WHERE p.matchday_id=$1 AND o.delivered_at IS NOT NULL',[dayId]);assert.equal(processed.total,2);
  assert.equal(await processFixtureOutbox(pool,1000),0);
  const { rows: [round] } = await pool.query('SELECT fixture_round_id FROM draft_matches WHERE organization_id=$1 AND id=$2', [ids.a, one.id]); assert.equal(round.fixture_round_id, firstFixture.rounds[0].id);
  const secondDay = await request(adminA, 'POST', dayPath, { ordinal: 2 }); assert.equal(secondDay.statusCode, 201);
  const twoLater = firstFixture.rounds.slice(1).flatMap((item: { matches: Array<{ id: string }> }) => item.matches).find((item: { id: string }) => item.id !== sameTeamLater.id)!;
  const concurrentSlot = { ...slot('18:00', 'Cancha C'), matchdayId: secondDay.json().id, refereeName: null };
  const concurrent = await Promise.all([request(adminA, 'PATCH', path(sameTeamLater.id), concurrentSlot), request(adminA, 'PATCH', path(twoLater.id), concurrentSlot)]);
  assert.deepEqual(concurrent.map((item) => item.statusCode).sort(), [200, 409]);
  assert.equal((await request(adminB,'POST',`${refereePath}/${referee.json().id}/archive`,{reason:'Ámbito ajeno'})).statusCode,403);
  assert.equal((await request(adminA,'POST',`${refereePath}/${referee.json().id}/archive`,{reason:'Cierre sintético del catálogo'})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${path(three.id)}/preview`,{...slot('20:00','Cancha D'),refereeId:referee.json().id,expectedRevision:1})).json().code,'REFEREE_NOT_FOUND');
});

test('T04: Fecha manual guarda partidos con ámbito, conflictos y revisiones', async () => {
  const created=await newTournament();assert.equal(created.response.statusCode,201,created.response.body);
  const {tournamentId,editionId,categoryId}=created.response.json(),root=`/organizations/${ids.a}`;
  const entries:string[]=[];
  for(let n=0;n<2;n++){const team=await request(adminA,'POST',`${root}/teams`,{requestId:randomUUID(),name:`Manual ${n} ${randomUUID().slice(0,5)}`,color:'#165D46',categoryId});assert.equal(team.statusCode,201,team.body);entries.push(team.json().entryId);}
  const day=await request(adminA,'POST',`${root}/editions/${editionId}/matchdays`,{ordinal:1});assert.equal(day.statusCode,201,day.body);
  const venue=await request(adminA,'POST',`${root}/tournaments/${tournamentId}/venues`,{name:'Sede manual sintética',city:null});assert.equal(venue.statusCode,201,venue.body);
  const path=`${root}/matchdays/${day.json().id}/matches`,input={categoryId,homeEntryId:entries[0],awayEntryId:entries[1],venueId:venue.json().id,courtLabel:'Cancha A',date:'2026-11-07',time:'10:00',durationMinutes:60,refereeName:null};
  assert.equal((await request(adminB,'POST',path,input)).statusCode,403);
  assert.equal((await request(adminA,'POST',path,{...input,awayEntryId:randomUUID()})).json().code,'TEAMS_NOT_IN_CATEGORY');
  const made=await request(adminA,'POST',path,input);assert.equal(made.statusCode,201,made.body);
  assert.equal((await request(adminA,'POST',`${root}/categories/${categoryId}/rules/publish`,{reason:'Reglas manuales sintéticas',expectedRevision:1})).statusCode,200);
  const manualStats=await request(adminA,'GET',`${root}/categories/${categoryId}/statistics`);assert.equal(manualStats.statusCode,200,manualStats.body);
  assert.equal(manualStats.json().tables.length,1);assert.equal(manualStats.json().tables[0].totals.length,2);
  assert.equal((await request(adminA,'POST',path,{...input,time:'10:30'})).json().code,'SCHEDULE_CONFLICT');
  const listed=(await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json();assert.equal(listed[0].matches[0].id,made.json().id);
  assert.equal(listed[0].matches[0].acta_status,null);
  assert.match(listed[0].matches[0].home_team_id,/^[0-9a-f-]{36}$/);
  assert.equal(typeof listed[0].matches[0].home_has_shield,'boolean');
  assert.equal((await request(adminB,'GET',`${root}/editions/${editionId}/matchdays`)).statusCode,403);
  assert.equal((await request(adminA,'PATCH',`${root}/fixture/matches/${made.json().id}/schedule`,{matchdayId:day.json().id,venueId:venue.json().id,courtLabel:'Cancha B',date:'2026-11-07',time:'12:00',durationMinutes:60,refereeName:null,expectedRevision:1,reason:'Cambio de horario'})).statusCode,200);
  const archiveMatch=`${root}/fixture/matches/${made.json().id}/archive`;
  assert.equal((await request(adminB,'POST',archiveMatch,{})).statusCode,403);
  assert.equal((await request(adminA,'POST',archiveMatch,{})).statusCode,200);
  let after=(await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json()[0];assert.equal(after.matches.length,0);assert.equal(after.archivedMatches.length,1);
  assert.equal((await request(adminA,'POST',`${root}/fixture/matches/${made.json().id}/restore`,{})).statusCode,200);
  after=(await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json()[0];assert.equal(after.matches.length,1);
  assert.equal((await request(adminA,'POST',archiveMatch,{})).statusCode,200);
  const archiveDay=`${root}/matchdays/${day.json().id}/archive`;
  assert.equal((await request(adminB,'POST',archiveDay,{})).statusCode,403);
  assert.equal((await request(adminA,'POST',archiveDay,{})).statusCode,200);
  assert.ok((await request(adminA,'GET',`${root}/editions/${editionId}/matchdays`)).json()[0].archivedAt);
  assert.equal((await request(adminA,'POST',`${root}/matchdays/${day.json().id}/restore`,{})).statusCode,200);
  const phase=await request(adminA,'POST',`${root}/categories/${categoryId}/fixture/phase`,{});assert.equal(phase.statusCode,201,phase.body);
  const generated=await request(adminA,'POST',`${root}/categories/${categoryId}/fixture/generate`,{expectedRevision:phase.json().revision,createMatchdays:true});assert.equal(generated.statusCode,201,generated.body);
  const overview=(await request(adminA,'GET',`${root}/categories/${categoryId}/fixture`)).json();assert.ok(overview.rounds.flatMap((round:{matches:Array<{id:string}>})=>round.matches).every((match:{id:string})=>match.id!==made.json().id));
});

test('T05: captura privada congela planillas, guarda eventos una vez y deshace sin borrar', async () => {
  const made = await newTournament(ids.a,{...fiveRules,initialPhase:{mode:'league',legs:2,groupCount:null},advanced:{...fiveRules.advanced!,discipline:{...fiveRules.advanced!.discipline,customCards:[{code:'azul',label:'Azul',color:'#2278C7',suspensionMatches:2}]}}}); assert.equal(made.response.statusCode, 201, made.response.body);
  const { tournamentId, editionId, categoryId } = made.response.json();
  const root = `/organizations/${ids.a}`;
  assert.equal((await request(adminA, 'POST', `${root}/categories/${categoryId}/rules/publish`, { reason: 'Reglas de captura sintéticas', expectedRevision: 1 })).statusCode, 200);
  const entries: string[] = [], registrations: string[] = [];let benchRegistration='',benchEntry='';
  for (let n = 0; n < 2; n++) {
    const team = await request(adminA, 'POST', `${root}/teams`, { requestId: randomUUID(), name: `Acta ${n} ${randomUUID().slice(0,5)}`, color: '#165D46', categoryId });
    assert.equal(team.statusCode, 201, team.body); entries.push(team.json().entryId);
    const player = await request(adminA, 'POST', `${root}/entries/${team.json().entryId}/players`, { givenNames: `Jugador ${n}`, familyNames: 'Sintético', documentKind: 'ci', documentNumber: `${runId}5100${n}`, birthDate: '2000-01-01', registrationNumber: `ACTA-${n}`, origin: { kind: 'unknown' } });
    assert.equal(player.statusCode, 201, player.body); registrations.push(player.json().id);
    if(n===0){const reserve=await request(adminA,'POST',`${root}/entries/${team.json().entryId}/players`,{givenNames:'Suplente',familyNames:'Sintético',documentKind:'ci',documentNumber:`${runId}51999`,birthDate:'2000-01-01',registrationNumber:'ACTA-BANCA',origin:{kind:'unknown'}});assert.equal(reserve.statusCode,201,reserve.body);benchRegistration=reserve.json().id;benchEntry=team.json().entryId;}
  }
  const fixturePath = `${root}/categories/${categoryId}/fixture`;
  assert.equal((await request(adminA, 'POST', `${fixturePath}/phase`, {})).statusCode, 201);
  assert.equal((await request(adminA, 'POST', `${fixturePath}/generate`, { expectedRevision: 1 })).statusCode, 201);
  const match = (await request(adminA, 'GET', fixturePath)).json().rounds[0].matches[0];
  if (match.home_entry_id !== entries[0]) { entries.reverse(); registrations.reverse(); }
  const matchId = match.id, recordPath = `${root}/matches/${matchId}/record`;
  assert.equal((await request(adminB, 'POST', `${recordPath}/start`, {})).statusCode, 403);
  assert.equal((await request(teamA, 'POST', `${recordPath}/start`, {})).statusCode, 403);
  assert.equal((await request(owner, 'POST', `${recordPath}/start`, {})).statusCode, 403);
  assert.equal((await request(adminA, 'POST', `${recordPath}/start`, {})).json().code, 'FIXTURE_NOT_PUBLISHED');
  const day = await request(adminA, 'POST', `${root}/editions/${editionId}/matchdays`, { ordinal: 1 }); assert.equal(day.statusCode, 201);
  const venue = await request(adminA, 'POST', `${root}/tournaments/${tournamentId}/venues`, { name: 'Sede acta sintética', city: null }); assert.equal(venue.statusCode, 201);
  const scheduled = await request(adminA, 'PATCH', `${root}/fixture/matches/${matchId}/schedule`, { matchdayId: day.json().id, venueId: venue.json().id, courtLabel: 'Cancha A', date: '2026-11-21', time: '10:00', durationMinutes: 60, refereeName: null, expectedRevision: 0, reason: 'Partido de prueba' });
  assert.equal(scheduled.statusCode, 200, scheduled.body);
  await pool.query("UPDATE matchdays SET status='published',published_by=$3,published_at=now() WHERE organization_id=$1 AND id=$2", [ids.a, day.json().id, ids.adminA]);
  const withoutLineups = await request(adminA, 'POST', `${recordPath}/start`, {});
  assert.equal(withoutLineups.statusCode, 201, withoutLineups.body);
  assert.equal(withoutLineups.json().home.players.length + withoutLineups.json().away.players.length, 3);
  for (let n = 0; n < 2; n++) await pool.query(`INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason)
    VALUES($1,$2,$3,$4,1,'approved',$5,1,1,'Planilla sintética',$6,$6,now(),$6,now(),'Revisión sintética')`, [randomUUID(), ids.a, matchId, entries[n], JSON.stringify({ players: [{ registrationId: registrations[n], role: 'starter', goalkeeper: false, captain: false, shirtNumber: 9 },...(entries[n]===benchEntry?[{registrationId:benchRegistration,role:'bench',goalkeeper:false,captain:false,shirtNumber:10}]:[])], staffIds: [] }), ids.adminA]);
  const started = await request(adminA, 'POST', `${recordPath}/start`, {}); assert.equal(started.statusCode, 201, started.body);
  assert.equal(started.json().score.home, 0); assert.equal((await request(adminA, 'POST', `${recordPath}/start`, {})).json().revision, 0);
  assert.equal((await request(adminA, 'PATCH', `${root}/fixture/matches/${matchId}/schedule`, { matchdayId: day.json().id, venueId: venue.json().id, courtLabel: 'Cancha B', date: '2026-11-21', time: '11:00', durationMinutes: 60, refereeName: null, expectedRevision: 1, reason: 'Cambio tardío' })).json().code, 'MATCH_STARTED');
  assert.equal((await request(adminB, 'GET', recordPath)).statusCode, 403);
  const eventPath = `${root}/matches/${matchId}/events`, clientEventId = randomUUID();
  const goal = { clientEventId, kind: 'goal', teamEntryId: entries[0], registrationId: registrations[0], period: 'ST', minute: null };
  assert.equal((await request(adminA, 'POST', eventPath, { ...goal, teamEntryId: randomUUID() })).json().code, 'TEAM_NOT_IN_MATCH');
  const added = await request(adminA, 'POST', eventPath, goal); assert.equal(added.statusCode, 201, added.body); assert.equal(added.json().score.home, 1);
  const repeated = await request(adminA, 'POST', eventPath, goal); assert.equal(repeated.statusCode, 201); assert.equal(repeated.json().events.length, 1);
  assert.equal((await request(adminA, 'POST', eventPath, { ...goal, kind: 'yellow' })).json().code, 'EVENT_ID_REUSED');
  assert.equal((await request(adminA, 'POST', eventPath, { ...goal, clientEventId: randomUUID(), period: 'P4' })).json().code, 'PERIOD_NOT_ALLOWED');
  assert.equal((await request(adminA, 'POST', eventPath, { ...goal, clientEventId: randomUUID(), teamEntryId: entries[1] })).json().code, 'PLAYER_NOT_IN_LINEUP');
  const card = await request(adminA, 'POST', eventPath, { ...goal, clientEventId: randomUUID(), kind: 'yellow', teamEntryId: entries[1], registrationId: registrations[1], period: null });
  assert.equal(card.statusCode, 201, card.body); assert.equal(card.json().events.length, 2);
  const correction = await request(adminA, 'POST', `${eventPath}/${added.json().events[0].id}/void`, { clientEventId: randomUUID(), reason: 'Corrección inmediata' });
  assert.equal(correction.statusCode, 201, correction.body); assert.equal(correction.json().score.home, 0); assert.equal(correction.json().events.length, 3);
  const ownGoal = await request(adminA, 'POST', eventPath, { ...goal, clientEventId: randomUUID(), kind: 'own_goal', period: null });
  assert.equal(ownGoal.statusCode, 201, ownGoal.body); assert.equal(ownGoal.json().score.away, 1);
  const change={clientEventId:randomUUID(),kind:'substitution',teamEntryId:benchEntry,registrationId:registrations[entries.indexOf(benchEntry)],relatedRegistrationId:benchRegistration,period:'ST',minute:null,windowNo:1};
  assert.equal((await request(adminA,'POST',eventPath,{...change,clientEventId:randomUUID(),windowNo:null})).statusCode,201);
  const changed=await request(adminA,'POST',eventPath,change);assert.equal(changed.statusCode,201,changed.body);
  assert.deepEqual(changed.json().score,{home:0,away:1});
  assert.equal((await request(adminA,'POST',eventPath,{...change,clientEventId:randomUUID()})).statusCode,201);
  const secondYellow = await request(adminA,'POST',eventPath,{...goal,clientEventId:randomUUID(),kind:'second_yellow'});
  assert.equal(secondYellow.statusCode,201);
  assert.equal((await request(adminA,'POST',`${eventPath}/${secondYellow.json().events.at(-1).id}/void`,{clientEventId:randomUUID(),reason:'Prueba de tarjeta rectificada'})).statusCode,201);
  assert.equal((await request(adminA, 'POST', `${eventPath}/${added.json().events[0].id}/void`, { clientEventId: randomUUID(), reason: 'Otra corrección' })).json().code, 'EVENT_ALREADY_VOIDED');
  const frozen = await request(adminA, 'POST', `${root}/draft-matches/${matchId}/entries/${entries[0]}/lineup`, { players: [], staffIds: [], expectedVersion: 1, reason: 'Edición tardía' });
  assert.equal(frozen.json().code, 'LINEUP_FROZEN');
  await assert.rejects(pool.query('DELETE FROM match_record_events WHERE organization_id=$1 AND match_id=$2', [ids.a, matchId]));
  const { rows: [count] } = await pool.query('SELECT count(*)::int total FROM match_record_events WHERE organization_id=$1 AND match_id=$2', [ids.a, matchId]); assert.equal(count.total, 9);
  const extraCard = { ...goal, clientEventId: randomUUID(), kind: 'custom_card', cardCode: 'azul' };
  assert.equal((await request(adminB,'POST',eventPath,extraCard)).statusCode,403);
  assert.equal((await request(adminA,'POST',eventPath,{...extraCard,cardCode:'inexistente'})).json().code,'CARD_UNKNOWN');
  const blue = await request(adminA,'POST',eventPath,extraCard); assert.equal(blue.statusCode,201,blue.body);
  assert.equal(blue.json().events.at(-1).cardCode,'azul');
  assert.equal((await request(adminA,'POST',`${eventPath}/${blue.json().events.at(-1).id}/void`,{clientEventId:randomUUID(),reason:'Tarjeta de prueba anulada'})).statusCode,201);
  const operatorName=username('planillero');
  const createdOperator=await request(adminA,'POST',`${root}/operators`,{name:'Planillero sintético',username:operatorName});assert.equal(createdOperator.statusCode,201,createdOperator.body);
  const invite=createdOperator.json().invitation;
  assert.equal((await app.inject({method:'POST',url:'/api/v1/invitations/accept',payload:{token:invite.token,password}})).statusCode,200);
  const operator=await login(operatorName,password,ids.a);
  assert.equal((await request(operator,'GET',recordPath)).statusCode,403);
  assert.equal((await request(operator,'GET',`${root}/match-assignments`)).json().length,0);
  const assignment=await request(adminA,'POST',`${root}/matches/${matchId}/assignments`,{membershipId:createdOperator.json().membershipId,duty:'capture',reason:'Captura del encuentro'});
  assert.equal(assignment.statusCode,201,assignment.body);
  assert.equal((await request(operator,'GET',`${root}/match-assignments`)).json()[0].day_status,'published');
  assert.equal((await request(operator,'GET',`${root}/match-assignments`)).json()[0].acta_status,'capturing');
  assert.equal((await request(operator,'GET',recordPath)).statusCode,200);
  assert.equal((await request(operator,'GET',`/organizations/${ids.b}/matches/${matchId}/record`)).statusCode,403);
  assert.equal((await request(owner,'POST',`${root}/matches/${matchId}/assignments`,{membershipId:createdOperator.json().membershipId,duty:'review',reason:'Intento de superadmin'})).statusCode,403);
  const incident=await request(operator,'POST',eventPath,{clientEventId:randomUUID(),kind:'incident',teamEntryId:entries[0],registrationId:null,incidentNote:'Lesión sin tarjeta',period:'PT',minute:null});
  assert.equal(incident.statusCode,201,incident.body);
  const concurrentIncident={clientEventId:randomUUID(),kind:'incident',teamEntryId:entries[1],registrationId:null,incidentNote:'Interrupción breve',period:null,minute:null};
  const concurrentCapture=await Promise.all([request(operator,'POST',eventPath,concurrentIncident),request(adminA,'POST',eventPath,concurrentIncident)]);
  assert.deepEqual(concurrentCapture.map(item=>item.statusCode),[201,201]);
  const {rows:[concurrentCount]}=await pool.query('SELECT count(*)::int total FROM match_record_events WHERE organization_id=$1 AND match_id=$2 AND client_event_id=$3',[ids.a,matchId,concurrentIncident.clientEventId]);assert.equal(concurrentCount.total,1);
  const shootout=await request(operator,'POST',eventPath,{clientEventId:randomUUID(),kind:'shootout_goal',teamEntryId:entries[0],registrationId:null,period:null,minute:null});
  assert.equal(shootout.statusCode,201,shootout.body);assert.equal(shootout.json().score.home,0);assert.equal(shootout.json().shootout.home,1);
  const revoked=await request(adminA,'POST',`${root}/matches/${matchId}/assignments/${assignment.json().id}/revoke`,{reason:'Terminó la captura'});
  assert.equal(revoked.statusCode,200,revoked.body);assert.equal((await request(operator,'GET',recordPath)).statusCode,403);
  assert.equal((await request(operator,'POST',eventPath,{...goal,clientEventId:randomUUID()})).statusCode,403);
  const submit=await request(adminA,'POST',`${root}/matches/${matchId}/acta/submit`,{reason:'Acta enviada para revisar'});
  assert.equal(submit.statusCode,201,submit.body);assert.equal(submit.json().record.status,'submitted');
  await pool.query('UPDATE team_entries SET public_visible=true WHERE organization_id=$1 AND id=ANY($2::uuid[])',[ids.a,entries]);
  await pool.query('INSERT INTO matchday_publications(id,organization_id,matchday_id,revision,snapshot,reason,published_by) VALUES($1,$2,$3,1,$4,$5,$6)',[randomUUID(),ids.a,day.json().id,JSON.stringify([{id:matchId,home_entry_id:entries[0],away_entry_id:entries[1],category_name:'Categoría',home_name:'Local',away_name:'Visitante',venue_name:'Sede',court_label:'Cancha A',match_date:'2026-11-21',match_time:'10:00'}]),'Publicación sintética',ids.adminA]);
  const provisional=(await app.inject(`/api/v1/public/organizations/${ids.a}/fixture`)).json().flatMap((day:any)=>day.matches).find((item:any)=>item.id===matchId);
  assert.equal(provisional.result.status,'provisional');assert.deepEqual(provisional.result.score,{home:0,away:1});assert.deepEqual(provisional.result.shootout,{home:1,away:0});
  assert.equal(provisional.result.events.some((event:any)=>event.kind==='goal'),false);
  assert.equal(provisional.result.events.some((event:any)=>event.kind==='own_goal'&&event.side==='home'&&event.name==='Jugador'),true);
  assert.deepEqual(provisional.result.players,[]);
  assert.equal(JSON.stringify(provisional.result).includes(registrations[0]),false);
  assert.equal(JSON.stringify(provisional.result).includes('Jugador 0'),false);
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.b}/fixture`)).json().flatMap((row:any)=>row.matches).some((item:any)=>item.id===matchId),false);
  assert.equal((await request(adminA,'POST',eventPath,{...goal,clientEventId:randomUUID()})).json().code,'RECORD_LOCKED');
  assert.equal((await request(adminA,'POST',`${root}/matches/${matchId}/acta/approve`,{reason:'Validación del resultado',overrideSignoffs:false})).json().code,'SIGNOFFS_PENDING');
  const rejected=await request(adminA,'POST',`${root}/matches/${matchId}/acta/reject`,{reason:'Revisar autoría del gol'});
  assert.equal(rejected.statusCode,200,rejected.body);assert.equal(rejected.json().status,'capturing');
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.a}/fixture`)).json().flatMap((day:any)=>day.matches).find((item:any)=>item.id===matchId).result,null);
  const sentAgain=await request(adminA,'POST',`${root}/matches/${matchId}/acta/submit`,{reason:'Acta corregida y reenviada'});assert.equal(sentAgain.statusCode,201,sentAgain.body);
  assert.equal((await request(teamA,'GET',`${root}/matches/${matchId}/acta/for-team/${entries[0]}`)).statusCode,403);
  const {rows:[teamMember]}=await pool.query("SELECT id FROM memberships WHERE organization_id=$1 AND user_id=$2 AND role='team_admin'",[ids.a,ids.teamA]);
  await pool.query('INSERT INTO team_admin_assignments(organization_id,entry_id,membership_id,assigned_by) VALUES($1,$2,$3,$4)',[ids.a,entries[0],teamMember.id,ids.adminA]);
  const otherTeamAdminName=username('acta-equipo');
  const otherTeamAdmin=await request(adminA,'POST',`${root}/entries/${entries[1]}/administrators`,{name:'Delegado de prueba',username:otherTeamAdminName});assert.equal(otherTeamAdmin.statusCode,201,otherTeamAdmin.body);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/invitations/accept',payload:{token:otherTeamAdmin.json().invitation.token,password}})).statusCode,200);
  const teamB=await login(otherTeamAdminName,password,ids.a);
  assert.equal((await request(teamA,'GET',`${root}/matches/${matchId}/acta/for-team/${entries[0]}`)).statusCode,200);
  assert.equal((await request(teamA,'GET',`${root}/matches/${matchId}/acta/for-team/${entries[1]}`)).statusCode,403);
  assert.equal((await request(teamA,'POST',`${root}/matches/${matchId}/acta/sign`,{entryId:entries[0],submissionId:sentAgain.json().id})).statusCode,201);
  assert.equal((await request(teamB,'POST',`${root}/matches/${matchId}/acta/sign`,{entryId:entries[1],submissionId:sentAgain.json().id})).statusCode,201);
  const approved=await request(adminA,'POST',`${root}/matches/${matchId}/acta/approve`,{reason:'Conformidades de ambos equipos',overrideSignoffs:false});
  assert.equal(approved.statusCode,201,approved.body);assert.equal(approved.json().record.status,'official');
  const firstApproval=approved.json().id;
  const publicBefore=await app.inject(`/api/v1/public/organizations/${ids.a}/fixture`);
  assert.equal(publicBefore.statusCode,200,publicBefore.body);
  const publicOfficial=publicBefore.json().flatMap((day:any)=>day.matches).find((item:any)=>item.id===matchId).result;
  assert.equal(publicOfficial.status,'official');assert.deepEqual(publicOfficial.score,{home:0,away:1});assert.deepEqual(publicOfficial.shootout,{home:1,away:0});
  assert.equal(publicOfficial.events.some((event:any)=>event.kind==='own_goal'),true);
  const statsPath=`${root}/categories/${categoryId}/statistics`;
  const firstStats=await request(adminA,'GET',statsPath);assert.equal(firstStats.statusCode,200,firstStats.body);
  assert.equal(firstStats.json().officialMatches,1);assert.equal(firstStats.json().tables[0].totals.find((row:any)=>row.teamId===entries[1]).points,3);
  assert.equal(firstStats.json().players.find((row:any)=>row.registrationId===registrations[0]).goals,0);
  assert.equal((await request(adminB,'GET',statsPath)).statusCode,403);
  assert.equal((await request(teamA,'GET',statsPath)).statusCode,403);
  const publicStatsPath=`/api/v1/public/organizations/${ids.a}/categories/${categoryId}/statistics`;
  const publicStats=await app.inject(publicStatsPath);assert.equal(publicStats.statusCode,200,publicStats.body);
  assert.equal(publicStats.json().tables[0].rows[0].teamName,firstStats.json().entries.find((entry:any)=>entry.id===entries[1]).name);
  assert.equal(JSON.stringify(publicStats.json()).includes(registrations[0]),false);
  assert.equal(JSON.stringify(publicStats.json()).includes('Jugador 0'),false);
  assert.equal(publicStats.json().rosters.every((item:any)=>item.players.length===0),true);
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.b}/categories/${categoryId}/statistics`)).statusCode,404);
  const reopened=await request(adminA,'POST',`${root}/matches/${matchId}/acta/reopen`,{reason:'Rectificar marcador declarado'});assert.equal(reopened.statusCode,200,reopened.body);
  assert.equal(reopened.json().approvalId,firstApproval);
  assert.equal((await app.inject(`/api/v1/public/organizations/${ids.a}/fixture`)).json().flatMap((day:any)=>day.matches).find((item:any)=>item.id===matchId).result.score.home,0);
  const correctedGoal=await request(adminA,'POST',eventPath,{...goal,clientEventId:randomUUID()});assert.equal(correctedGoal.statusCode,201,correctedGoal.body);
  assert.equal(correctedGoal.json().score.home,1);
  assert.equal((await request(adminA,'POST',`${eventPath}/${card.json().events[1].id}/void`,{clientEventId:randomUUID(),reason:'Tarjeta cargada por error'})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${root}/matches/${matchId}/acta/submit`,{reason:'Corrección de gol omitido'})).statusCode,201);
  const finalApproval=await request(adminA,'POST',`${root}/matches/${matchId}/acta/approve`,{reason:'Resultado rectificado',overrideSignoffs:true});assert.equal(finalApproval.statusCode,201,finalApproval.body);
  assert.notEqual(finalApproval.json().id,firstApproval);
  const publicAfter=(await app.inject(`/api/v1/public/organizations/${ids.a}/fixture`)).json().flatMap((day:any)=>day.matches).find((item:any)=>item.id===matchId);
  assert.deepEqual(publicAfter.result.score,{home:1,away:1});
  assert.equal(JSON.stringify(publicAfter).includes(registrations[0]),false);
  const updatedStats=(await request(adminA,'GET',statsPath)).json();
  assert.notEqual(updatedStats.sourceKey,firstStats.json().sourceKey);
  assert.equal(updatedStats.tables[0].totals.find((row:any)=>row.teamId===entries[0]).points,1);
  const adjustmentsPath=`${root}/categories/${categoryId}/standings/adjustments`;
  assert.equal((await request(teamA,'POST',adjustmentsPath,{entryId:entries[0],pointsDelta:-1,reason:'Decisión deportiva'})).statusCode,403);
  assert.equal((await request(adminB,'POST',adjustmentsPath,{entryId:entries[0],pointsDelta:-1,reason:'Intento externo'})).statusCode,403);
  assert.equal((await request(adminA,'POST',adjustmentsPath,{entryId:entries[0],pointsDelta:0,reason:'Valor inválido'})).statusCode,400);
  const deduction=await request(adminA,'POST',adjustmentsPath,{entryId:entries[0],pointsDelta:-1,reason:'Descuento por resolución deportiva'});
  assert.equal(deduction.statusCode,201,deduction.body);
  assert.equal((await request(adminA,'GET',adjustmentsPath)).json().length,1);
  assert.equal((await request(adminA,'GET',statsPath)).json().tables[0].totals.find((row:any)=>row.teamId===entries[0]).points,0);
  const reversal=await request(adminA,'POST',adjustmentsPath,{entryId:entries[0],pointsDelta:1,reason:'Reversión expresa del descuento'});
  assert.equal(reversal.statusCode,201,reversal.body);
  assert.equal((await request(adminA,'GET',statsPath)).json().tables[0].totals.find((row:any)=>row.teamId===entries[0]).points,1);
  await assert.rejects(pool.query('DELETE FROM standing_adjustments WHERE organization_id=$1 AND id=$2',[ids.a,deduction.json().id]));
  const tiePath=`${root}/categories/${categoryId}/standings/tiebreaks`;
  const tie=(await request(adminA,'GET',statsPath)).json().tables[0].groups.find((group:any)=>group.unresolved);
  assert.deepEqual(new Set(tie.teamIds),new Set(entries));
  assert.equal((await request(teamA,'POST',tiePath,{groupNo:null,position:tie.position,entryOrder:[entries[1],entries[0]],reason:'Sorteo documentado'})).statusCode,403);
  assert.equal((await request(adminB,'POST',tiePath,{groupNo:null,position:tie.position,entryOrder:[entries[1],entries[0]],reason:'Intento externo'})).statusCode,403);
  assert.equal((await request(adminA,'POST',tiePath,{groupNo:null,position:tie.position,entryOrder:[entries[0],entries[0]],reason:'Orden repetido'})).statusCode,409);
  const decidedTie=await request(adminA,'POST',tiePath,{groupNo:null,position:tie.position,entryOrder:[entries[1],entries[0]],reason:'Sorteo documentado por el organizador'});
  assert.equal(decidedTie.statusCode,201,decidedTie.body);
  assert.deepEqual((await request(adminA,'GET',statsPath)).json().tables[0].groups.map((group:any)=>group.teamIds[0]),[entries[1],entries[0]]);
  assert.equal((await app.inject(publicStatsPath)).json().tables[0].rows[0].teamName,updatedStats.entries.find((entry:any)=>entry.id===entries[1]).name);
  assert.equal(updatedStats.players.find((row:any)=>row.registrationId===registrations[0]).goals,1);
  assert.equal((await app.inject(publicStatsPath)).json().unlistedGoals,1);
  const publicationPath=`${root}/registrations/${registrations[0]}/publication`;
  assert.equal((await request(teamA,'POST',publicationPath,{visible:true,reason:'Publicación deportiva aprobada'})).statusCode,403);
  assert.equal((await request(adminB,'POST',publicationPath,{visible:true,reason:'Intento externo'})).statusCode,403);
  assert.equal((await request(adminA,'POST',publicationPath,{visible:true,reason:'Publicación deportiva aprobada'})).statusCode,200);
  const namedStats=(await app.inject(publicStatsPath)).json();assert.equal(namedStats.scorers.length,1);assert.equal(namedStats.unlistedGoals,0);
  assert.equal(namedStats.scorers[0].goals,1);assert.equal(JSON.stringify(namedStats).includes(registrations[0]),false);
  assert.equal(namedStats.rosters.flatMap((item:any)=>item.players).some((item:any)=>item.name===namedStats.scorers[0].name&&item.goals===1),true);
  const rebuilt=await request(adminA,'POST',`${statsPath}/rebuild`,{});assert.equal(rebuilt.statusCode,200,rebuilt.body);assert.equal(rebuilt.json().same,true);
  const disciplineRoot=`${root}/categories/${categoryId}/discipline`;
  const proposals=await request(adminA,'POST',`${disciplineRoot}/proposals/rebuild`,{});assert.equal(proposals.statusCode,200,proposals.body);assert.equal(proposals.json().created,2);
  assert.equal((await request(adminA,'POST',`${disciplineRoot}/proposals/rebuild`,{})).json().created,0);
  assert.equal((await request(adminB,'POST',`${disciplineRoot}/proposals/rebuild`,{})).statusCode,403);
  const manual=await request(adminA,'POST',`${disciplineRoot}/cases`,{entryId:entries[0],registrationId:registrations[0],summary:'Conducta para revisión',evidenceNote:'Constancia deportiva sintética'});
  assert.equal(manual.statusCode,201,manual.body);const caseId=manual.json().id,casePath=`${root}/discipline/cases/${caseId}`;
  assert.equal((await request(teamA,'GET',`${root}/entries/${entries[0]}/discipline`)).statusCode,200);
  assert.equal((await request(teamB,'GET',`${root}/entries/${entries[0]}/discipline`)).statusCode,403);
  assert.equal((await request(adminB,'GET',casePath)).statusCode,403);
  const catalog=await request(adminA,'POST',`${disciplineRoot}/fines`,{code:'CONDUCTA',label:'Multa deportiva',amountGuaranies:10000});assert.equal(catalog.statusCode,201,catalog.body);
  const revisedCatalog=await request(adminA,'POST',`${disciplineRoot}/fines`,{code:'CONDUCTA',label:'Multa deportiva ajustada',amountGuaranies:20000});assert.equal(revisedCatalog.json().version,2);
  assert.equal((await request(adminA,'POST',`${casePath}/review`,{reason:'Se revisó la constancia'})).statusCode,200);
  const decision=await request(adminA,'POST',`${casePath}/decision`,{reason:'Un partido y multa según catálogo',suspension:{unit:'matches',matches:1,startsOn:'2026-11-22'},fineCatalogId:catalog.json().id});
  assert.equal(decision.statusCode,201,decision.body);assert.equal(decision.json().case.fine_amount_guaranies,10000);
  const resolution=await request(teamA,'GET',`${casePath}/resolution.pdf`);assert.equal(resolution.statusCode,200,resolution.body);assert.equal(resolution.headers['content-type'],'application/pdf');assert.match(resolution.rawPayload.toString('latin1'),/^%PDF-/);
  assert.equal((await request(adminB,'GET',`${casePath}/resolution.pdf`)).statusCode,403);
  assert.equal((await request(adminA,'POST',`${casePath}/decision`,{reason:'Duplicar multa',suspension:null,fineCatalogId:catalog.json().id})).json().code,'CASE_NOT_DECIDABLE');
  const absentPlayer=await request(adminA,'POST',`${root}/entries/${entries[0]}/players`,{givenNames:'Ausente',familyNames:'Sintético',documentKind:'ci',documentNumber:`${runId}51998`,birthDate:'2000-01-01',registrationNumber:'ACTA-AUSENTE',origin:{kind:'unknown'}});
  assert.equal(absentPlayer.statusCode,201,absentPlayer.body);
  const absenceCase=await request(adminA,'POST',`${disciplineRoot}/cases`,{entryId:entries[0],registrationId:absentPlayer.json().id,summary:'Suspensión de prueba retrospectiva',evidenceNote:'Constancia sintética de ausencia'});
  assert.equal(absenceCase.statusCode,201,absenceCase.body);
  const absenceDecision=await request(adminA,'POST',`${root}/discipline/cases/${absenceCase.json().id}/decision`,{reason:'Un partido oficial desde el veinte',suspension:{unit:'matches',matches:1,startsOn:'2026-11-20'},fineCatalogId:null});
  assert.equal(absenceDecision.statusCode,201,absenceDecision.body);
  const service=(await request(adminA,'GET',`${root}/discipline/cases/${absenceCase.json().id}`)).json().serviceHistory;
  assert.equal(service.length,1);assert.equal(service[0].current_approval,true);
  assert.equal((await request(adminB,'GET',`${root}/discipline/cases/${absenceCase.json().id}`)).statusCode,403);
  const eligibilityPath=`${root}/entries/${entries[0]}/players/${registrations[0]}/eligibility?date=2026-11-22`;
  assert.match((await request(teamA,'GET',eligibilityPath)).json().reasons.join(' '),/Suspensión vigente/);
  assert.equal((await request(teamA,'POST',`${casePath}/appeal`,{reason:'Apelación del equipo'})).statusCode,200);
  assert.match((await request(teamA,'GET',eligibilityPath)).json().reasons.join(' '),/Suspensión vigente/);
  assert.equal((await request(adminA,'POST',`${casePath}/appeal/resolve`,{decision:'confirm',reason:'Se mantiene la decisión'})).json().decision_status,'active');
  assert.equal((await request(teamA,'POST',`${casePath}/appeal`,{reason:'Nuevos antecedentes'})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${casePath}/appeal/resolve`,{decision:'revoke',reason:'Se revoca tras nueva revisión'})).json().decision_status,'revoked');
  const revokedPdf=await request(teamA,'GET',`${casePath}/resolution.pdf`);
  assert.equal(revokedPdf.statusCode,200,revokedPdf.body);
  assert.match(revokedPdf.rawPayload.toString('latin1'),/Revocada/);
  assert.match(revokedPdf.rawPayload.toString('latin1'),/Se revoca tras nueva revisi/);
  assert.doesNotMatch((await request(teamA,'GET',eligibilityPath)).json().reasons.join(' '),/Suspensión vigente/);
  const noticeList=(await request(teamA,'GET',`${root}/entries/${entries[0]}/discipline`)).json();assert.equal(noticeList.notices.length,4);
  const {rows:[approvedLineup]}=await pool.query("SELECT version FROM lineup_versions WHERE organization_id=$1 AND entry_id=$2 AND match_id=$3 AND status='approved' ORDER BY version DESC LIMIT 1",[ids.a,entries[0],matchId]);
  const lineupExport=`${root}/entries/${entries[0]}/exports/lineup/${matchId}/${approvedLineup.version}`;
  const lineupPdf=await request(teamA,'GET',`${lineupExport}/pdf`);assert.equal(lineupPdf.statusCode,200,lineupPdf.body);assert.match(lineupPdf.rawPayload.toString('latin1'),/^%PDF-/);
  const lineupCsv=await request(teamA,'GET',`${lineupExport}/csv`);assert.equal(lineupCsv.statusCode,200,lineupCsv.body);assert.match(lineupCsv.body,/Planilla del encuentro/);
  assert.equal((await request(teamB,'GET',`${lineupExport}/pdf`)).statusCode,403);
  assert.equal((await request(adminB,'GET',`${lineupExport}/csv`)).statusCode,403);
  const {rows:[approvedActa]}=await pool.query("SELECT version FROM match_acta_snapshots WHERE organization_id=$1 AND match_id=$2 AND kind='approved' ORDER BY version DESC LIMIT 1",[ids.a,matchId]);
  const actaExport=`${root}/entries/${entries[0]}/exports/acta/${matchId}/${approvedActa.version}`;
  const actaPdf=await request(teamA,'GET',`${actaExport}/pdf`);assert.equal(actaPdf.statusCode,200,actaPdf.body);assert.match(actaPdf.rawPayload.toString('latin1'),/^%PDF-/);
  const actaCsv=await request(teamA,'GET',`${actaExport}/csv`);assert.equal(actaCsv.statusCode,200,actaCsv.body);assert.match(actaCsv.body,/Acta oficial/);
  assert.equal((await request(teamB,'GET',`${actaExport}/pdf`)).statusCode,403);
  const disciplineExport=`${root}/entries/${entries[0]}/exports/discipline/summary/current`;
  const disciplinePdf=await request(teamA,'GET',`${disciplineExport}/pdf`);assert.equal(disciplinePdf.statusCode,200,disciplinePdf.body);assert.match(disciplinePdf.rawPayload.toString('latin1'),/^%PDF-/);
  const disciplineCsv=await request(teamA,'GET',`${disciplineExport}/csv`);assert.equal(disciplineCsv.statusCode,200,disciplineCsv.body);assert.match(disciplineCsv.body,/10000/);assert.doesNotMatch(disciplineCsv.body,new RegExp(`${runId}51000`));
  assert.equal((await request(teamB,'GET',`${disciplineExport}/csv`)).statusCode,403);
  assert.equal((await app.inject(`/api/v1${disciplineExport}/csv`)).statusCode,401);
  assert.equal((await request(teamA,'POST',`${root}/entries/${entries[0]}/discipline/notices/${noticeList.notices[0].id}/read`,{})).statusCode,200);
  const history=await request(adminA,'GET',`${root}/matches/${matchId}/acta/history`);assert.equal(history.statusCode,200,history.body);assert.deepEqual(history.json().map((item:any)=>item.kind),['approved','submitted','reopened','approved','submitted','rejected','submitted']);
  assert.equal((await request(adminA,'POST',`${root}/matches/${matchId}/acta/reopen`,{reason:'Revisar constancia sin alterar eventos'})).statusCode,200);
  assert.equal((await request(adminA,'POST',`${root}/matches/${matchId}/acta/submit`,{reason:'Constancia nuevamente revisada'})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${root}/matches/${matchId}/acta/approve`,{reason:'Constancia nuevamente aprobada',overrideSignoffs:true})).statusCode,201);
  const serviceAfterCorrection=(await request(adminA,'GET',`${root}/discipline/cases/${absenceCase.json().id}`)).json().serviceHistory;
  assert.equal(serviceAfterCorrection.length,2);
  assert.equal(serviceAfterCorrection.filter((item:any)=>item.current_approval).length,1);
  const {rows:[outbox]}=await pool.query("SELECT count(*)::int total FROM match_record_outbox WHERE organization_id=$1 AND match_id=$2 AND kind='match.corrected'",[ids.a,matchId]);assert.equal(outbox.total,2);
  await assert.rejects(pool.query('DELETE FROM match_acta_snapshots WHERE organization_id=$1 AND match_id=$2',[ids.a,matchId]));
  const secondMatch=(await request(adminA,'GET',fixturePath)).json().rounds[1].matches[0];
  const secondMatchId=secondMatch.id;
  const secondDay=await request(adminA,'POST',`${root}/editions/${editionId}/matchdays`,{ordinal:2});
  assert.equal(secondDay.statusCode,201,secondDay.body);
  const secondSchedule=await request(adminA,'PATCH',`${root}/fixture/matches/${secondMatchId}/schedule`,{matchdayId:secondDay.json().id,venueId:venue.json().id,courtLabel:'Cancha A',date:'2026-11-28',time:'10:00',durationMinutes:60,refereeName:null,expectedRevision:0,reason:'Segunda fecha sintética'});
  assert.equal(secondSchedule.statusCode,200,secondSchedule.body);
  await pool.query("UPDATE matchdays SET status='published',published_by=$3,published_at=now() WHERE organization_id=$1 AND id=$2",[ids.a,secondDay.json().id,ids.adminA]);
  for(let n=0;n<2;n++) await pool.query(`INSERT INTO lineup_versions(id,organization_id,match_id,entry_id,version,status,snapshot,rule_version,good_faith_version,reason,created_by,submitted_by,submitted_at,reviewed_by,reviewed_at,review_reason)
    VALUES($1,$2,$3,$4,1,'approved',$5,1,1,'Segunda planilla sintética',$6,$6,now(),$6,now(),'Revisión sintética')`,[randomUUID(),ids.a,secondMatchId,entries[n],JSON.stringify({players:[{registrationId:registrations[n],role:'starter',goalkeeper:false,captain:false,shirtNumber:9}],staffIds:[]}),ids.adminA]);
  assert.equal((await request(adminA,'POST',`${root}/matches/${secondMatchId}/record/start`,{})).statusCode,201);
  const secondGoal=await request(adminA,'POST',`${root}/matches/${secondMatchId}/events`,{clientEventId:randomUUID(),kind:'goal',teamEntryId:entries[1],registrationId:registrations[1],period:'PT',minute:null});
  assert.equal(secondGoal.statusCode,201,secondGoal.body);
  assert.equal((await request(adminA,'POST',`${root}/matches/${secondMatchId}/acta/submit`,{reason:'Segunda acta ficticia'})).statusCode,201);
  assert.equal((await request(adminA,'POST',`${root}/matches/${secondMatchId}/acta/approve`,{reason:'Segunda acta oficial',overrideSignoffs:true})).statusCode,201);
  const twoMatches=(await request(adminA,'GET',statsPath)).json();
  assert.equal(twoMatches.officialMatches,2);assert.equal(twoMatches.tableMatches,2);
  assert.equal(twoMatches.tables[0].totals.find((row:any)=>row.teamId===entries[0]).played,2);
  assert.equal(twoMatches.tables[0].totals.find((row:any)=>row.teamId===entries[1]).played,2);
  assert.equal(twoMatches.players.find((row:any)=>row.registrationId===registrations[1]).goals,1);
  assert.equal((await request(adminA,'POST',`${statsPath}/rebuild`,{})).json().same,true);
});
test('T05: la proyección ignora anulados y separa tanda de goles ordinarios',()=>{
  const home=randomUUID(),away=randomUUID();
  const base=(sequence:number,kind:MatchJournalEvent['kind'],teamEntryId:string|null,registrationId:string|null):MatchJournalEvent=>({id:randomUUID(),sequence,kind,teamEntryId,registrationId,relatedRegistrationId:null,period:null,minute:null,windowNo:null,incidentNote:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()});
  const goal=base(1,'goal',home,null),own=base(2,'own_goal',home,randomUUID()),penalty=base(3,'penalty',away,randomUUID()),shootout=base(4,'shootout_goal',home,null),voidEvent=base(5,'void',null,null);voidEvent.voidsEventId=penalty.id;voidEvent.reason='Corrección sintética';
  const projected=projectMatchJournal([goal,own,penalty,shootout,voidEvent],home,away);
  assert.deepEqual(projected.score,{home:1,away:1});assert.deepEqual(projected.shootout,{home:1,away:0});assert.equal(projected.unattributedGoals,1);assert.equal(projected.active.length,3);
});
test('T06: corregir autor conserva el 2–1 y mueve el gol una sola vez',()=>{
  const home=randomUUID(),away=randomUUID(),scorerA=randomUUID(),scorerB=randomUUID(),visitor=randomUUID();
  const event=(sequence:number,kind:MatchJournalEvent['kind'],teamEntryId:string|null,registrationId:string|null):MatchJournalEvent=>({id:randomUUID(),sequence,kind,teamEntryId,registrationId,relatedRegistrationId:null,period:null,minute:null,windowNo:null,incidentNote:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()});
  const first=event(1,'goal',home,scorerA),oldAuthor=event(2,'goal',home,scorerA),awayGoal=event(3,'goal',away,visitor),voided=event(4,'void',null,null),newAuthor=event(5,'goal',home,scorerB),shootout=event(6,'shootout_goal',home,scorerA);
  voided.voidsEventId=oldAuthor.id;voided.reason='Autor incorrecto';
  const result=deriveOfficialStatistics([{id:home,name:'Local',groupNo:null},{id:away,name:'Visitante',groupNo:null}],[{id:randomUUID(),homeEntryId:home,awayEntryId:away,groupNo:null,tableEligible:true,score:{home:2,away:1},events:[first,oldAuthor,awayGoal,voided,newAuthor,shootout],homeRoster:[scorerA,scorerB],awayRoster:[visitor]}],fiveRules);
  assert.equal(result.players.find(row=>row.registrationId===scorerA)?.goals,1);
  assert.equal(result.players.find(row=>row.registrationId===scorerB)?.goals,1);
  assert.equal(result.players.find(row=>row.registrationId===visitor)?.goals,1);
  assert.equal(result.tables[0].totals.find(row=>row.teamId===home)?.points,3);
  assert.equal(result.players.find(row=>row.registrationId===scorerA)?.appearances,1);
});
test('T06: segunda amarilla suma otra amarilla y una roja sin cambiar el marcador',()=>{
  const home=randomUUID(),away=randomUUID(),player=randomUUID();
  const secondYellow:MatchJournalEvent={id:randomUUID(),sequence:2,kind:'second_yellow',teamEntryId:home,registrationId:player,relatedRegistrationId:null,period:'ST',minute:null,windowNo:null,incidentNote:null,voidsEventId:null,reason:null,recordedAt:new Date().toISOString()};
  const firstYellow:MatchJournalEvent={...secondYellow,id:randomUUID(),sequence:1,kind:'yellow'};
  const rules:RuleConfig={...fiveRules,advanced:{...fiveRules.advanced!,discipline:{...fiveRules.advanced!.discipline,secondYellowRed:true}}};
  const result=deriveOfficialStatistics([{id:home,name:'Local',groupNo:null},{id:away,name:'Visitante',groupNo:null}],[{id:randomUUID(),homeEntryId:home,awayEntryId:away,groupNo:null,tableEligible:true,score:{home:0,away:0},events:[firstYellow,secondYellow],homeRoster:[player],awayRoster:[]}],rules);
  assert.equal(result.players.find(row=>row.registrationId===player)?.yellowCards,2);
  assert.equal(result.players.find(row=>row.registrationId===player)?.redCards,1);
  assert.deepEqual(result.tables[0].totals.find(row=>row.teamId===home)?.goalsFor,0);
});
test('T06: resolución extensa pagina sin perder motivo ni estado de revocación',()=>{
  const pdf=disciplineDecisionPdf({caseId:randomUUID(),team:'Club Atlético '.repeat(9),player:'Jugador Apellido '.repeat(14),summary:'Incidencia extensa '.repeat(27),status:'Revocada',reason:'Fundamento deportivo '.repeat(45),suspension:'Tres partidos desde 2026-11-01',fine:'Gs. 10000',decidedAt:'2026-10-29T12:00:00Z',revocationReason:'Motivo de apelación '.repeat(50),revokedAt:'2026-10-30T12:00:00Z'});
  const content=pdf.toString('latin1');
  assert.match(content,/^%PDF-1\.4/);assert.match(content,/\/Count 2/);
  assert.match(content,/Efecto actual: sin suspensi/);assert.match(content,/Página 2 de 2/);
});
test('T07: CSV privado neutraliza fórmulas en campos libres',()=>{
  const csv=sportsReportCsv({title:'Prueba',scope:'Equipo',version:'1',sourceDate:'2026-10-29',generatedAt:'2026-10-29',columns:['Nombre','Motivo'],rows:[['=1+1','+SUM(A1:A2)'],['@usuario','Texto normal']]});
  assert.match(csv,/"'=1\+1"/);assert.match(csv,/"'\+SUM\(A1:A2\)"/);assert.match(csv,/"'@usuario"/);
  assert.match(csv,/"Texto normal"/);
});
test('T08: flyer local conserva versiones, publica solo vigente y niega acceso cruzado',async()=>{
  const createdTournament=await newTournament();assert.equal(createdTournament.response.statusCode,201,createdTournament.response.body);
  const tournament={id:createdTournament.response.json().tournamentId};
  const categoryId=createdTournament.response.json().categoryId;
  assert.equal((await request(adminA,'POST',`/organizations/${ids.a}/categories/${categoryId}/rules/publish`,{expectedRevision:1,reason:'Torneo sintético para flyer'})).statusCode,200);
  const root=`/organizations/${ids.a}/flyers`,publicRoot=`/api/v1/public/organizations/${ids.a}/flyers`;
  const payload={kind:'notice',sourceId:tournament.id,size:'square',pageNo:1,note:'Comunicado sintético <script>privado</script>',template:'forest',format:'png',requestKey:randomUUID(),reason:'Comunicación deportiva sintética'};
  assert.equal((await request(adminB,'POST',root,payload)).statusCode,403);
  assert.equal((await request(teamA,'POST',root,payload)).statusCode,403);
  const preview=await request(adminA,'POST',`${root}/preview`,{kind:'notice',sourceId:tournament.id,size:'square',pageNo:1,note:payload.note,template:'forest'});
  assert.equal(preview.statusCode,200,preview.body);assert.match(preview.body,/&lt;script&gt;/);assert.equal(preview.body.includes('<script>'),false);
  const created=await request(adminA,'POST',root,payload);assert.equal(created.statusCode,202,created.body);const flyerId=created.json().id;
  assert.equal((await request(adminA,'POST',root,payload)).json().id,flyerId);
  assert.equal((await app.inject(`${publicRoot}/${flyerId}/file`)).statusCode,404);
  assert.equal((await request(adminB,'GET',`${root}/${flyerId}/file`)).statusCode,403);
  await processFlyerJobs(pool,config.mediaDir,100);
  const {rows:[rendered]}=await pool.query('SELECT status,error_message,filename FROM flyer_exports WHERE id=$1',[flyerId]);assert.equal(rendered.status,'ready',rendered.error_message||'');
  const download=await request(adminA,'GET',`${root}/${flyerId}/file`);assert.equal(download.statusCode,200,download.body);assert.equal(download.rawPayload.readUInt32BE(16),1080);assert.equal(download.rawPayload.readUInt32BE(20),1080);
  const published=await request(adminA,'POST',`${root}/${flyerId}/publication`,{publicVisible:true,reason:'Flyer revisado para el portal'});assert.equal(published.statusCode,200,published.body);
  assert.equal((await app.inject(`${publicRoot}/${flyerId}/file`)).statusCode,200);
  assert.equal((await app.inject(publicRoot)).json().find((item:{id:string})=>item.id===flyerId)?.tournamentId,tournament.id);
  await pool.query("UPDATE tournaments SET status='draft' WHERE organization_id=$1 AND id=$2",[ids.a,tournament.id]);
  assert.equal((await app.inject(`${publicRoot}/${flyerId}/file`)).statusCode,404);
  assert.equal((await request(adminA,'GET',root)).json().find((item:any)=>item.id===flyerId).stale,true);
  await pool.query("UPDATE tournaments SET status='published' WHERE organization_id=$1 AND id=$2",[ids.a,tournament.id]);
  const changed=await request(adminA,'POST',root,{...payload,note:'Nuevo comunicado oficial',requestKey:randomUUID()});assert.equal(changed.statusCode,202,changed.body);assert.equal(changed.json().version,2);
  const {rows:[first]}=await pool.query('SELECT snapshot,version FROM flyer_exports WHERE id=$1',[flyerId]);assert.equal(first.version,1);assert.equal(first.snapshot.note,payload.note);
  assert.equal((await request(adminA,'POST',`${root}/${flyerId}/publication`,{publicVisible:false,reason:'Retiro de anuncio anterior'})).statusCode,200);
  assert.equal((await app.inject(`${publicRoot}/${flyerId}/file`)).statusCode,404);
  for(const format of ['jpg','pdf'] as const){const queued=await request(adminA,'POST',root,{...payload,format,size:format==='pdf'?'print':'portrait',requestKey:randomUUID()});assert.equal(queued.statusCode,202,queued.body);await processFlyerJobs(pool,config.mediaDir,10);const file=await request(adminA,'GET',`${root}/${queued.json().id}/file`);assert.equal(file.statusCode,200,file.body);if(format==='jpg')assert.equal(file.rawPayload[0],255);else {assert.equal(file.rawPayload.toString('ascii',0,5),'%PDF-');assert.match(file.rawPayload.toString('latin1'),/\/Count 1\b/);}}
  const share=await app.inject(`/api/v1/public/organizations/${ids.a}/share`);assert.equal(share.statusCode,200,share.body);assert.match(share.body,/og:title/);assert.equal(share.body.includes('<script>'),false);
  const qr=await app.inject(`/api/v1/public/organizations/${ids.a}/qr`);assert.equal(qr.statusCode,200,qr.body);assert.match(String(qr.headers['content-type']||''),/image\/svg\+xml/);assert.match(qr.body,/<svg/);
});
test('T08: reprogramar una fuente publicada retira flyer viejo del portal y permite versión nueva',async()=>{
 const {rows:days}=await pool.query(`SELECT md.id,p.revision,p.snapshot FROM matchdays md JOIN LATERAL (SELECT revision,snapshot FROM matchday_publications WHERE organization_id=md.organization_id AND matchday_id=md.id ORDER BY revision DESC LIMIT 1) p ON true WHERE md.organization_id=$1 AND md.status='published'`,[ids.a]);
 const {rows:visibleRows}=await pool.query("SELECT id FROM team_entries WHERE organization_id=$1 AND status='active' AND public_visible",[ids.a]);const visible=new Set(visibleRows.map(row=>row.id));
 const candidate=days.flatMap(day=>(day.snapshot as any[]).filter(match=>visible.has(match.home_entry_id)&&visible.has(match.away_entry_id)).map(match=>({day,match})))[0];assert.ok(candidate);
 const root=`/organizations/${ids.a}/flyers`,payload={kind:'match',sourceId:candidate.match.id,size:'square',pageNo:1,note:null,template:'forest',format:'png',requestKey:randomUUID(),reason:'Previa sintética publicada'};
 const first=await request(adminA,'POST',root,payload);assert.equal(first.statusCode,202,first.body);await processFlyerJobs(pool,config.mediaDir,100);
 assert.equal((await request(adminA,'POST',`${root}/${first.json().id}/publication`,{publicVisible:true,reason:'Difusión de fecha sintética'})).statusCode,200);
 const publicFile=`/api/v1/public/organizations/${ids.a}/flyers/${first.json().id}/file`;assert.equal((await app.inject(publicFile)).statusCode,200);
 const nextSnapshot=(candidate.day.snapshot as any[]).map(match=>match.id===candidate.match.id?{...match,match_time:'22:15',schedule_revision:(match.schedule_revision||0)+1}:match);
 await pool.query('INSERT INTO matchday_publications(id,organization_id,matchday_id,revision,snapshot,reason,published_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),ids.a,candidate.day.id,candidate.day.revision+1,JSON.stringify(nextSnapshot),'Reprogramación sintética',ids.adminA]);
 assert.equal((await app.inject(publicFile)).statusCode,404);
 assert.equal((await request(adminA,'GET',`${root}/${first.json().id}/file`)).statusCode,200);
 const next=await request(adminA,'POST',root,{...payload,requestKey:randomUUID(),reason:'Nueva previa por horario cambiado'});assert.equal(next.statusCode,202,next.body);assert.equal(next.json().version,2);
 const {rows:[saved]}=await pool.query('SELECT snapshot FROM flyer_exports WHERE id=$1',[next.json().id]);assert.match(saved.snapshot.subline,/22:15/);
 await pool.query("UPDATE flyer_exports SET status='running' WHERE id=$1",[next.json().id]);await processFlyerJobs(pool,config.mediaDir,100);
 assert.equal((await request(adminA,'GET',`${root}/${next.json().id}/file`)).statusCode,200);
});
test('T08: flyer de Fecha conserva los dos escudos y el sello de atribución',async()=>{
 const {rows:[day]}=await pool.query("SELECT md.id FROM matchdays md JOIN matchday_publications p ON p.organization_id=md.organization_id AND p.matchday_id=md.id WHERE md.organization_id=$1 AND md.status='published' LIMIT 1",[ids.a]);assert.ok(day);
 const source=await loadFlyerSource(pool,ids.a,'matchday',day.id,'square',1,null);
 assert.ok(source.lines.length);assert.ok(source.lines.every(line=>line.homeName&&line.awayName));
 const line=source.lines[0];line.homeAssetId='home-synthetic';line.awayAssetId='away-synthetic';
 source.footer='Texto de pie innecesario';
 const svg=renderFlyerSvg(source,'square','forest',{'home-synthetic':'data:image/png;base64,aG9tZQ==','away-synthetic':'data:image/png;base64,YXdheQ=='});
 assert.match(svg,/Generado por /);assert.match(svg,/alacancha\.top/);assert.match(svg,/aG9tZQ==/);assert.match(svg,/YXdheQ==/);
 assert.equal(svg.includes('Texto de pie innecesario'),false);
 assert.ok(svg.includes(line.homeName!.slice(0,8)));assert.ok(svg.includes(line.awayName!.slice(0,8)));
 const bracket=renderFlyerSvg({...source,kind:'bracket',lines:[{...line,right:undefined,sub:'Llave 1'}]},'square','paper',{'home-synthetic':'data:image/png;base64,aG9tZQ==','away-synthetic':'data:image/png;base64,YXdheQ=='});
 assert.match(bracket,/aG9tZQ==/);assert.match(bracket,/YXdheQ==/);
});
test('T08: resultado se forma desde el acta aprobada sin datos privados',async()=>{
 const {rows:matches}=await pool.query('SELECT match_id FROM match_records WHERE organization_id=$1 AND approval_id IS NOT NULL',[ids.a]);assert.ok(matches.length);
 let preview:any=null;
 for(const match of matches){const response=await request(adminA,'POST',`/organizations/${ids.a}/flyers/preview`,{kind:'result',sourceId:match.match_id,size:'square',pageNo:1,note:null,template:'paper'});if(response.statusCode===200){preview=response;break;}}
 assert.ok(preview,'Debe existir un acta oficial con jornada y equipos públicos.');assert.match(preview.body,/Resultado oficial/);
 assert.equal(/c[eé]dula|nacimiento|documento|procedencia|origin_kind|document_number/i.test(preview.body),false);
 assert.equal((await request(adminB,'POST',`/organizations/${ids.a}/flyers/preview`,{kind:'result',sourceId:matches[0].match_id,size:'square',pageNo:1,note:null,template:'paper'})).statusCode,403);
});
test('T08: goleadores y valla generan flyers desde estadísticas oficiales sin filtrar identidades privadas',async()=>{
 const {rows:categories}=await pool.query("SELECT c.id FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id JOIN tournaments t ON t.organization_id=e.organization_id AND t.id=e.tournament_id WHERE c.organization_id=$1 AND c.status='published' AND e.status='published' AND t.status='published'",[ids.a]);
 let chosen:{id:string;scorers:any[]}|null=null;
 for(const category of categories){const response=await app.inject(`/api/v1/public/organizations/${ids.a}/categories/${category.id}/statistics`);if(response.statusCode===200&&response.json().available&&response.json().officialMatches>0&&response.json().tables?.some((table:any)=>table.rows.some((row:any)=>row.played>0))){chosen={id:category.id,scorers:response.json().scorers};break;}}
 assert.ok(chosen,'Debe existir una categoría publicada con resultados oficiales.');
 const templates=await request(adminA,'GET',`/organizations/${ids.a}/flyers/templates`);assert.equal(templates.statusCode,200);assert.equal(templates.json().kinds.includes('scorer'),false);
 const path=`/organizations/${ids.a}/flyers/preview`,payload={kind:'defense',sourceId:chosen.id,size:'square',pageNo:1,note:null,template:'paper'};
 assert.equal((await request(adminB,'POST',path,payload)).statusCode,403);
 const defense=await request(adminA,'POST',path,payload);assert.equal(defense.statusCode,200,defense.body);assert.match(defense.body,/Valla menos vencida/);assert.equal(/c[eé]dula|nacimiento|document_number/i.test(defense.body),false);
 const scorer=await request(adminA,'POST',path,{...payload,kind:'scorers'});
 assert.equal(scorer.statusCode,chosen.scorers.length?200:409,scorer.body);
 if(chosen.scorers.length){assert.match(scorer.body,/Goleadores/);assert.equal(/c[eé]dula|nacimiento|document_number/i.test(scorer.body),false);
  const source=await loadFlyerSource(pool,ids.a,'scorers',chosen.id,'square',1,null);assert.ok(source.lines.every(line=>line.homeName));
  const stats=await request(adminA,'GET',`/organizations/${ids.a}/categories/${chosen.id}/statistics`);
  const player=stats.json().players.find((item:{registrationId:string;publicName:boolean;goals:number})=>item.publicName&&item.goals>0);
  assert.ok(player);const individual={...payload,kind:'scorer',sourceId:player.registrationId};
  assert.equal((await request(adminB,'POST',path,individual)).statusCode,403);
  const flyer=await request(adminA,'POST',path,individual);assert.equal(flyer.statusCode,400,flyer.body);
 }
 const root=`/organizations/${ids.a}/flyers`;
 const exportPayload={...payload,format:'png',requestKey:randomUUID(),reason:'Estadística oficial sintética'};
 const created=await request(adminA,'POST',root,exportPayload);assert.equal(created.statusCode,202,created.body);
 await processFlyerJobs(pool,config.mediaDir,100);
 const file=await request(adminA,'GET',`${root}/${created.json().id}/file`);assert.equal(file.statusCode,200,file.body);
 assert.equal(file.rawPayload.readUInt32BE(16),1080);assert.equal(file.rawPayload.readUInt32BE(20),1080);
});
test('T08: campeón de final ida y vuelta usa el global de dos actas aprobadas',async()=>{
 const org=randomUUID(),first=randomUUID(),back=randomUUID(),firstDay=randomUUID(),backDay=randomUUID(),a=randomUUID(),b=randomUUID(),approvalA=randomUUID(),approvalB=randomUUID();
 const firstMatch={id:first,home_entry_id:a,away_entry_id:b,home_name:'Azul',away_name:'Blanco',category_name:'Libre',venue_name:'Central',court_label:'Uno',match_date:'2026-11-01',match_time:'18:00'};
 const backMatch={...firstMatch,id:back,home_entry_id:b,away_entry_id:a,home_name:'Blanco',away_name:'Azul',match_date:'2026-11-08',match_time:'18:00'};
 const fake={query:async(sql:string,params:any[])=>{
  if(sql.includes('FROM organizations WHERE'))return {rows:[{name:'Liga',logo_id:null}]};
  if(sql.includes('FROM fixture_position_blueprints b JOIN categories'))return {rows:[]};
  if(sql.includes('SELECT matchday_id FROM draft_matches'))return {rows:[{matchday_id:params[1]===back?backDay:firstDay}]};
  if(sql.includes('FROM matchdays md'))return {rows:[{id:params[1],ordinal:1,revision:1,snapshot:[params[1]===backDay?backMatch:firstMatch],edition_name:'Temporada',tournament_name:'Copa'}]};
  if(sql.includes('SELECT id FROM team_entries WHERE'))return {rows:[{id:a},{id:b}]};
  if(sql.includes('SELECT e.id,t.shield_id'))return {rows:[{id:a,shield_id:null},{id:b,shield_id:null}]};
  if(sql.includes('FROM match_records r JOIN match_acta_snapshots'))return {rows:[{approval_id:params[1]===back?approvalB:approvalA,snapshot:{score:params[1]===back?{home:1,away:1}:{home:2,away:1},shootout:{home:0,away:0},events:[]}}]};
  if(sql.includes('FROM fixture_bracket_slots s JOIN fixture_phases'))return {rows:[{match_id:first,return_match_id:back}]};
  throw new Error(`Consulta sintética inesperada: ${sql.slice(0,60)}`);
 }} as any;
 const champion=await loadFlyerSource(fake,org,'champion',back,'square',1,null);assert.equal(champion.title,'Azul');assert.deepEqual(champion.score,{home:2,away:3});assert.equal(champion.relatedApprovalId,approvalA);assert.equal(champion.approvalId,approvalB);
});

test('contraseña: cada cuenta cambia la propia; solo superadmin cambia la ajena', async () => {
  const userId = randomUUID();
  const account = username(`clave-${randomUUID().slice(0, 6)}`);
  const nextPassword = 'ClaveNuevaLocal!2026';
  const adminPassword = 'ClaveAdminLocal!2026';
  await pool.query('INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)', [userId, account, 'Operador de clave sintético', await hashPassword(password)]);
  await pool.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'operator','active')", [randomUUID(), ids.b, userId]);
  const first = await login(account, password, ids.b);
  const second = await login(account, password, ids.b);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/password', payload: { password: nextPassword } })).statusCode, 401);
  assert.equal((await request(adminA, 'POST', `/admin/users/${userId}/password`, { password: adminPassword })).statusCode, 403);
  assert.equal((await request(first, 'POST', '/auth/password', { password: 'corta' })).statusCode, 400);
  assert.equal((await request(first, 'POST', '/auth/password', { password: nextPassword, organization_id: ids.a })).statusCode, 400);
  const changed = await request(first, 'POST', '/auth/password', { password: nextPassword });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await request(first, 'GET', '/auth/me')).statusCode, 200);
  assert.equal((await request(second, 'GET', '/auth/me')).statusCode, 401);
  const oldLogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: account, password }, remoteAddress: '203.0.113.180' });
  assert.equal(oldLogin.statusCode, 401);
  const current = await login(account, nextPassword, ids.b);
  const reset = await request(owner, 'POST', `/admin/users/${userId}/password`, { password: adminPassword });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.equal((await request(first, 'GET', '/auth/me')).statusCode, 401);
  assert.equal((await request(current, 'GET', '/auth/me')).statusCode, 401);
  assert.equal((await request(owner, 'GET', '/auth/me')).statusCode, 200);
  await login(account, adminPassword, ids.b);
  const { rows: [stored] } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [userId]);
  assert.match(stored.password_hash, /^\$argon2id\$/);
  const { rows: logs } = await pool.query("SELECT action,before_data,after_data FROM audit_logs WHERE resource_id=$1 AND action IN ('password.changed','password.reset_by_admin') ORDER BY created_at", [userId]);
  assert.equal(logs.length, 2);
  assert.ok(logs.every((row) => row.before_data === null && row.after_data === null));
});

test('T04/T08: una página pública abierta recibe el sorteo publicado sin recargar', async () => {
  const tournament=await newTournament(ids.a,{...fiveRules,points:{win:2,draw:1,loss:0},initialPhase:null,competitionPlan:null});
  const {categoryId}=tournament.response.json();
  const base=`/organizations/${ids.a}/categories/${categoryId}/fixture/blueprint`;
  assert.equal((await request(adminA,'POST',base,fcfsPositionPlan)).statusCode,201);
  const team=await request(adminA,'POST',`/organizations/${ids.a}/teams`,{requestId:randomUUID(),name:`Club en directo ${runId}`,color:'#165D46',categoryId});
  assert.equal(team.statusCode,201,team.body);
  assert.equal((await request(adminA,'PATCH',`${base}/slots/A1`,{entryId:team.json().entryId})).statusCode,200);
  const plan=(await request(adminA,'GET',base)).json();
  const streamApp=await buildApp(config,pool);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const address=await streamApp.listen({host:'127.0.0.1',port:0});
    const response=await fetch(`${address}/api/v1/public/organizations/${ids.a}/results/stream`,{signal:controller.signal});
    assert.equal(response.status,200);
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    const first=await reader.read();
    assert.match(decoder.decode(first.value),/event: ready/);
    const published=await request(adminA,'POST',`${base}/publish-draw`,{expectedRevision:plan.blueprint.revision});
    assert.equal(published.statusCode,200,published.body);
    const publicPlayers=`/api/v1/public/organizations/${ids.a}/draws/${categoryId}/teams/${team.json().entryId}/players`;
    const roster=await app.inject({method:'GET',url:publicPlayers});
    assert.equal(roster.statusCode,200,roster.body);
    assert.deepEqual(roster.json(),[]);
    assert.equal((await app.inject({method:'GET',url:publicPlayers.replace(ids.a,ids.b)})).statusCode,404);
    let received='';
    while(!received.includes(`"categoryId":"${categoryId}"`)){
      const chunk=await reader.read();
      if(chunk.done)break;
      received+=decoder.decode(chunk.value);
    }
    assert.match(received,/event: draw/);
    assert.match(received,new RegExp(categoryId));
    const closingAt=Date.now();
    await streamApp.close();
    assert.ok(Date.now()-closingAt<3000,'El servidor debe cerrar SSE sin agotar el tiempo de reinicio.');
  }finally{
    clearTimeout(timeout);
    controller.abort();
    await streamApp.close();
  }
});
