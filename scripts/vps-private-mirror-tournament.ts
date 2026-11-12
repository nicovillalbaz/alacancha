import { randomUUID } from 'node:crypto';
import { createPool } from '@torneos/db';
import { csrfFor, digest, opaqueToken } from '../apps/api/src/security.ts';

// Ensayo integral. Nunca admite producción ni una API pública.
const url = new URL(process.env.DATABASE_URL || '');
if (process.env.NODE_ENV !== 'development' || url.hostname !== '127.0.0.1' || url.pathname !== '/torneos_stage' ||
  process.env.API_HOST !== '127.0.0.1' || process.env.API_PORT !== '4313' || process.env.WEB_ORIGIN !== 'http://127.0.0.1:4313')
  throw new Error('Solo se permite el espejo aislado en 127.0.0.1:4313.');

const pool = createPool(url.toString());
const base = 'http://127.0.0.1:4313';
const token = opaqueToken(), sessionId = randomUUID(), csrf = csrfFor(process.env.APP_SECRET!, token);
function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
async function api(path: string, method = 'GET', body?: object, status = 200): Promise<any> {
  const response = await fetch(base + path, { method, headers: {
    cookie: `torneos_session=${token}`,
    ...(body ? { 'content-type': 'application/json', origin: base, 'x-csrf-token': csrf } : {}),
  }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  if (response.status !== status) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result).slice(0, 500)}`);
  return result;
}
async function publicGet(path: string): Promise<any> {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  insist(response.status === 200, `Ruta pública ${path}: ${response.status}.`);
  return response.json();
}

try {
  const { rows: [account] } = await pool.query(`SELECT m.user_id,m.organization_id,t.id tournament_id,c.id category_id,ed.id edition_id
    FROM memberships m JOIN organizations o ON o.id=m.organization_id AND o.status='active'
    JOIN tournaments t ON t.organization_id=o.id JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id
    JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
    WHERE m.role='tournament_admin' AND m.status='active' AND t.name LIKE 'Copa Caacupé%' LIMIT 1`);
  insist(account, 'Falta la organización de prueba.');
  await pool.query("INSERT INTO sessions(id,user_id,token_hash,organization_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '4 hours')",
    [sessionId, account.user_id, digest(token), account.organization_id]);
  const org = account.organization_id, cat = account.category_id;
  const root = `/api/v1/organizations/${org}`, pub = `/api/v1/public/organizations/${org}`;
  const fixture = `${root}/categories/${cat}/fixture/blueprint`;
  const teams: any[] = await api(`${root}/teams`);
  const plan = await api(fixture);
  insist(teams.length === 10 && plan.games.length === 35 && plan.slots.every((slot: any) => slot.entry_id), 'El plan del espejo no está completo.');
  const slotOrder = new Map<string, number>(plan.slots.map((slot: any, index: number) => [slot.entry_id, index]));

  // Cada equipo obtiene dos identidades sintéticas sin documentos personales.
  const registrations = new Map<string, string[]>();
  for (const [index, team] of teams.entries()) {
    const path = `${root}/entries/${team.entry_id}`;
    let players: any[] = await api(`${path}/players`);
    if (!players.length) {
      for (const number of [1, 2]) {
        await api(`${path}/players`, 'POST', {
          givenNames: number === 1 ? 'Ensayo Goleador' : 'Ensayo Arquero', familyNames: `Equipo ${index + 1}`,
          documentKind: null, documentNumber: null, birthDate: '2000-01-01', registrationNumber: `${index + 1}-${number}`,
          origin: number === 1 ? { kind: 'none' } : { kind: 'external', teamName: 'Club de ensayo', city: 'Caacupé', league: null }, details: {},
        }, 201);
      }
      players = await api(`${path}/players`);
      insist(players.length === 2, `No se crearon los jugadores de ${team.name}.`);
      const submitted = await api(`${path}/good-faith/submit`, 'POST', {
        registrationIds: players.map(player => player.id), expectedVersion: 0, reason: 'Ensayo privado de torneo completo',
      }, 201);
      await api(`${path}/good-faith/review`, 'POST', { version: submitted.version, decision: 'approved', reason: 'Lista sintética aprobada para ensayo' });
      await api(`${root}/registrations/${players[0].id}/publication`, 'POST', { visible: true, reason: 'Jugador ficticio visible en ensayo' });
    }
    registrations.set(team.entry_id, players.map(player => player.id));
  }
  console.log(JSON.stringify({ phase: 'players', teams: teams.length, players: [...registrations.values()].reduce((n, ids) => n + ids.length, 0) }));

  const days = async (): Promise<any[]> => api(`${root}/editions/${account.edition_id}/matchdays`);
  const competition = async () => api(`${fixture}/competition`);
  async function publish(ordinal: number) {
    const day = (await days()).find(item => item.ordinal === ordinal);
    insist(day && day.matches.length, `No existe J${ordinal} con partidos.`);
    if (day.status === 'draft') {
      const preview = await api(`${root}/matchdays/${day.id}/preview`);
      insist(preview.missing.length === 0, `J${ordinal} sin publicar: ${JSON.stringify(preview.missing)}`);
      await api(`${root}/matchdays/${day.id}/publish`, 'POST', { expectedRevision: day.revision, reason: 'Ensayo integral en espejo privado' }, 201);
    }
    return day;
  }
  async function event(matchId: string, kind: string, entryId: string, playerId: string | null, period: string | null = 'PT', cardCode?: string) {
    return api(`${root}/matches/${matchId}/events`, 'POST', {
      clientEventId: randomUUID(), kind, teamEntryId: entryId, registrationId: playerId,
      period, minute: null, ...(cardCode ? { cardCode } : {}),
    }, 201);
  }
  async function play(match: any, homeGoals: number, awayGoals: number, shootout?: [number, number], extras: string[] = []) {
    const path = `${root}/matches/${match.id}`;
    const { rows: [existing] } = await pool.query('SELECT status FROM match_records WHERE organization_id=$1 AND match_id=$2', [org, match.id]);
    if (existing?.status === 'official') return;
    insist(!existing || existing.status === 'capturing', `Partido ${match.id} en estado ${existing?.status}: se requiere revisión.`);
    let record = existing ? await api(`${path}/record`) : await api(`${path}/record/start`, 'POST', {}, 201);
    insist(record.home.players.length > 0 && record.away.players.length > 0, `Falta plantel congelado en ${match.id}.`);
    const home = record.home.entryId, away = record.away.entryId;
    const scorer = (id: string) => registrations.get(id)![0];
    for (let n = record.score.home; n < homeGoals; n++) record = await event(match.id, n === 0 && extras.includes('penalty') ? 'penalty' : 'goal', home, scorer(home));
    for (let n = record.score.away; n < awayGoals; n++) record = await event(match.id, 'goal', away, scorer(away), 'ST');
    if (!existing && extras.includes('penalty_miss')) record = await event(match.id, 'penalty_miss', away, scorer(away), 'ST');
    if (!existing && extras.includes('blue')) record = await event(match.id, 'custom_card', home, scorer(home), 'ST', 'azul');
    if (!existing && extras.includes('yellow')) record = await event(match.id, 'yellow', away, scorer(away), 'ST');
    if (!existing && extras.includes('void')) {
      record = await event(match.id, 'goal', home, scorer(home));
      const added = record.events.at(-1);
      record = await api(`${path}/events/${added.id}/void`, 'POST', { clientEventId: randomUUID(), reason: 'Corrección individual de ensayo' }, 201);
    }
    if (shootout) {
      for (let n = 0; n < Math.max(...shootout); n++) {
        if (n >= record.shootout.home && n < shootout[0]) record = await event(match.id, 'shootout_goal', home, scorer(home), null);
        if (n >= record.shootout.away && n < shootout[1]) record = await event(match.id, 'shootout_goal', away, scorer(away), null);
      }
      if (!existing) record = await event(match.id, 'shootout_miss', shootout[0] > shootout[1] ? away : home, scorer(shootout[0] > shootout[1] ? away : home), null);
    }
    insist(record.score.home === homeGoals && record.score.away === awayGoals, `Marcador incorrecto en ${match.id}.`);
    if (shootout) insist(record.shootout.home === shootout[0] && record.shootout.away === shootout[1], `Tanda incorrecta en ${match.id}.`);
    record = (await api(`${path}/acta/submit`, 'POST', { reason: 'Ensayo privado de acta' }, 201)).record;
    record = (await api(`${path}/acta/approve`, 'POST', { reason: 'Ensayo privado de acta y resultado', overrideSignoffs: true }, 201)).record;
    insist(record.status === 'official', `Acta no oficial: ${match.id}.`);
  }

  // Primera etapa: todos los encuentros empatados salvo la victoria inicial ya ensayada.
  for (let ordinal = 1; ordinal <= 9; ordinal++) {
    const day = await publish(ordinal);
    for (const [index, match] of day.matches.entries()) {
      await play(match, 1, 1, undefined, ordinal === 2 && index === 0 ? ['blue', 'penalty_miss', 'void'] : ordinal === 3 && index === 0 ? ['yellow'] : []);
    }
    console.log(JSON.stringify({ phase: 'groups', jornada: ordinal, official: (await competition()).competition.official.groups }));
  }
  let state = await competition();
  insist(state.competition.official.groups === 25, 'No quedaron oficiales los 25 partidos de grupos.');
  for (const table of ['A', 'B'] as const) {
    for (let attempt = 0; attempt < 5; attempt++) {
      state = await competition();
      const group = state.competition[table === 'A' ? 'groupA' : 'groupB'].groups.find((item: any) => item.unresolved);
      if (!group) break;
      await api(`${fixture}/tiebreak`, 'POST', { table, position: group.position,
        entryOrder: [...group.teamIds].sort((a: string, b: string) => slotOrder.get(a)! - slotOrder.get(b)!),
        reason: 'Desempate manual ficticio solo para ensayo privado',
      });
    }
  }
  state = await competition();
  insist(['MM1','MM2','MM3','MM4'].every(code => state.competition.participants[code]?.homeEntryId && state.competition.participants[code]?.awayEntryId),
    `No se habilitaron cuartos: ${state.competition.blocked}.`);
  console.log(JSON.stringify({ phase: 'quarters_ready', official: state.competition.official.groups }));

  for (let ordinal = 10; ordinal <= 11; ordinal++) {
    const day = await publish(ordinal);
    for (const match of day.matches) {
      const code = (await competition()).matches.find((item: any) => item.match_id === match.id)?.code;
      insist(code, `Cuarto sin código: ${match.id}.`);
      const drawn = code === 'MM1' || code === 'MM3';
      await play(match, drawn ? 1 : 2, drawn ? 1 : 0, drawn ? [3, 2] : undefined, drawn ? ['penalty_miss'] : []);
    }
    console.log(JSON.stringify({ phase: 'quarters', jornada: ordinal, official: (await competition()).competition.official.quarterfinals }));
  }
  state = await competition();
  insist(state.competition.official.quarterfinals === 4 && state.competition.quarterfinalWinners.length === 4, 'Los cuatro cuartos no tienen ganador.');
  for (let attempt = 0; attempt < 5 && state.competition.blocked === 'general_tiebreak'; attempt++) {
    const group = state.competition.general.groups.find((item: any) => item.unresolved && item.teamIds.filter((id: string) => state.competition.quarterfinalWinners.includes(id)).length > 1);
    insist(group, 'No aparece el empate que bloquea la siembra.');
    await api(`${fixture}/tiebreak`, 'POST', { table: 'general', position: group.position,
      entryOrder: [...group.teamIds].sort((a: string, b: string) => slotOrder.get(a)! - slotOrder.get(b)!),
      reason: 'Orden general ficticio solo para ensayo privado',
    });
    state = await competition();
  }
  insist(state.competition.seeds.length === 4, `No hay cuatro sembrados: ${state.competition.blocked}.`);
  console.log(JSON.stringify({ phase: 'finals_ready', seeds: state.competition.seeds }));

  // Dos líderes acaban empatados en puntos para ensayar la decisión de partido extra.
  for (let ordinal = 12; ordinal <= 14; ordinal++) {
    const day = await publish(ordinal);
    for (const match of day.matches) {
      const stateNow = await competition();
      const homeSeed = stateNow.competition.seeds.indexOf(match.home_entry_id) + 1;
      const awaySeed = stateNow.competition.seeds.indexOf(match.away_entry_id) + 1;
      insist(homeSeed && awaySeed, `Finales sin participantes: ${match.id}.`);
      const oneWins = [homeSeed, awaySeed].sort().join('-') === '1-3';
      const twoWins = [homeSeed, awaySeed].sort().join('-') === '2-4';
      const winner = oneWins ? 1 : twoWins ? 2 : null;
      await play(match, winner ? (homeSeed === winner ? 2 : 0) : 1, winner ? (awaySeed === winner ? 2 : 0) : 1);
    }
    console.log(JSON.stringify({ phase: 'finals', jornada: ordinal, official: (await competition()).competition.official.quadrangular }));
  }
  state = await competition();
  insist(state.competition.official.quadrangular === 6 && state.titleTie.length === 2, `No se logró empate por el título: ${JSON.stringify(state.titleTie)}.`);
  let extra = state.titleExtra;
  if (!extra?.matchId) {
    const noExtra = await api(`${fixture}/title-extra`, 'POST', { decision: 'no_extra' });
    insist(noExtra.decision === 'no_extra' && noExtra.matchId === null, 'La decisión sin extra falló.');
    extra = await api(`${fixture}/title-extra`, 'POST', { decision: 'extra', homeEntryId: state.titleTie[0], awayEntryId: state.titleTie[1] });
  }
  insist(extra.matchId, 'No se preparó el desempate por el título.');
  const extraDay = (await days()).find(item => item.ordinal === 15);
  insist(extraDay?.matches.length === 1, 'J15 no contiene un único partido extra.');
  if (!extraDay.matches[0].venue_id) {
    const resources = await api(`${root}/tournaments/${account.tournament_id}/resources`);
    const venueId = resources.venues[0]?.id || (await api(`${root}/tournaments/${account.tournament_id}/venues`, 'POST',
      { name: 'Polideportivo de ensayo', city: 'Caacupé' }, 201)).id;
    await api(`${root}/fixture/matches/${extra.matchId}/schedule`, 'PATCH', {
      matchdayId: extraDay.id, venueId, courtLabel: 'Cancha principal',
      date: '2026-12-22', time: '20:00', durationMinutes: 60, refereeName: null,
      expectedRevision: extraDay.matches[0].schedule_revision, reason: 'Programación ficticia del desempate en espejo privado',
    });
  }
  const last = await publish(15);
  insist(last.matches.length === 1 && last.matches[0].id === extra.matchId, 'J15 no contiene el partido extra.');
  await play(last.matches[0], 1, 1, [3, 2]);

  const final = await competition();
  const publicFixture: any[] = await publicGet(`${pub}/fixture`);
  const publicStats = await publicGet(`${pub}/categories/${cat}/statistics`);
  const publicCup = await publicGet(`${pub}/draws/${cat}/competition`);
  const publicTeam = await publicGet(`${pub}/draws/${cat}/teams/${teams[0].entry_id}/players`);
  insist(final.competition.official.groups === 25 && final.competition.official.quarterfinals === 4 && final.competition.official.quadrangular === 6, 'Faltan actas ordinarias.');
  insist(final.titleExtra?.winnerEntryId === state.titleTie[0], 'El extra no definió al campeón esperado.');
  insist(publicFixture.length === 15 && publicFixture.flatMap(day => day.matches).length === 36, 'El público no ve los 36 partidos y 15 jornadas.');
  insist(publicStats.officialMatches === 36 && publicStats.scorers.length > 0 && publicStats.defense.length > 0, 'Estadísticas públicas incompletas.');
  insist(publicCup.available && publicCup.competition.official.groups === 25 && publicCup.competition.official.quarterfinals === 4 &&
    publicCup.competition.official.quadrangular === 6 && publicCup.titleExtra?.winnerEntryId === state.titleTie[0], 'La Copa pública no refleja toda la secuencia.');
  insist(publicCup.competition.groupA.groups.length === 5 && publicCup.competition.groupB.groups.length === 5 && publicCup.competition.seeds.length === 4,
    'Las dos tablas de grupo o la siembra no están disponibles.');
  const publicPayload = JSON.stringify([publicCup, publicStats, publicFixture, publicTeam]);
  insist(publicTeam.length === 1 && publicCup.players.length === 10 && publicStats.rosters.every((team: any) => team.players.length === 1) &&
    !publicPayload.includes('birthDate') && !publicPayload.includes('documentNumber') && !publicPayload.includes('registrationNumber'),
    'El portal filtró mal la identidad privada de ensayo.');
  const flyerCases = [
    { kind: 'result', sourceId: extra.matchId }, { kind: 'standings', sourceId: cat },
    { kind: 'scorers', sourceId: cat }, { kind: 'defense', sourceId: cat },
  ];
  for (const item of flyerCases) {
    const body = { kind: item.kind, sourceId: item.sourceId, size: 'square', pageNo: 1, note: null, template: 'forest' };
    const preview = await api(`${root}/flyers/preview`, 'POST', body);
    insist(typeof preview === 'string' && preview.includes('<svg'), `No se generó la vista previa de ${item.kind}.`);
    const exported = await api(`${root}/flyers`, 'POST', { ...body, format: 'png', requestKey: randomUUID(), reason: 'Ensayo privado de cierre del torneo' }, 202);
    let job = exported;
    for (let attempt = 0; attempt < 35 && !['ready', 'failed'].includes(job.status); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      job = (await api(`${root}/flyers`)).find((row: any) => row.id === exported.id);
    }
    insist(job?.status === 'ready', `Flyer ${item.kind} fallido: ${job?.status}.`);
    const file = await fetch(`${base}${root}/flyers/${exported.id}/file`, { headers: { cookie: `torneos_session=${token}` }, signal: AbortSignal.timeout(10000) });
    insist(file.status === 200 && file.headers.get('content-type')?.startsWith('image/png') && (await file.arrayBuffer()).byteLength > 1000,
      `Flyer ${item.kind} no descargable.`);
    console.log(JSON.stringify({ phase: 'flyer', kind: item.kind, status: job.status }));
  }
  const { rows: [totals] } = await pool.query(`SELECT (SELECT count(*) FROM players WHERE organization_id=$1)::int players,
    (SELECT count(*) FROM match_records WHERE organization_id=$1 AND status='official')::int official,
    (SELECT count(*) FROM match_record_events WHERE organization_id=$1 AND kind='shootout_goal')::int shootout_goals`, [org]);
  console.log(JSON.stringify({ phase: 'complete', ...totals, publicJornadas: publicFixture.length, publicScorers: publicStats.scorers.length,
    titleTie: final.titleTie, champion: final.titleExtra.winnerEntryId, extraScore: final.titleExtra.score, flyers: flyerCases.map(item => item.kind) }));
} finally {
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [sessionId]).catch(() => undefined);
  await pool.end();
}
