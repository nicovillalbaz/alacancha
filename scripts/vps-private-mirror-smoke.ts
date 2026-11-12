import { randomUUID } from 'node:crypto';
import { createPool } from '@torneos/db';
import { csrfFor, digest, opaqueToken } from '../apps/api/src/security.ts';

const url = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV !== 'development' || url.hostname !== '127.0.0.1' || url.pathname !== '/torneos_stage' ||
    process.env.API_HOST !== '127.0.0.1' || process.env.API_PORT !== '4313' || process.env.WEB_ORIGIN !== 'http://127.0.0.1:4313') {
  throw new Error('Este barrido solo admite el espejo privado en 127.0.0.1:4313.');
}
const pool = createPool(url.toString());
const base = 'http://127.0.0.1:4313';
const token = opaqueToken();
const sessionId = randomUUID();
const csrf = csrfFor(process.env.APP_SECRET!, token);
function expect(condition: unknown, detail: string): asserts condition { if (!condition) throw new Error(detail); }

async function request(path: string, method = 'GET', body?: object, expected = 200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { cookie: `torneos_session=${token}`, ...(body ? { 'content-type': 'application/json', origin: base, 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() as any : await response.text();
  if (response.status !== expected) throw new Error(`${method} ${path}: ${response.status}, ${result?.code || result?.message || 'respuesta inesperada'}`);
  return result;
}

try {
  const { rows: [account] } = await pool.query(`SELECT m.user_id,m.organization_id,o.name organization_name,t.id tournament_id,c.id category_id,ed.id edition_id
    FROM memberships m JOIN organizations o ON o.id=m.organization_id AND o.status='active'
    JOIN tournaments t ON t.organization_id=o.id JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id
    JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
    WHERE m.role='tournament_admin' AND m.status='active' AND t.name LIKE 'Copa Caacupé%' LIMIT 1`);
  expect(account, 'No se encontró la cuenta organizadora de Caacupé en el espejo.');
  await pool.query("INSERT INTO sessions(id,user_id,token_hash,organization_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')", [sessionId, account.user_id, digest(token), account.organization_id]);
  const org = account.organization_id, tournament = account.tournament_id, category = account.category_id;
  const root = `/api/v1/organizations/${org}`;
  const publicRoot = `/api/v1/public/organizations/${org}`;
  const identity = await request('/api/v1/auth/me');
  expect(identity.organizationId === org, 'La sesión del espejo no tiene el ámbito esperado.');
  const [organizations, tournaments, categories, teams, blueprint, competition, payments, templates, publicDraw, publicFixture, publicStats] = await Promise.all([
    request(root), request(`${root}/tournaments`), request(`${root}/categories`), request(`${root}/teams`),
    request(`${root}/categories/${category}/fixture/blueprint`), request(`${root}/categories/${category}/fixture/blueprint/competition`),
    request(`${root}/tournaments/${tournament}/payments`), request(`${root}/flyers/templates`),
    request(`${publicRoot}/draws`), request(`${publicRoot}/fixture`), request(`${publicRoot}/categories/${category}/statistics`),
  ]);
  expect(organizations.id === org, 'La organización privada no coincide.');
  expect(Array.isArray(tournaments) && tournaments.length === 1, 'Torneos incompletos.');
  expect(Array.isArray(categories) && categories.length === 1, 'Categoría incompleta.');
  expect(Array.isArray(teams) && teams.length === 10, 'Los diez equipos no aparecen.');
  expect(blueprint.games?.length === 35, 'El plan no conserva sus 35 cruces.');
  expect(competition.competition, 'No aparece la competencia privada.');
  expect(payments.cards?.some((card: { label: string }) => card.label === 'Azul'), 'La tarjeta Azul no figura en Pagos.');
  const blue = payments.cards.find((card: { label: string }) => card.label === 'Azul');
  const paymentRoot = `${root}/tournaments/${tournament}/payments`;
  const rateAmount = 10000;
  if (payments.rates.customCardRates[blue.key] !== rateAmount) {
    await request(`${paymentRoot}/rates`, 'POST', { yellowGuaranies: payments.rates.yellowGuaranies, redGuaranies: payments.rates.redGuaranies, customCardRates: { ...payments.rates.customCardRates, [blue.key]: rateAmount } });
  }
  const afterRates = await request(paymentRoot);
  expect(afterRates.rates.customCardRates[blue.key] === rateAmount, 'La tarifa Azul no quedó disponible.');
  const description = 'Ensayo privado de tarjeta Azul';
  let charge = afterRates.entries.find((entry: { kind: string; description: string }) => entry.kind === 'charge' && entry.description === description);
  if (!charge) charge = await request(paymentRoot, 'POST', { kind: 'charge', category: 'fine_other', entryId: teams[0].entry_id, linkedChargeId: null, amountGuaranies: rateAmount, description, occurredOn: '2026-11-12' }, 201);
  expect(charge.amountGuaranies === rateAmount || charge.amount_guaranies === rateAmount, 'La multa Azul no conserva el importe.');
  const beforePayment = await request(paymentRoot);
  if (!beforePayment.entries.some((entry: { linked_charge_id: string }) => entry.linked_charge_id === charge.id)) {
    await request(paymentRoot, 'POST', { kind: 'income', category: 'fine_payment', entryId: teams[0].entry_id, linkedChargeId: charge.id, amountGuaranies: rateAmount, description: 'Cobro de ensayo Azul', occurredOn: '2026-11-12' }, 201);
  }
  const afterPayment = await request(paymentRoot);
  expect(afterPayment.entries.find((entry: { id: string }) => entry.id === charge.id)?.outstanding_guaranies === 0, 'El cobro de Azul no saldó la multa.');
  expect(templates.templates?.length > 0, 'No hay plantillas de flyer.');
  expect(Array.isArray(publicDraw) && publicDraw.length > 0, 'El sorteo público no aparece.');
  expect(publicFixture, 'El fixture público no responde.');
  expect(publicStats, 'Las estadísticas públicas no responden.');
  await request(`/api/v1/organizations/${randomUUID()}/teams`, 'GET', undefined, 403);
  const fixtureRoot = `${root}/categories/${category}/fixture/blueprint`;
  const firstSync = await request(`${fixtureRoot}/sync`, 'POST', {}, 200);
  if (firstSync.blocked === 'opening') {
    const firstTwo = blueprint.games.filter((game: { stage: string; sporting_round: string }) => game.stage === 'groups' && game.sporting_round === 'F1').slice(0, 2).map((game: { code: string }) => game.code);
    expect(firstTwo.length === 2, 'La primera Fecha no contiene dos cruces para el ensayo.');
    await request(`${fixtureRoot}/opening`, 'PATCH', { firstJornadaCodes: firstTwo });
  }
  const synced = await request(`${fixtureRoot}/sync`, 'POST', {}, 200);
  const days = await request(`${root}/editions/${account.edition_id}/matchdays`);
  expect(Array.isArray(days) && days.length > 0, 'La sincronización no creó jornadas.');
  const firstDay = days.find((day: { ordinal: number }) => day.ordinal === 1);
  expect(firstDay?.matches?.length === 2, 'La primera jornada no tiene los dos partidos previstos.');
  const preview = await request(`${root}/matchdays/${firstDay.id}/preview`);
  expect(preview.missing?.length === 0, `La jornada de prueba no está lista: ${JSON.stringify(preview.missing)}`);
  if (firstDay.status === 'draft') await request(`${root}/matchdays/${firstDay.id}/publish`, 'POST', { expectedRevision: firstDay.revision, reason: 'Ensayo privado del espejo' }, 201);
  const publicDays = await request(`${publicRoot}/fixture`);
  expect(publicDays.some((day: { id: string; matches: unknown[] }) => day.id === firstDay.id && day.matches.length === 2), 'La jornada publicada no se ve en el espejo público.');
  const matchId = firstDay.matches[0].id as string;
  const matchRoot = `${root}/matches/${matchId}`;
  const { rowCount: hasRecord } = await pool.query('SELECT 1 FROM match_records WHERE organization_id=$1 AND match_id=$2', [org, matchId]);
  let record = hasRecord ? await request(`${matchRoot}/record`) : await request(`${matchRoot}/record/start`, 'POST', {}, 201);
  if (record.events.length === 0) {
    record = await request(`${matchRoot}/events`, 'POST', { clientEventId: randomUUID(), kind: 'penalty', teamEntryId: record.home.entryId, registrationId: null, period: 'PT', minute: null }, 201);
    record = await request(`${matchRoot}/events`, 'POST', { clientEventId: randomUUID(), kind: 'penalty_miss', teamEntryId: record.away.entryId, registrationId: null, period: 'ST', minute: null }, 201);
  }
  expect(record.score.home === 1 && record.score.away === 0, 'Gol de penal o penal errado alteraron mal el marcador.');
  if (record.status === 'capturing') record = (await request(`${matchRoot}/acta/submit`, 'POST', { reason: 'Ensayo privado del espejo' }, 201)).record;
  if (record.status === 'submitted') record = (await request(`${matchRoot}/acta/approve`, 'POST', { reason: 'Ensayo privado del espejo', overrideSignoffs: true }, 201)).record;
  expect(record.status === 'official', 'El acta del partido de prueba no quedó oficial.');
  const publicResults = await request(`${publicRoot}/fixture`);
  const publicMatch = publicResults.flatMap((day: { matches: any[] }) => day.matches).find((match: { id: string }) => match.id === matchId);
  expect(publicMatch?.result?.score?.home === 1 && publicMatch.result.score.away === 0, 'El resultado oficial no aparece en el espejo público.');
  const flyerCases = [
    { kind: 'result', sourceId: matchId, format: 'png', type: 'image/png' },
    { kind: 'result', sourceId: matchId, format: 'jpg', type: 'image/jpeg' },
    { kind: 'result', sourceId: matchId, format: 'pdf', type: 'application/pdf' },
    { kind: 'matchday', sourceId: firstDay.id as string, format: 'png', type: 'image/png' },
  ];
  for (const flyerCase of flyerCases) {
    const previewSvg = await request(`${root}/flyers/preview`, 'POST', { kind: flyerCase.kind, sourceId: flyerCase.sourceId, size: 'square', pageNo: 1, note: null, template: 'forest' });
    expect(typeof previewSvg === 'string' && previewSvg.includes('<svg'), `No hay vista previa SVG de ${flyerCase.kind}.`);
    const exportRow = await request(`${root}/flyers`, 'POST', { kind: flyerCase.kind, sourceId: flyerCase.sourceId, size: 'square', pageNo: 1, note: null, template: 'forest', format: flyerCase.format, requestKey: randomUUID(), reason: 'Ensayo privado del espejo' }, 202);
    let flyer = exportRow;
    for (let attempt = 0; attempt < 30 && flyer.status !== 'ready' && flyer.status !== 'failed'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      flyer = (await request(`${root}/flyers`)).find((item: { id: string }) => item.id === exportRow.id);
    }
    expect(flyer?.status === 'ready', `El flyer ${flyerCase.kind}/${flyerCase.format} no quedó listo: ${flyer?.status || 'sin estado'}.`);
    const file = await fetch(`${base}${root}/flyers/${exportRow.id}/file`, { headers: { cookie: `torneos_session=${token}` }, signal: AbortSignal.timeout(10000) });
    expect(file.status === 200 && file.headers.get('content-type')?.startsWith(flyerCase.type) && (await file.arrayBuffer()).byteLength > 1000, `No se puede descargar ${flyerCase.kind}/${flyerCase.format}.`);
  }
  console.log(JSON.stringify({ mirror: 'ok', organization: account.organization_name, teams: teams.length, plannedGames: blueprint.games.length, days: days.length, synced, publishedMatches: firstDay.matches.length, score: record.score, flyers: flyerCases.map(item => `${item.kind}/${item.format}`) }));
} finally {
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [sessionId]).catch(() => undefined);
  await pool.end();
}
