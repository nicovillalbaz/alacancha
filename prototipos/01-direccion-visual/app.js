'use strict';

// Exploración visual aislada. No hay autenticación, API ni persistencia de negocio.
const app = document.querySelector('#app');
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const e = escapeHtml;
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 5 4-2 6H9l-2-6 5-4Zm0 0V3m5 8 4-1m-6 7 2 3m-8-3-2 3m0-9-4-1"/>',
  trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm3 12v5m4-5v5m-7 1h10M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4"/>',
  shield: '<path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Z"/><path d="m8 12 3 3 5-6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m10 5-7 7 7 7M3 12h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8m-8 4h6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  exit: '<path d="M9 4H4v16h5m5-4 4-4-4-4m-5 4h13"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5"/>',
  undo: '<path d="M3 10h10a7 7 0 0 1 0 14M3 10l5-5m-5 5 5 5" transform="translate(0 -3)"/>',
  chart: '<path d="M4 3v18h17M8 17v-5m5 5V7m5 10v-8"/>',
};
const icon = (name, small = false) => `<svg class="icon${small ? ' sm' : ''}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.grid}</svg>`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${e(text)}</span>`;
const teams = [
  { id: 'parque', name: 'Del Parque', full: 'Club Del Parque', city: 'Luque', initials: 'DP', color: '#1c6a4b', light: '#e9f2df', players: 8, status: 'Lista en revisión' },
  { id: 'union', name: 'Unión Central', full: 'Unión Central', city: 'San Lorenzo', initials: 'UC', color: '#2d547e', light: '#dce9f1', players: 12, status: 'Lista aprobada' },
  { id: 'norte', name: 'Sportivo Norte', full: 'Sportivo Norte', city: 'Lambaré', initials: 'SN', color: '#9b403d', light: '#f6e3d7', players: 10, status: 'Lista aprobada' },
  { id: 'barrio', name: 'Barrio Nuevo', full: 'Deportivo Barrio Nuevo', city: 'Fernando de la Mora', initials: 'BN', color: '#8b6429', light: '#f6ebcf', players: 11, status: 'Lista en revisión' },
];
const team = (id) => teams.find((item) => item.id === id) || teams[0];
function crest(id, large = false) {
  const item = team(id);
  return `<svg class="crest${large ? ' lg' : ''}" viewBox="0 0 48 56" role="img" aria-label="Escudo de muestra de ${e(item.name)}"><path fill="${item.color}" d="M3 3h42v26c0 12-21 24-21 24S3 41 3 29Z"/><path fill="none" stroke="${item.light}" stroke-width="1.2" d="M7 7h34v21c0 10-17 20-17 20S7 38 7 28Z"/><path fill="${item.light}" opacity=".14" d="m7 34 34-22v9L14 41Z"/><path stroke="${item.light}" stroke-width="1.4" d="M18 15h12m-6-4v8"/><text x="24" y="34" text-anchor="middle" fill="${item.light}" font-family="system-ui,sans-serif" font-size="13" font-weight="700">${item.initials}</text></svg>`;
}
const players = [
  { id: 'p1', first: 'Diego', last: 'Rojas', number: 10, ficha: 'F-010', origin: 'Club Del Parque · Luque', state: 'Aprobado', position: 'Delantero' },
  { id: 'p2', first: 'Luis', last: 'Vera', number: 7, ficha: 'F-007', origin: 'Sportivo Las Palmas · Areguá', state: 'Aprobado', position: 'Mediocampista' },
  { id: 'p3', first: 'Bruno', last: 'Duarte', number: 1, ficha: 'F-001', origin: 'Sin equipo anterior', state: 'Aprobado', position: 'Arquero' },
  { id: 'p4', first: 'Alan', last: 'Benítez', number: 5, ficha: 'F-005', origin: 'Club Del Parque · Luque', state: 'Aprobado', position: 'Defensor' },
  { id: 'p5', first: 'Santiago', last: 'López', number: 8, ficha: 'F-008', origin: 'Club Del Parque · Luque', state: 'Aprobado', position: 'Mediocampista' },
  { id: 'p6', first: 'Iván', last: 'Paredes', number: 4, ficha: 'F-004', origin: 'Unión Central · San Lorenzo', state: 'Aprobado', position: 'Defensor' },
  { id: 'p7', first: 'Nicolás', last: 'Gómez', number: 11, ficha: 'F-011', origin: 'Independiente del Este · Itauguá', state: 'Observado', position: 'Delantero' },
  { id: 'p8', first: 'Tomás', last: 'Acosta', number: 14, ficha: 'F-014', origin: 'Sportivo Norte · Lambaré', state: 'Borrador', position: 'Defensor' },
];
const awayPlayers = [{ id: 'v1', first: 'Mateo', last: 'Silva', number: 9 }, { id: 'v2', first: 'Ángel', last: 'Giménez', number: 6 }, { id: 'v3', first: 'Lucas', last: 'Medina', number: 1 }];
const state = {
  rosterFilter: 'Todos',
  searchByList: { teams: '', roster: '' },
  scheduleDrafts: {},
  draft: { first: '', last: '', document: '', birth: '', ficha: '', issuer: '', number: '', originKind: 'external', originTeam: '', originCity: '', internalTeam: '' },
  fixture: [{ id: 1, home: 'parque', away: 'union', time: '16:00', court: 'Cancha 1', day: 'Sáb. 31 oct.', official: true }, { id: 2, home: 'norte', away: 'barrio', time: '17:15', court: 'Cancha 1', day: 'Sáb. 31 oct.', official: true }],
  events: [{ id: 1, kind: 'gol', team: 'parque', player: 'Diego Rojas', period: 'first', minute: null }, { id: 2, kind: 'gol', team: 'union', player: 'Mateo Silva', period: 'first', minute: null }, { id: 3, kind: 'amarilla', team: 'union', player: 'Ángel Giménez', period: 'second', minute: null }, { id: 4, kind: 'gol', team: 'parque', player: 'Luis Vera', period: 'second', minute: null }],
  gameState: 'Captura abierta', eventTeam: 'parque',
  eventDraft: { period: '', minute: '' },
  quickFeedback: '', quickAddedIds: [],
  admins: [{ id: 'ana', name: 'Ana Martínez', organization: 'Liga de la Comunidad', initials: 'AM', status: 'Activo' }, { id: 'carlos', name: 'Carlos Benítez', organization: 'Liga del Río', initials: 'CB', status: 'Pendiente' }],
  scheduleHistory: [],
  accessHistory: [], error: '', toast: '', search: '',
};
const roleNames = { organizador: 'Administrador de torneo', equipo: 'Administrador de equipo', planillero: 'Planillero', superadmin: 'Superadmin', publico: 'Público' };
let toastTimer;
let current = { role: 'organizador', route: 'inicio' };
const positions = new Map();
let lastHash = '';
let quickEventSequence = 0;
const quickTapTimes = new Map();
const routeHref = (route, role = current.role) => `#/${role}/${route}`;
const link = (route, text, symbol = '', cls = 'btn', role = current.role) => `<a class="${cls}" href="${routeHref(route, role)}">${symbol ? icon(symbol) : ''}${e(text)}</a>`;
const button = (action, text, symbol = '', cls = 'btn', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${symbol ? icon(symbol) : ''}${e(text)}</button>`;
const notice = (text, tone = '') => `<div class="notice ${tone}" ${tone === 'error' ? 'role="alert" tabindex="-1"' : ''}>${icon(tone === 'error' ? 'info' : tone === 'amber' ? 'clock' : 'info')}<p>${e(text)}</p></div>`;
const heading = (title, sub = '', action = '') => `<div class="page-heading"><div><h1 tabindex="-1">${e(title)}</h1>${sub ? `<p>${e(sub)}</p>` : ''}</div>${action}</div>`;
const back = (route, text) => `<a class="back-link" href="${routeHref(route)}">${icon('back', true)}${e(text)}</a>`;
const nameOf = (person) => `${person.first} ${person.last}`;
const approved = () => players.filter((person) => person.state === 'Aprobado');
const eventPeriods = { first: 'Primer tiempo', second: 'Segundo tiempo', extra: 'Tiempo extra' };
const shortPeriods = { first: 'PT', second: 'ST', extra: 'TE' };
function eventMoment(event) {
  const minute = Number.isInteger(event.minute) ? `${event.minute}′` : '';
  return [eventPeriods[event.period] || '', minute].filter(Boolean).join(' · ');
}

function navigation() {
  if (current.role === 'superadmin') return [['inicio', 'Inicio', 'home'], ['administradores', 'Administradores', 'users'], ['organizaciones', 'Organizaciones', 'grid'], ['accesos', 'Accesos', 'shield']];
  if (current.role === 'equipo') return [['mi-equipo', 'Mi equipo', 'shield'], ['buena-fe', 'Buena fe', 'users'], ['fixture', 'Partidos', 'calendar'], ['sanciones', 'Sanciones', 'file']];
  if (current.role === 'planillero') return [['partidos', 'Mis partidos', 'calendar'], ['partido', 'Partido activo', 'ball'], ['acta', 'Acta', 'file']];
  if (current.role === 'publico') return [['torneo', 'Torneo', 'trophy'], ['fixture', 'Fixture', 'calendar'], ['resultados', 'Resultados', 'ball'], ['tablas', 'Tablas', 'chart'], ['goleadores', 'Goleadores', 'users']];
  return [['inicio', 'Inicio', 'home'], ['equipos', 'Equipos', 'users'], ['fixture', 'Fixture', 'calendar'], ['partidos', 'Partidos', 'ball'], ['torneo', 'Torneo', 'trophy']];
}
function isActive(route) {
  if (route === 'equipos' || route === 'mi-equipo') return current.route.startsWith('equipo') || ['mi-equipo', 'comision', 'tecnico'].includes(current.route) || (current.role === 'organizador' && (current.route.includes('jugador') || current.route === 'buena-fe'));
  if (route === 'partidos') return current.route.startsWith('partido') || current.route === 'acta';
  return current.route === route || current.route.startsWith(`${route}/`);
}
function shell(content) {
  const nav = navigation().map(([route, text, symbol]) => `<a href="${routeHref(route)}" class="${isActive(route) ? 'active' : ''}" ${isActive(route) ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${e(text)}</span></a>`).join('');
  const context = current.role === 'superadmin' ? 'Administración general' : 'Copa de la Comunidad';
  return `<div class="shell"><aside class="sidebar"><a class="sidebar-brand" href="${routeHref(navigation()[0][0])}">${icon('ball')}Panel de torneos</a><div class="sidebar-context"><span class="eyebrow">${current.role === 'superadmin' ? 'Plataforma' : 'Torneo de muestra'}</span><strong>${context}</strong><small>${current.role === 'superadmin' ? 'Control de acceso' : 'Edición 2026 · Categoría libre'}</small></div><p class="nav-label">${e(roleNames[current.role])}</p><nav class="side-nav" aria-label="Navegación principal">${nav}</nav><div class="sidebar-foot"><a class="link" href="#/acceso">${icon('exit')}Cambiar perfil</a><p>Prototipo local · Datos ficticios</p></div></aside><header class="topbar"><div class="topbar-title"><span class="tournament-mark">${icon(current.role === 'superadmin' ? 'shield' : 'trophy')}</span><div>${context}<div class="small muted">${current.role === 'superadmin' ? 'Accesos de organizadores' : 'Edición 2026 · Categoría libre'}</div></div></div><div class="row"><span class="preview-tag">Vista previa</span><a class="avatar" href="#/acceso" aria-label="Cambiar perfil de vista previa">${current.role === 'superadmin' ? 'SA' : current.role === 'equipo' ? 'DP' : current.role === 'publico' ? 'PU' : 'AM'}</a></div></header><main id="contenido" tabindex="-1" class="main">${content}<footer class="page-foot"><span>Datos ficticios · Cambios solo en esta sesión</span><a class="link" href="#/acceso">Cambiar perfil ${icon('arrow', true)}</a></footer></main><nav class="bottom-nav" aria-label="Navegación móvil">${nav}</nav>${state.toast ? `<div class="toast" role="status">${icon('check')}<span>${e(state.toast)}</span></div>` : ''}</div>`;
}

function matchHero(live = false) {
  const homeScore = state.events.filter((event) => event.kind === 'gol' && event.team === 'parque').length;
  const awayScore = state.events.filter((event) => event.kind === 'gol' && event.team === 'union').length;
  return `<section class="match-hero" aria-label="${live ? 'Marcador del partido' : 'Próximo partido'}"><div class="between"><span class="eyebrow">${live ? 'Jornada 4 · En muestra' : 'Próximo partido · Jornada 5'}</span><span class="badge">${live ? `${e(state.gameState)}` : 'Sáb. 31 oct.'}</span></div><div class="match-teams"><div class="team-label">${crest('parque', true)}<strong>Del Parque</strong><small>Local</small></div><div>${live ? `<div class="score" aria-label="Del Parque ${homeScore}, Unión Central ${awayScore}">${homeScore}<small>–</small>${awayScore}</div>` : '<span class="versus">VS</span>'}</div><div class="team-label">${crest('union', true)}<strong>Unión Central</strong><small>Visitante</small></div></div><div class="between wrap"><span class="meta">${icon('pin', true)}Complejo Municipal · Cancha 1</span>${!live ? `<span class="meta">${icon('clock', true)}${e(state.fixture[0].time)} h</span>` : '<span class="meta">Resultado provisional</span>'}</div>${!live ? `<div class="mt">${link('encuentros/1', 'Ver partido', 'arrow', 'btn')}</div>` : ''}</section>`;
}
function compactFixtures() {
  return state.fixture.map((match) => `<a class="compact-fixture" href="${routeHref(`encuentros/${match.id}`)}"><div class="match-time number">${e(match.time)}<small>31 OCT.</small></div><div class="fixture-names"><span class="row">${crest(match.home)}${e(team(match.home).name)}</span><span class="row">${crest(match.away)}${e(team(match.away).name)}</span></div>${icon('chevron', true)}</a>`).join('');
}
function homePage() {
  return `${heading('Resumen del torneo', 'Miércoles 28 de octubre de 2026', link('fixture', 'Ver fixture', 'calendar'))}<div class="home-grid"><div class="stack">${matchHero()}<section class="panel"><div class="between panel-heading"><h2>Próxima jornada</h2>${link('fixture', 'Ver todos', '', 'link')}</div>${compactFixtures()}</section></div><div class="stack"><section class="panel"><div class="between panel-heading"><h2>Por revisar</h2>${badge('3 pendientes', 'amber')}</div><div class="task"><span class="task-icon amber">${icon('users')}</span><div><h3>Lista de buena fe</h3><p>Del Parque · 1 jugador observado</p>${link('buena-fe', 'Revisar jugadores', 'arrow', 'link')}</div></div><div class="task"><span class="task-icon">${icon('clock')}</span><div><h3>Confirmar los horarios</h3><p>Jornada 5 · 2 encuentros</p>${link('fixture', 'Abrir programación', 'arrow', 'link')}</div></div><div class="task"><span class="task-icon">${icon('file')}</span><div><h3>Acta de la jornada 4</h3><p>Del Parque — Unión Central</p>${link('acta', 'Revisar acta', 'arrow', 'link')}</div></div></section><section class="panel panel-pad"><div class="row"><span class="task-icon">${icon('trophy')}</span><div><h3>El torneo, a la vista</h3><p class="small muted">Fixture, resultados y posiciones.</p></div></div><div class="mt">${link('torneo', 'Ver portal público', 'arrow', 'btn full', 'publico')}</div></section><section class="panel panel-pad"><div class="between"><h3>Clasificación</h3>${link('tablas', 'Ver tabla', '', 'link', 'publico')}</div><div class="stack-sm mt">${[['parque', 10], ['union', 8], ['norte', 6]].map(([id, points], index) => `<div class="between"><span class="row small"><span class="muted number">${index + 1}</span>${crest(id)}${e(team(id).name)}</span><strong class="small number">${points} pts</strong></div>`).join('')}</div></section></div></div>`;
}
function teamsPage() {
  return `${heading('Equipos', `${teams.length} equipos · Categoría libre`)}<div class="toolbar"><label class="search"><span class="sr-only">Buscar equipo</span>${icon('search')}<input type="search" data-search-list="teams" value="${e(state.searchByList.teams)}" placeholder="Buscar equipo o ciudad"></label></div><div class="panel team-grid" id="teams-list">${teams.map((item) => `<a class="list-row" data-search="${e(`${item.full} ${item.city}`.toLowerCase())}" href="${routeHref(`equipos/${item.id}`)}">${crest(item.id, true)}<div class="grow"><h3>${e(item.full)}</h3><p>${e(item.city)} · ${item.id === 'parque' ? players.length : item.players} jugadores</p><div style="margin-top:6px">${badge(item.status, item.status.includes('aprobada') ? 'green' : 'amber')}</div></div><span class="go">${icon('chevron')}</span></a>`).join('')}</div><div id="search-empty" class="empty" hidden>${icon('search')}<h2>No hay coincidencias</h2><p>Probá con otro nombre o ciudad.</p></div>`;
}
function teamPage(id = 'parque') {
  const item = team(id);
  const isOwn = id === 'parque';
  const count = isOwn ? players.length : item.players;
  return `${current.role === 'organizador' ? back('equipos', 'Equipos') : ''}${heading(isOwn && current.role === 'equipo' ? 'Mi equipo' : item.full, `${item.city} · Categoría libre`)}<div class="content-grid"><div class="stack"><section class="panel panel-pad"><div class="team-summary">${crest(id, true)}<div class="grow"><h2>${e(item.full)}</h2><p class="small muted">Copa de la Comunidad · Edición 2026</p><div style="margin-top:8px">${badge(item.status, item.status.includes('aprobada') ? 'green' : 'amber')}</div></div></div><hr class="divider"><div class="between small"><span class="muted">Administrador de equipo</span><strong>${isOwn ? 'Julián Torres' : 'Responsable de muestra'}</strong></div></section>${isOwn ? `<div class="shortcut-grid"><a class="shortcut" href="${routeHref('buena-fe')}">${icon('users')}<div><strong>Lista de buena fe</strong><small>${count} jugadores</small></div></a><a class="shortcut" href="${routeHref('comision')}">${icon('shield')}<div><strong>Comisión</strong><small>3 integrantes</small></div></a><a class="shortcut" href="${routeHref('tecnico')}">${icon('file')}<div><strong>Cuerpo técnico</strong><small>2 integrantes</small></div></a><a class="shortcut" href="${routeHref('fixture')}">${icon('calendar')}<div><strong>Partidos</strong><small>Próxima jornada</small></div></a><a class="shortcut" href="${routeHref('sanciones')}">${icon('lock')}<div><strong>Sanciones</strong><small>Sin suspensiones</small></div></a><a class="shortcut" href="${routeHref('planilla')}">${icon('check')}<div><strong>Planilla</strong><small>Convocatoria</small></div></a></div>` : notice('La ficha completa de este equipo queda fuera de este primer recorrido visual.', 'neutral')}${isOwn ? `<section class="panel"><div class="between panel-heading"><h2>Jugadores</h2>${link('buena-fe', 'Ver lista', '', 'link')}</div>${players.slice(0, 3).map((person) => playerRow(person)).join('')}</section>` : ''}</div><div class="stack">${matchHero()}${isOwn ? notice('Nicolás Gómez tiene una observación pendiente en su inscripción.', 'amber') : ''}</div></div>`;
}
function playerRow(person) {
  return `<a class="list-row" data-search="${e(`${nameOf(person)} ${person.ficha}`.toLowerCase())}" data-state="${e(person.state)}" href="${routeHref(`jugadores/${person.id}`)}"><span class="avatar">${e(person.first[0])}${e(person.last[0])}</span><div class="grow"><h3>${e(nameOf(person))}</h3><p>${e(person.ficha || 'Ficha pendiente')} · ${e(person.position || 'Posición sin definir')}</p></div>${badge(person.state, person.state === 'Aprobado' ? 'green' : person.state === 'Observado' ? 'amber' : '')}<span class="go">${icon('chevron')}</span></a>`;
}
function rosterPage() {
  return `${back(current.role === 'equipo' ? 'mi-equipo' : 'equipos/parque', 'Del Parque')}${heading('Lista de buena fe', `Del Parque · ${players.length} jugadores`, link('jugadores/nuevo/1', 'Agregar', 'plus', 'btn primary'))}<div class="content-grid"><div><div class="toolbar"><label class="search"><span class="sr-only">Buscar jugador</span>${icon('search')}<input type="search" data-search-list="roster" value="${e(state.searchByList.roster)}" placeholder="Buscar nombre o ficha"></label></div><div class="tabs" aria-label="Filtrar inscripciones">${['Todos', 'Aprobado', 'Observado', 'Borrador'].map((filter) => `<button type="button" class="tab ${state.rosterFilter === filter ? 'active' : ''}" data-action="roster-filter" data-value="${filter}" aria-pressed="${state.rosterFilter === filter}">${filter === 'Todos' ? 'Todos' : filter === 'Aprobado' ? 'Aprobados' : filter === 'Observado' ? 'Observados' : 'Borradores'}</button>`).join('')}</div><div class="panel" id="roster-list">${players.filter((person) => state.rosterFilter === 'Todos' || person.state === state.rosterFilter).map(playerRow).join('')}</div>${!players.some((person) => state.rosterFilter === 'Todos' || person.state === state.rosterFilter) ? `<div class="empty">${icon('users')}<h2>No hay jugadores en este estado</h2><p>Los jugadores aparecerán aquí al cambiar su inscripción.</p></div>` : ''}<div id="search-empty" class="empty" hidden>${icon('search')}<h2>No hay coincidencias</h2><p>Probá otro nombre o número de ficha.</p></div></div><aside class="stack"><section class="panel panel-pad"><h2>Estado de la lista</h2><dl class="key-values mt"><div><dt>Jugadores cargados</dt><dd>${players.length}</dd></div><div><dt>Aprobados</dt><dd>${approved().length}</dd></div><div><dt>Por corregir</dt><dd>${players.filter((person) => person.state === 'Observado').length}</dd></div></dl><hr class="divider"><p class="small muted">Los convocados de cada partido se eligen desde esta lista.</p></section>${notice('Cédulas y documentos quedan fuera del portal público y de los flyers.', 'neutral')}</aside></div>`;
}
function playerPage(id) {
  const person = players.find((item) => item.id === id);
  if (!person) return emptyPage('Jugador no encontrado', 'Volvé a la lista de buena fe.', 'buena-fe');
  return `<div class="form-page">${back('buena-fe', 'Lista de buena fe')}${heading(nameOf(person), 'Del Parque · Inscripción 2026')}<section class="panel panel-pad"><div class="between"><span class="row"><span class="avatar">${e(person.first[0])}${e(person.last[0])}</span><strong>${e(person.position || 'Jugador')}</strong></span>${badge(person.state, person.state === 'Aprobado' ? 'green' : 'amber')}</div><hr class="divider"><dl class="key-values"><div><dt>Número de ficha</dt><dd>${e(person.ficha || 'Pendiente')}</dd></div><div><dt>Dorsal</dt><dd>${e(person.number || 'Sin asignar')}</dd></div><div><dt>Equipo de origen</dt><dd>${e(person.origin)}</dd></div><div><dt>Documento</dt><dd>Privado · No incluido en la muestra</dd></div></dl>${person.state === 'Observado' ? `<div class="mt">${notice('Falta el comprobante de procedencia. El organizador debe revisar la inscripción.', 'amber')}</div>` : ''}</section></div>`;
}
function field(name, label, type = 'text', placeholder = '', required = false, attrs = '') {
  return `<div class="field"><label for="${name}">${e(label)}${required ? ' <span aria-hidden="true">*</span>' : ''}</label><input id="${name}" name="${name}" type="${type}" value="${e(state.draft[name] || '')}" placeholder="${e(placeholder)}" ${required ? 'required' : ''} ${attrs}></div>`;
}
function playerForm(step = 1) {
  const draft = state.draft;
  const origin = draft.originKind === 'internal' ? `${team(draft.internalTeam).full} · ${team(draft.internalTeam).city}` : draft.originKind === 'external' ? `${draft.originTeam} · ${draft.originCity}` : 'Sin equipo anterior';
  let content;
  if (step === 1) content = `<h2>Datos del jugador</h2><p class="small muted" style="margin-block:4px 20px">Los campos con * son obligatorios en esta muestra.</p><div class="form-grid">${field('first', 'Nombres', 'text', 'Ej. Javier', true, 'autocomplete="given-name" maxlength="80"')}${field('last', 'Apellidos', 'text', 'Ej. Fernández', true, 'autocomplete="family-name" maxlength="80"')}${field('birth', 'Fecha de nacimiento', 'date', '', true, 'max="2026-10-28"')}${field('document', 'Cédula (opcional en la muestra)', 'text', 'Usá solo datos ficticios', false, 'inputmode="numeric" maxlength="20" autocomplete="off"')}${field('ficha', 'Número de ficha', 'text', 'Ej. F-015', false, 'maxlength="30"')}${field('issuer', 'Entidad que emitió la ficha', 'text', 'Ej. Liga de la Comunidad', false, 'maxlength="100"')}</div><div class="form-actions">${link('buena-fe', 'Volver a la lista')}<button class="btn primary" type="submit">Continuar ${icon('arrow')}</button></div>`;
  else if (step === 2) content = `<h2>Equipo de origen</h2><p class="small muted" style="margin-block:4px 16px">Puede pertenecer a este torneo o ser un equipo externo.</p><div class="origin-options" role="group" aria-label="Procedencia">${[['external','Equipo externo','Externo'],['internal','Equipo de este torneo','Del torneo'],['none','Sin equipo anterior','Sin anterior']].map(([key,label,short]) => `<button type="button" class="btn ${draft.originKind === key ? 'soft' : ''}" aria-label="${label}" aria-pressed="${draft.originKind === key}" data-action="origin-kind" data-value="${key}">${short}</button>`).join('')}</div><input type="hidden" name="originKind" value="${draft.originKind}"><div class="form-grid mt">${draft.originKind === 'external' ? `${field('originTeam', 'Nombre del equipo de origen', 'text', 'Ej. Sportivo Las Palmas', true, 'maxlength="120"')}${field('originCity', 'Ciudad del equipo de origen', 'text', 'Ej. Areguá', true, 'maxlength="100"')}<div class="wide">${notice('La procedencia se declara para revisión. Este equipo no se agrega como participante.', 'neutral')}</div>` : draft.originKind === 'internal' ? `<div class="field wide"><span>Equipo de origen</span><div class="origin-team-list" role="group" aria-label="Equipo de origen">${teams.filter((item) => item.id !== 'parque').map((item) => `<button type="button" class="origin-team ${draft.internalTeam === item.id ? 'selected' : ''}" data-action="origin-team" data-team="${item.id}" aria-label="${e(item.full)} · ${e(item.city)}" aria-pressed="${draft.internalTeam === item.id}">${crest(item.id)}<span><strong>${e(item.full)}</strong><small>${e(item.city)}</small></span>${draft.internalTeam === item.id ? icon('check') : ''}</button>`).join('')}</div><input type="hidden" name="internalTeam" value="${e(draft.internalTeam)}"></div>` : `<div class="wide">${notice('Se registrará el alta sin un equipo anterior declarado.', 'neutral')}</div>`}</div><div class="form-actions">${link('jugadores/nuevo/1', 'Anterior', 'back')}<button class="btn" type="submit" value="list">Guardar y volver</button><button class="btn primary" type="submit" value="another">Guardar y agregar otro ${icon('plus')}</button></div><div class="mt">${link('jugadores/nuevo/3', 'Revisar datos antes de guardar', 'file', 'link')}</div>`;
  else content = `<h2>Revisar inscripción</h2><p class="small muted" style="margin-block:4px 20px">El organizador revisa la habilitación deportiva.</p><dl class="key-values"><div><dt>Jugador</dt><dd>${e(`${draft.first} ${draft.last}`)}</dd></div><div><dt>Nacimiento</dt><dd>${e(formatDate(draft.birth))}</dd></div><div><dt>Documento privado</dt><dd>${draft.document ? `•••• ${e(draft.document.slice(-3))}` : 'Sin cargar'}</dd></div><div><dt>Número de ficha</dt><dd>${e(draft.ficha || 'Pendiente')}</dd></div><div><dt>Entidad emisora</dt><dd>${e(draft.issuer || 'Sin declarar')}</dd></div><div><dt>Equipo de origen</dt><dd>${e(origin)}</dd></div></dl><div class="mt">${notice('Esta vista previa agrega un borrador solo en memoria. La inscripción no se envía a un organizador.', 'neutral')}</div><div class="form-actions">${link('jugadores/nuevo/2', 'Anterior', 'back')}<button class="btn" type="submit" value="list">Guardar y volver</button><button class="btn primary" type="submit" value="another">Guardar y agregar otro ${icon('plus')}</button></div>`;
  return `<div class="form-page">${back('buena-fe', 'Lista de buena fe')}${heading('Agregar jugador', 'Del Parque · Lista de buena fe')}<div class="stepper" aria-label="Progreso">${['Identidad', 'Procedencia'].map((text, index) => `<div class="step ${index + 1 <= step ? 'active' : ''}" ${index + 1 === step ? 'aria-current="step"' : ''}>${index + 1}. ${text}</div>`).join('')}</div>${state.error ? notice(state.error, 'error') : ''}<form class="panel panel-pad" data-form="player" data-step="${step}">${content}</form></div>`;
}
function formatDate(value) {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : 'Sin cargar';
}

function fixturePage() {
  const isPublic = current.role === 'publico';
  return `${heading(isPublic ? 'Fixture' : 'Fixture y horarios', 'Copa de la Comunidad · Categoría libre')}<div class="toolbar"><div class="tabs" aria-label="Jornada" style="margin:0">${link('resultados', 'Jornada 4', '', 'tab')}<span class="tab active" aria-current="page">Jornada 5</span></div>${!isPublic && current.role === 'organizador' ? link('fixture/revisar', 'Revisar publicación', 'check', 'btn primary') : ''}</div><div class="content-grid"><section><div class="fixture-day"><h2>Sábado 31 de octubre</h2>${badge('Publicado', 'green')}</div><div class="panel">${[...state.fixture].sort((a, b) => a.time.localeCompare(b.time)).map((match) => `<article class="fixture-card"><div class="between"><span class="meta">${icon('clock', true)}<strong class="number">${e(match.time)} h</strong></span><span class="small muted">Categoría libre</span></div><div class="team-row"><div class="row">${crest(match.home)}<strong>${e(team(match.home).name)}</strong></div><span>vs</span><div class="row">${crest(match.away)}<strong>${e(team(match.away).name)}</strong></div></div><div class="fixture-bottom"><span class="meta muted">${icon('pin', true)}${e(match.court)}</span>${current.role === 'organizador' ? link(`fixture/horario/${match.id}`, 'Cambiar horario', 'edit', 'link') : link(`encuentros/${match.id}`, 'Ver partido', 'arrow', 'link')}</div></article>`).join('')}</div></section><aside class="stack"><section class="panel panel-pad"><div class="row"><span class="task-icon">${icon('calendar')}</span><h3>Jornada 5</h3></div><dl class="key-values mt"><div><dt>Encuentros</dt><dd>2</dd></div><div><dt>Sede</dt><dd>Complejo Municipal</dd></div><div><dt>Cancha</dt><dd>Cancha 1</dd></div></dl></section>${!isPublic ? notice('El cambio de horario conserva la jornada y requiere un motivo.', 'neutral') : notice('Fixture de muestra. Los resultados se distinguen como provisionales u oficiales.', 'neutral')}</aside></div>`;
}
function scheduledMatchPage(id) {
  const match = state.fixture.find((item) => item.id === Number(id));
  if (!match) return emptyPage('Encuentro no encontrado', 'Volvé al fixture.', 'fixture');
  const history = state.scheduleHistory.filter((item) => item.id === match.id);
  return `<div class="form-page">${back('fixture', 'Fixture')}${heading('Próximo encuentro', 'Jornada 5 · Sábado 31 de octubre')}<section class="panel panel-pad"><div class="between"><span class="eyebrow">Categoría libre</span>${badge('Programado', 'green')}</div><div class="match-teams"><div class="team-label">${crest(match.home, true)}<strong>${e(team(match.home).name)}</strong></div><span class="small muted">vs</span><div class="team-label">${crest(match.away, true)}<strong>${e(team(match.away).name)}</strong></div></div><dl class="key-values"><div><dt>Horario</dt><dd>${e(match.time)} h</dd></div><div><dt>Sede</dt><dd>Complejo Municipal</dd></div><div><dt>Cancha</dt><dd>${e(match.court)}</dd></div></dl>${current.role === 'organizador' ? `<div class="form-actions">${link(`fixture/horario/${match.id}`, 'Cambiar horario', 'edit')}</div>` : ''}</section>${history.length ? `<section class="panel section-gap"><div class="panel-heading"><h2>Cambios de horario</h2></div>${history.map((change) => `<div class="list-row"><span class="task-icon">${icon('clock')}</span><div><h3>${e(change.before)} → ${e(change.after)}</h3><p>${e(change.reason)}</p></div></div>`).join('')}</section>` : ''}</div>`;
}
function scheduleForm(id) {
  const match = state.fixture.find((item) => item.id === Number(id));
  if (!match) return emptyPage('Encuentro no encontrado', 'Volvé al fixture.', 'fixture');
  const saved = state.scheduleDrafts[id] || { time: match.time, reason: '' };
  return `<div class="form-page">${back('fixture', 'Fixture y horarios')}${heading('Cambiar horario', `${team(match.home).name} — ${team(match.away).name}`)}<form class="panel panel-pad" data-form="schedule" data-id="${match.id}"><div class="form-grid"><div class="field"><label for="match-time">Hora del encuentro</label><input id="match-time" name="time" type="time" value="${e(saved.time)}" required></div><div class="field"><label for="court">Cancha</label><input name="court" id="court" value="Cancha 1" readonly></div><div class="field wide"><label for="reason">Motivo del cambio</label><textarea id="reason" name="reason" maxlength="240" placeholder="Ej. Ajuste por disponibilidad de cancha" required>${e(saved.reason)}</textarea></div></div>${state.error ? `<div class="mt">${notice(state.error, 'error')}</div>` : ''}<div class="form-actions">${link('fixture', 'Cancelar')}<button type="submit" class="btn primary">Guardar en la muestra ${icon('check')}</button></div></form></div>`;
}
function fixtureReview() {
  return `<div class="form-page">${back('fixture', 'Fixture y horarios')}${heading('Revisar jornada', 'Jornada 5 · Sábado 31 de octubre')}<section class="panel">${compactFixtures()}<div class="panel-pad"><div class="notice">${icon('check')}<p>Los dos encuentros usan horarios distintos. Esta revisión visual no valida todavía tiempos de descanso ni disponibilidad real.</p></div><div class="mt">${link('fixture', 'Volver al fixture', 'back', 'btn full')}</div></div></section></div>`;
}
function matchList() {
  return `${heading(current.role === 'planillero' ? 'Mis partidos' : 'Partidos', 'Categoría libre · Seguimiento de encuentros')}<div class="content-grid"><div class="stack">${matchHero(true)}${link('partido', 'Controlar partido', 'ball', 'btn primary full')}</div><section class="panel"><div class="panel-heading"><h2>Próxima jornada</h2></div>${compactFixtures()}</section></div>`;
}
function eventRows() {
  return [...state.events].reverse().map((event) => `<div class="event-row"><span class="event-time" aria-label="${e(eventMoment(event))}">${shortPeriods[event.period] ? `<span>${shortPeriods[event.period]}</span>` : ''}${Number.isInteger(event.minute) ? `<small>${event.minute}′</small>` : ''}</span><span>${event.kind === 'gol' ? icon('ball') : `<span class="card-symbol ${event.kind === 'roja' ? 'red' : ''}" aria-label="Tarjeta ${event.kind}"></span>`}</span><div><strong>${e(event.player)}</strong><p>${event.kind === 'gol' ? 'Gol' : `Tarjeta ${event.kind}`} · ${e(team(event.team).name)}</p></div></div>`).join('');
}
function matchPage() {
  const readOnly = ['equipo', 'publico'].includes(current.role);
  return `${back(current.role === 'planillero' ? 'partidos' : current.role === 'equipo' ? 'fixture' : current.role === 'publico' ? 'resultados' : 'partidos', 'Partidos')}${heading(readOnly ? 'Detalle del partido' : 'Control del partido', 'Jornada 4 · Complejo Municipal')}<div class="content-grid"><div class="stack">${matchHero(true)}${!readOnly && state.gameState === 'Captura abierta' ? `<div class="event-actions">${link('partido/evento/gol', 'Gol', 'ball', 'btn soft')}<a class="btn" href="${routeHref('partido/evento/amarilla')}"><span class="card-symbol" aria-hidden="true"></span>Amarilla</a><a class="btn" href="${routeHref('partido/evento/roja')}"><span class="card-symbol red" aria-hidden="true"></span>Roja</a></div><div class="between wrap"><span class="meta muted">${icon('check', true)}Muestra local · En memoria</span>${button('undo-event', 'Deshacer último', 'undo', 'link')}</div>` : ''}<section class="panel"><div class="between panel-heading"><h2>Eventos del partido</h2>${badge(`${state.events.length} eventos`)}</div>${eventRows() || '<div class="empty"><p>No hay eventos registrados.</p></div>'}</section></div><aside class="stack"><section class="panel panel-pad"><h2>Acta del partido</h2><p class="small muted" style="margin-block:8px 16px">Revisá marcador, goleadores y tarjetas antes de cerrar.</p>${link('acta', readOnly ? 'Consultar resumen' : 'Revisar acta', 'file', 'btn full')}</section><section class="panel panel-pad" style="background:#234c3b;color:#fff"><div class="between" style="margin-bottom:14px"><h3>Cancha 1</h3><span class="small">Jornada 4</span></div><div class="pitch" aria-hidden="true"><span class="pitch-box"></span><span class="pitch-box"></span></div><p class="small" style="color:#d2e4d8;margin-top:12px">Del Parque · Unión Central</p></section>${!readOnly ? notice('Registro de prueba: el resultado es provisional y no modifica ninguna clasificación real.', 'neutral') : ''}</aside></div>`;
}
function eventForm(kind) {
  if (!['gol', 'amarilla', 'roja'].includes(kind)) return emptyPage('Evento no encontrado', 'Volvé al partido.', 'partido');
  const choices = state.eventTeam === 'parque' ? approved() : awayPlayers;
  const eventLabel = kind === 'gol' ? 'gol' : `tarjeta ${kind}`;
  const homeScore = state.events.filter((item) => item.kind === 'gol' && item.team === 'parque').length;
  const awayScore = state.events.filter((item) => item.kind === 'gol' && item.team === 'union').length;
  const undoAvailable = state.quickAddedIds.some((id) => state.events.some((item) => item.id === id));
  return `<div class="form-page quick-entry">
    ${back('partido', 'Volver al partido')}
    ${heading('Goles y tarjetas', 'Jornada 4 · Carga del resultado')}
    <form class="panel panel-pad" data-form="quick-event" data-kind="${kind}">
      <div class="quick-kinds" role="group" aria-label="Tipo de evento">
        ${['gol', 'amarilla', 'roja'].map((item) => `<button type="button" class="quick-kind ${kind === item ? 'selected' : ''}" data-action="quick-kind" data-kind="${item}" aria-pressed="${kind === item}">${item === 'gol' ? icon('ball') : `<span class="card-symbol ${item === 'roja' ? 'red' : ''}" aria-hidden="true"></span>`}<span>${item === 'gol' ? 'Gol' : item === 'amarilla' ? 'Amarilla' : 'Roja'}</span></button>`).join('')}
      </div>
      <div class="entry-group">
        <div class="between entry-label"><span>Equipo</span><span class="muted number">Marcador ${homeScore}–${awayScore}</span></div>
        <div class="quick-teams" role="group" aria-label="Equipo del evento">
          ${['parque', 'union'].map((id) => `<button type="button" class="quick-team ${state.eventTeam === id ? 'selected' : ''}" data-action="quick-team" data-team="${id}" aria-label="Equipo ${e(team(id).name)}" aria-pressed="${state.eventTeam === id}">${crest(id)}<span>${e(team(id).name)}</span><span class="selection-mark" aria-hidden="true">${state.eventTeam === id ? icon('check', true) : ''}</span></button>`).join('')}
        </div>
      </div>
      <div class="entry-group">
        <span class="entry-label">Tiempo <span class="muted">(opcional)</span></span>
        <div class="quick-periods" role="group" aria-label="Tiempo del evento">
          ${Object.entries(eventPeriods).map(([id, label]) => `<button type="button" class="quick-period ${state.eventDraft.period === id ? 'selected' : ''}" data-action="quick-period" data-period="${id}" aria-label="${shortPeriods[id]} · ${label}" aria-pressed="${state.eventDraft.period === id}"><strong>${shortPeriods[id]}</strong><span>${label}</span></button>`).join('')}
        </div>
        <input type="hidden" name="period" value="${e(state.eventDraft.period)}">
      </div>
      <details class="minute-detail" ${state.eventDraft.minute !== '' ? 'open' : ''}>
        <summary>Agregar minuto (opcional)</summary>
        <div class="field"><label for="minute">Minuto</label><input id="minute" name="minute" type="number" inputmode="numeric" min="0" max="999" step="1" value="${e(state.eventDraft.minute)}" placeholder="Sin registrar"></div>
      </details>
      <div class="quick-feedback ${state.quickFeedback ? 'has-feedback' : ''}">
        <p role="status" aria-live="polite">${state.quickFeedback ? `${icon('check', true)}<span>${e(state.quickFeedback)}</span>` : `<span>Tocá un jugador para agregar ${kind === 'gol' ? 'un gol' : 'una tarjeta'}.</span>`}</p>
        <button type="button" class="btn ghost quick-undo" data-action="undo-quick" ${undoAvailable ? '' : 'disabled'} aria-label="Deshacer último evento cargado">${icon('undo', true)}<span>Deshacer</span></button>
      </div>
      <div class="quick-player-heading"><h2>Jugadores de ${e(team(state.eventTeam).name)}</h2></div>
      <div class="quick-players">
        ${choices.map((person) => {
          const count = state.events.filter((item) => item.kind === kind && item.team === state.eventTeam && item.player === nameOf(person)).length;
          const countLabel = kind === 'gol' ? `${count} ${count === 1 ? 'gol' : 'goles'}` : `${count} ${kind === 'amarilla' ? (count === 1 ? 'amarilla' : 'amarillas') : (count === 1 ? 'roja' : 'rojas')}`;
          return `<button type="button" class="quick-player" data-action="quick-add" data-player="${e(person.id)}" data-kind="${kind}" aria-label="Agregar ${eventLabel} a ${e(nameOf(person))}, dorsal ${person.number}"><span class="jersey-number">${person.number}</span><span class="quick-player-name"><strong>${e(nameOf(person))}</strong>${count ? `<small>${countLabel} en este partido</small>` : ''}</span><span class="quick-add-label">${icon('plus', true)}<span>${kind === 'gol' ? 'Gol' : 'Tarjeta'}</span></span></button>`;
        }).join('')}
      </div>
      <div class="entry-finish">${link('partido', 'Listo, volver al partido', 'check', 'btn full')}</div>
    </form>
  </div>`;
}
function actaPage() {
  const home = state.events.filter((event) => event.kind === 'gol' && event.team === 'parque').length;
  const away = state.events.filter((event) => event.kind === 'gol' && event.team === 'union').length;
  const editable = !['publico', 'equipo'].includes(current.role);
  return `<div class="form-page">${back('partido', 'Partido')}${heading('Acta del partido', 'Jornada 4 · Resumen de muestra')}<section class="panel panel-pad"><div class="between"><span class="small">Del Parque — Unión Central</span>${badge('Provisional', 'amber')}</div><div class="score mt">${home} <small>–</small> ${away}</div><hr class="divider"><h2>Goleadores</h2><div class="stack-sm mt">${state.events.filter((event) => event.kind === 'gol').map((event) => `<div class="between small"><span>${e(event.player)}<span class="muted"> · ${e(team(event.team).name)}</span></span><strong>${e(eventMoment(event))}</strong></div>`).join('') || '<p class="small muted">Sin goles.</p>'}</div><hr class="divider"><h2>Tarjetas</h2><div class="stack-sm mt">${state.events.filter((event) => event.kind !== 'gol').map((event) => `<p class="small">${e(event.player)} · ${e(event.kind)}${eventMoment(event) ? ` · ${e(eventMoment(event))}` : ''}</p>`).join('') || '<p class="small muted">Sin tarjetas.</p>'}</div><div class="mt">${notice('La aprobación oficial y su historial se implementarán con el servidor en las tandas correspondientes.', 'neutral')}</div>${editable ? `<div class="form-actions">${link('partido', 'Volver al partido', 'back')}${button('finish-preview', state.gameState === 'Captura abierta' ? 'Finalizar captura de muestra' : 'Reabrir captura de muestra', 'check', 'btn primary')}</div>` : ''}</section></div>`;
}
function staffPage(technical = false) {
  const people = technical ? [['Ramiro Medina', 'Director técnico'], ['Pedro Álvarez', 'Asistente técnico']] : [['Julián Torres', 'Presidente'], ['Paula Duarte', 'Secretaria'], ['Gabriel Silva', 'Tesorero']];
  return `${back(current.role === 'equipo' ? 'mi-equipo' : 'equipos/parque', 'Del Parque')}${heading(technical ? 'Cuerpo técnico' : 'Comisión', 'Del Parque · Edición 2026')}<div class="form-page"><section class="panel">${people.map(([name, job]) => `<div class="list-row"><span class="avatar">${name.split(' ').map((part) => part[0]).join('')}</span><div><h3>${name}</h3><p>${job}</p></div></div>`).join('')}</section><div class="mt">${notice('El cargo en la comisión no otorga acceso a la aplicación por sí mismo.', 'neutral')}</div></div>`;
}
function planillaPage() {
  return `${back(current.role === 'equipo' ? 'mi-equipo' : 'equipos/parque', 'Del Parque')}${heading('Planilla del partido', 'Del Parque — Unión Central · Jornada 5')}<div class="form-page"><section class="panel"><div class="panel-heading"><h2>Jugadores habilitados</h2><p class="small muted">Vista de composición; los cupos los define cada reglamento.</p></div>${approved().map(playerRow).join('')}</section><div class="mt">${notice('La selección y aprobación de convocados pertenece a T03. Esta muestra permite revisar la composición visual.', 'neutral')}</div></div>`;
}
function sanctionsPage() {
  return `${heading('Sanciones', 'Del Parque · Edición 2026')}<section class="panel"><div class="empty">${icon('shield')}<h2>Sin suspensiones vigentes</h2><p>Las resoluciones del equipo aparecerán aquí.</p>${link(current.role === 'equipo' ? 'mi-equipo' : 'equipos/parque', 'Volver al equipo', 'back')}</div></section>`;
}

function publicPage() {
  return `${heading('El torneo', 'Consulta pública · Sin cuenta')}<section class="public-hero"><div><span class="eyebrow">Temporada 2026</span><h2>Copa de la Comunidad</h2><p class="small muted">Categoría libre · Complejo Municipal</p></div><svg class="trophy-art" viewBox="0 0 80 80" fill="none" aria-hidden="true"><path d="M26 12h28v23c0 20-28 20-28 0V12Z" fill="#165d46"/><path d="M26 18H14v10c0 9 7 13 14 13m26-23h12v10c0 9-7 13-14 13" stroke="#165d46" stroke-width="4"/><path d="M40 48v16m-15 4h30" stroke="#165d46" stroke-width="6"/><path d="m40 20 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#e7efd6"/></svg></section><div class="home-grid section-gap"><div class="stack"><section class="panel"><div class="between panel-heading"><h2>Próximos partidos</h2>${link('fixture', 'Ver fixture', '', 'link')}</div>${compactFixtures()}</section><section class="panel"><div class="between panel-heading"><h2>Clasificación</h2>${link('tablas', 'Completa', '', 'link')}</div>${standingsTable()}</section></div><aside class="stack"><section class="panel panel-pad"><div class="between"><h2>Último resultado</h2>${badge('Oficial', 'green')}</div><div class="between mt"><span class="row small">${crest('parque')}Del Parque</span><strong class="number">2</strong></div><div class="between mt"><span class="row small">${crest('norte')}Sportivo Norte</span><strong class="number">0</strong></div><hr class="divider"><p class="small muted">Jornada 3 · 24 de octubre</p></section><section class="panel panel-pad"><h2>Goleadores</h2><div class="between mt"><span class="row"><span class="avatar sand">DR</span><span><strong class="small">Diego Rojas</strong><span class="small muted" style="display:block">Del Parque</span></span></span><strong class="number">5</strong></div><div class="mt">${link('goleadores', 'Ver tabla de goleo', 'arrow', 'btn full')}</div></section></aside></div>`;
}
function standingsTable() {
  return `<div class="table-wrap"><table><caption class="sr-only">Clasificación de muestra de la categoría libre</caption><thead><tr><th scope="col">#</th><th scope="col">Equipo</th><th scope="col">PJ</th><th scope="col" class="table-extra">DG</th><th scope="col">PTS</th></tr></thead><tbody>${[['parque', 4, '+6', 10], ['union', 4, '+3', 8], ['norte', 4, '-2', 6], ['barrio', 4, '-7', 1]].map(([id, played, diff, points], index) => `<tr class="${id === 'parque' ? 'own' : ''}"><td>${index + 1}</td><td><span class="table-team">${crest(id)}${e(team(id).name)}</span></td><td>${played}</td><td class="table-extra">${diff}</td><td>${points}</td></tr>`).join('')}</tbody></table></div>`;
}
function standingsPage() {
  return `${heading('Tabla de posiciones', 'Categoría libre · Hasta la jornada 3')}<section class="panel">${standingsTable()}</section><p class="small muted mt">PJ: partidos jugados · DG: diferencia de goles · PTS: puntos. Datos oficiales ficticios; el partido provisional no se incluye.</p>`;
}
function scorersPage() {
  const scorers = [['Diego Rojas', 'parque', 5], ['Mateo Silva', 'union', 4], ['Luis Vera', 'parque', 3], ['Marco López', 'norte', 2]];
  return `${heading('Tabla de goleo', 'Categoría libre · Goles oficiales de muestra')}<section class="panel">${scorers.map(([name, id, goals], index) => `<div class="list-row"><span class="small muted number">${index + 1}</span>${crest(id)}<div class="grow"><h3>${name}</h3><p>${e(team(id).name)}</p></div><strong class="number">${goals}<span class="small muted" style="font-weight:400"> goles</span></strong></div>`).join('')}</section>`;
}
function resultsPage() {
  return `${heading('Resultados', 'Categoría libre · Oficial y provisional')}<div class="content-grid"><section class="panel panel-pad"><div class="between"><h2>Jornada 3</h2>${badge('Oficial', 'green')}</div><div class="between mt"><span class="row">${crest('parque')}Del Parque</span><strong>2</strong></div><div class="between mt"><span class="row">${crest('norte')}Sportivo Norte</span><strong>0</strong></div><p class="small muted mt">24 oct. · Complejo Municipal</p></section><div class="stack">${matchHero(true)}${link('partido', 'Ver partido provisional', 'arrow', 'btn')}</div></div>`;
}
function tournamentPage() {
  return `${heading('Torneo', 'Copa de la Comunidad · Edición 2026')}<div class="shortcut-grid"><a class="shortcut" href="${routeHref('fixture')}">${icon('calendar')}<div><strong>Fixture y jornadas</strong><small>Horarios y canchas</small></div></a><a class="shortcut" href="${routeHref('sanciones')}">${icon('file')}<div><strong>Disciplina</strong><small>Resoluciones del equipo</small></div></a><a class="shortcut" href="${routeHref('tablas', 'publico')}">${icon('chart')}<div><strong>Clasificación</strong><small>Vista pública</small></div></a><a class="shortcut" href="${routeHref('torneo', 'publico')}">${icon('trophy')}<div><strong>Portal público</strong><small>Vista sin cuenta</small></div></a></div><section class="panel panel-pad section-gap"><h2>Reglamento</h2><p class="small muted mt">Categoría libre · Versión de muestra. Los cupos, tiempos y criterios deportivos se configurarán por edición.</p></section>`;
}

function adminListPage(home = false) {
  return `${heading(home ? 'Control de acceso' : 'Administradores', 'Habilitación manual de organizadores')}<section class="panel">${state.admins.map((person) => `<a class="list-row" href="${routeHref(`administradores/${person.id}`)}"><span class="avatar">${person.initials}</span><div class="grow"><h3>${person.name}</h3><p>${person.organization}</p></div>${badge(person.status, person.status === 'Activo' ? 'green' : person.status === 'Pendiente' ? 'amber' : 'red')}<span class="go">${icon('chevron')}</span></a>`).join('')}</section><div class="mt">${notice('Los cambios de acceso son una simulación visual. La autorización de servidor y la revocación de sesiones aún no están implementadas.', 'neutral')}</div>`;
}
function adminDetail(id) {
  const person = state.admins.find((item) => item.id === id);
  if (!person) return emptyPage('Administrador no encontrado', 'Volvé a la lista.', 'administradores');
  return `<div class="form-page">${back('administradores', 'Administradores')}${heading(person.name, person.organization)}<section class="panel panel-pad"><div class="between"><span class="row"><span class="avatar">${person.initials}</span><strong>Acceso al torneo</strong></span>${badge(person.status, person.status === 'Activo' ? 'green' : person.status === 'Pendiente' ? 'amber' : 'red')}</div><hr class="divider"><dl class="key-values"><div><dt>Organización</dt><dd>${person.organization}</dd></div><div><dt>Rol</dt><dd>Administrador de torneo</dd></div></dl><div class="form-actions">${person.status !== 'Activo' ? link(`administradores/${id}/activar`, 'Revisar habilitación', 'check', 'btn primary') : `${link(`administradores/${id}/suspender`, 'Suspender', 'clock')}${link(`administradores/${id}/bloquear`, 'Bloquear acceso', 'lock', 'btn danger')}`}</div></section>${state.accessHistory.filter((entry) => entry.id === id).length ? `<section class="panel section-gap"><div class="panel-heading"><h2>Historial de muestra</h2></div>${state.accessHistory.filter((entry) => entry.id === id).slice().reverse().map((entry) => `<div class="list-row"><span class="task-icon">${icon('shield')}</span><div><h3>${e(entry.before)} → ${e(entry.after)}</h3><p>${e(entry.reason)}</p></div></div>`).join('')}</section>` : ''}</div>`;
}
function accessForm(id, action) {
  const person = state.admins.find((item) => item.id === id);
  if (!person || !['activar', 'suspender', 'bloquear'].includes(action)) return emptyPage('Acción no encontrada', 'Volvé a los administradores.', 'administradores');
  const title = action === 'activar' ? 'Habilitar administrador' : action === 'suspender' ? 'Suspender acceso' : 'Bloquear acceso';
  return `<div class="form-page">${back(`administradores/${id}`, person.name)}${heading(title, person.organization)}<form class="panel panel-pad" data-form="access" data-id="${id}" data-change="${action}"><div class="row"><span class="avatar">${person.initials}</span><div><h2>${person.name}</h2><p class="small muted">Estado actual: ${e(person.status)}</p></div></div><div class="mt">${notice(action === 'activar' ? 'En el sistema final, este cambio permitirá operar solo dentro de la organización indicada.' : 'En el sistema final, este cambio impedirá nuevas operaciones y revocará sus sesiones. Los datos del torneo se conservarán.', action === 'activar' ? '' : 'amber')}</div><div class="field mt"><label for="access-reason">Motivo</label><textarea id="access-reason" name="reason" maxlength="240" placeholder="Describí el motivo del cambio" required></textarea></div><div class="form-actions">${link(`administradores/${id}`, 'Cancelar')}<button type="submit" class="btn ${action === 'bloquear' ? 'danger-solid' : 'primary'}">Confirmar en la muestra ${icon('check')}</button></div></form></div>`;
}
function organizationsPage() {
  return `${heading('Organizaciones', 'Dos espacios ficticios')}<section class="panel">${state.admins.map((person) => `<a class="list-row" href="${routeHref(`administradores/${person.id}`)}"><span class="task-icon">${icon('trophy')}</span><div class="grow"><h3>${person.organization}</h3><p>${person.name}</p></div>${badge(person.status, person.status === 'Activo' ? 'green' : 'amber')}</a>`).join('')}</section>`;
}
function accessHistoryPage() {
  return `${heading('Cambios de acceso', 'Historial de esta sesión de muestra')}<section class="panel">${state.accessHistory.length ? state.accessHistory.slice().reverse().map((entry) => `<div class="list-row"><span class="task-icon">${icon('shield')}</span><div><h3>${e(state.admins.find((person) => person.id === entry.id).name)}</h3><p>${e(entry.before)} → ${e(entry.after)} · ${e(entry.reason)}</p></div></div>`).join('') : `<div class="empty">${icon('shield')}<h2>Sin cambios en esta sesión</h2><p>Podés probar una habilitación o un bloqueo.</p>${link('administradores', 'Ver administradores', 'users')}</div>`}</section>`;
}
function authPage() {
  const homes = { organizador: 'inicio', equipo: 'mi-equipo', planillero: 'partidos', superadmin: 'administradores', publico: 'torneo' };
  return `<main id="contenido" tabindex="-1" class="auth-shell"><div class="auth-card"><div class="auth-mark">${icon('ball')}Panel de torneos ${badge('Prototipo')}</div><h1 tabindex="-1">Elegí una vista</h1><p>Recorré las pantallas con datos ficticios.</p><div class="profile-options">${Object.entries(roleNames).map(([role, label]) => `<a class="profile-option" href="${routeHref(homes[role], role)}"><span class="task-icon">${icon(role === 'superadmin' ? 'shield' : role === 'equipo' ? 'users' : role === 'planillero' ? 'ball' : role === 'publico' ? 'trophy' : 'calendar')}</span><strong>${label}</strong>${icon('arrow', true)}</a>`).join('')}</div><p class="small muted" style="margin-top:20px">Vistas simuladas. Las cuentas funcionales de T01 tienen su propio acceso.</p></div></main>`;
}
function emptyPage(title, description, parent = 'inicio') {
  return `${heading(title)}<section class="panel empty">${icon('info')}<p>${e(description)}</p>${link(parent, 'Volver', 'back')}</section>`;
}

function render(focus = false) {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  state.error = focus ? '' : state.error;
  if (parts[0] === 'acceso') {
    app.innerHTML = authPage();
    document.title = 'Acceso · Vista previa de torneos';
  } else {
    const role = roleNames[parts[0]] ? parts[0] : 'organizador';
    const route = parts.slice(1).join('/') || (role === 'equipo' ? 'mi-equipo' : role === 'publico' ? 'torneo' : role === 'planillero' ? 'partidos' : 'inicio');
    current = { role, route };
    let content;
    const pieces = route.split('/');
    if (role === 'superadmin') {
      if (['inicio', 'administradores'].includes(route)) content = adminListPage(route === 'inicio');
      else if (pieces[0] === 'administradores' && pieces[2]) content = accessForm(pieces[1], pieces[2]);
      else if (pieces[0] === 'administradores' && pieces[1]) content = adminDetail(pieces[1]);
      else if (route === 'organizaciones') content = organizationsPage();
      else if (route === 'accesos') content = accessHistoryPage();
    } else if (route === 'inicio') content = homePage();
    else if (route === 'equipos') content = teamsPage();
    else if (route.startsWith('equipos/')) content = teamPage(pieces[1]);
    else if (route === 'mi-equipo') content = teamPage();
    else if (route === 'buena-fe' && role !== 'publico') content = rosterPage();
    else if (route.startsWith('jugadores/nuevo/') && ['organizador', 'equipo'].includes(role)) content = playerForm(Math.max(1, Math.min(3, Number(pieces[2]) || 1)));
    else if (pieces[0] === 'jugadores' && role !== 'publico') content = playerPage(pieces[1]);
    else if (route.startsWith('encuentros/')) content = scheduledMatchPage(pieces[1]);
    else if (route === 'fixture') content = fixturePage();
    else if (route === 'fixture/revisar' && role === 'organizador') content = fixtureReview();
    else if (route.startsWith('fixture/horario/') && role === 'organizador') content = scheduleForm(pieces[2]);
    else if (route === 'partidos') content = matchList();
    else if (route === 'partido') content = matchPage();
    else if (route.startsWith('partido/evento/') && ['organizador', 'planillero'].includes(role) && state.gameState === 'Captura abierta') content = eventForm(pieces[2]);
    else if (route === 'acta') content = actaPage();
    else if (route === 'comision' && role !== 'publico') content = staffPage();
    else if (route === 'tecnico' && role !== 'publico') content = staffPage(true);
    else if (route === 'planilla' && role !== 'publico') content = planillaPage();
    else if (route === 'sanciones' && role !== 'publico') content = sanctionsPage();
    else if (route === 'torneo') content = role === 'publico' ? publicPage() : tournamentPage();
    else if (route === 'tablas') content = standingsPage();
    else if (route === 'goleadores') content = scorersPage();
    else if (route === 'resultados') content = resultsPage();
    app.innerHTML = shell(content || emptyPage('Vista no disponible', 'Este recorrido no está incluido para el perfil seleccionado.', navigation()[0][0]));
    document.title = `${document.querySelector('h1')?.textContent || 'Panel'} · Vista previa de torneos`;
  }
  const searchField = document.querySelector('[data-search-list]');
  if (searchField) filterList(searchField);
  if (focus) {
    document.querySelector('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, positions.get(location.hash) || 0);
  }
}
function toast(message) {
  state.toast = message;
  document.querySelector('#announcements').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; document.querySelector('.toast')?.remove(); }, 4500);
}
function go(route, role = current.role) { location.hash = `/${role}/${route}`; }
function saveDraft(form) {
  for (const [key, value] of new FormData(form)) if (Object.hasOwn(state.draft, key)) state.draft[key] = String(value).trim();
}
function saveEventDraft(form) {
  const data = new FormData(form);
  state.eventDraft = { period: String(data.get('period') || ''), minute: String(data.get('minute') ?? '') };
}
function refreshQuickEntry(focusSelector) {
  const scroll = window.scrollY;
  const minuteOpen = Boolean(document.querySelector('.minute-detail')?.open);
  render();
  const detail = document.querySelector('.minute-detail');
  if (detail && minuteOpen) detail.open = true;
  document.querySelector(focusSelector)?.focus({ preventScroll: true });
  window.scrollTo(0, scroll);
}
function quickEventAction(target, clickEvent) {
  if (!['organizador', 'planillero'].includes(current.role) || state.gameState !== 'Captura abierta') return;
  const form = target.closest('[data-form="quick-event"]');
  if (!form) return;
  saveEventDraft(form);
  const action = target.dataset.action;
  if (action === 'quick-team') {
    if (!['parque', 'union'].includes(target.dataset.team)) return;
    state.eventTeam = target.dataset.team;
    refreshQuickEntry(`[data-action="quick-team"][data-team="${state.eventTeam}"]`);
    return;
  }
  if (action === 'quick-period') {
    const period = target.dataset.period;
    if (!Object.hasOwn(eventPeriods, period)) return;
    state.eventDraft.period = state.eventDraft.period === period ? '' : period;
    refreshQuickEntry(`[data-action="quick-period"][data-period="${period}"]`);
    return;
  }
  if (action === 'quick-kind') {
    const kind = target.dataset.kind;
    if (!['gol', 'amarilla', 'roja'].includes(kind)) return;
    history.replaceState(null, '', routeHref(`partido/evento/${kind}`));
    lastHash = location.hash;
    refreshQuickEntry(`[data-action="quick-kind"][data-kind="${kind}"]`);
    return;
  }
  if (action === 'undo-quick') {
    let index = -1;
    while (state.quickAddedIds.length && index < 0) {
      const id = state.quickAddedIds.pop();
      index = state.events.findIndex((item) => item.id === id);
    }
    if (index < 0) return;
    const [removed] = state.events.splice(index, 1);
    const label = removed.kind === 'gol' ? 'Gol' : `Tarjeta ${removed.kind}`;
    state.quickFeedback = `Se quitó: ${label.toLowerCase()} de ${removed.player}.`;
    quickTapTimes.clear();
    refreshQuickEntry('[data-action="undo-quick"]');
    return;
  }
  if (action !== 'quick-add') return;
  const kind = form.dataset.kind;
  const choices = state.eventTeam === 'parque' ? approved() : awayPlayers;
  const player = choices.find((person) => person.id === target.dataset.player);
  if (!player || !['gol', 'amarilla', 'roja'].includes(kind)) return;
  const input = form.querySelector('[name="minute"]');
  if (!input.reportValidity()) return;
  const rawMinute = state.eventDraft.minute.trim();
  const minute = rawMinute === '' ? null : Number(rawMinute);
  if (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 999)) return;
  const key = [kind, state.eventTeam, state.eventDraft.period, player.id].join(':');
  const now = Date.now();
  if (clickEvent.detail > 1 || now - (quickTapTimes.get(key) || 0) < 450) return;
  quickTapTimes.set(key, now);
  const added = { id: `quick-${now}-${++quickEventSequence}`, kind, team: state.eventTeam, player: nameOf(player), playerId: player.id, period: state.eventDraft.period, minute };
  state.events.push(added);
  state.quickAddedIds.push(added.id);
  state.eventDraft.minute = '';
  const label = kind === 'gol' ? 'Gol' : `Tarjeta ${kind}`;
  state.quickFeedback = `${label} · ${added.player} · ${team(added.team).name}${eventMoment(added) ? ` · ${eventMoment(added)}` : ''}`;
  refreshQuickEntry(`[data-action="quick-add"][data-player="${player.id}"]`);
}
document.addEventListener('click', (event) => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    document.querySelector('#contenido')?.focus();
    return;
  }
  const anchor = event.target.closest('a[href^="#/"]');
  if (anchor) positions.set(location.hash, window.scrollY);
  const target = event.target.closest('[data-action]');
  if (!target || target.tagName === 'SELECT') return;
  const action = target.dataset.action;
  if (action.startsWith('quick-') || action === 'undo-quick') { quickEventAction(target, event); return; }
  if (action === 'origin-kind' || action === 'origin-team') {
    saveDraft(target.closest('[data-form="player"]'));
    if (action === 'origin-kind') state.draft.originKind = target.dataset.value;
    else state.draft.internalTeam = target.dataset.team;
    state.error = '';
    render();
    document.querySelector(action === 'origin-kind' ? `[data-action="origin-kind"][data-value="${state.draft.originKind}"]` : `[data-action="origin-team"][data-team="${state.draft.internalTeam}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'roster-filter') { state.rosterFilter = target.dataset.value; render(); }
  if (action === 'undo-event' && ['organizador', 'planillero'].includes(current.role)) {
    if (!state.events.length) { toast('No hay eventos para deshacer.'); render(); return; }
    const removed = state.events.pop();
    state.quickAddedIds = state.quickAddedIds.filter((id) => id !== removed.id);
    state.quickFeedback = `Se quitó: ${removed.kind === 'gol' ? 'gol' : `tarjeta ${removed.kind}`} de ${removed.player}.`;
    toast(`Se quitó el último evento de muestra: ${removed.player}${eventMoment(removed) ? `, ${eventMoment(removed)}` : ''}.`); render();
  }
  if (action === 'finish-preview' && ['organizador', 'planillero'].includes(current.role)) {
    state.gameState = state.gameState === 'Captura abierta' ? 'Captura finalizada' : 'Captura abierta';
    toast(state.gameState === 'Captura abierta' ? 'Captura de muestra reabierta.' : 'Captura de muestra finalizada. El acta sigue siendo provisional.'); render();
  }
});
document.addEventListener('input', (event) => {
  const form = event.target.closest('[data-form="player"]');
  if (form) saveDraft(form);
  if (event.target.matches('[data-search-list]')) {
    filterList(event.target);
  }
  const eventForm = event.target.closest('[data-form="quick-event"]');
  if (eventForm) saveEventDraft(eventForm);
  const schedule = event.target.closest('[data-form="schedule"]');
  if (schedule) state.scheduleDrafts[schedule.dataset.id] = Object.fromEntries(new FormData(schedule));
});
function filterList(input) {
    state.searchByList[input.dataset.searchList] = input.value;
    const query = input.value.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '');
    let count = 0;
    document.querySelectorAll('[data-search]').forEach((row) => {
      row.hidden = !row.dataset.search.normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(query);
      if (!row.hidden) count++;
    });
    const empty = document.querySelector('#search-empty');
    if (empty) empty.hidden = count > 0;
    document.querySelector('#announcements').textContent = `${count} ${count === 1 ? 'coincidencia' : 'coincidencias'}`;
}
document.addEventListener('change', (event) => {
  if (event.target.closest('[data-form="quick-event"]')) saveEventDraft(event.target.form);
});
document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (form.dataset.form === 'auth') {
    const role = data.get('profile');
    go(role === 'equipo' ? 'mi-equipo' : role === 'planillero' ? 'partidos' : 'inicio', role);
  }
  if (form.dataset.form === 'player') {
    saveDraft(form);
    const step = Number(form.dataset.step);
    if (step === 2 && state.draft.originKind === 'internal' && !teams.some((item) => item.id === state.draft.internalTeam && item.id !== 'parque')) { state.error = 'Elegí el equipo de origen.'; render(); return; }
    if (step === 1) return go('jugadores/nuevo/2');
    if (!state.draft.first || !state.draft.last || !state.draft.birth) return go('jugadores/nuevo/1');
    if (state.draft.originKind === 'external' && (!state.draft.originTeam || !state.draft.originCity)) return go('jugadores/nuevo/2');
    const origin = state.draft.originKind === 'internal' ? `${team(state.draft.internalTeam).full} · ${team(state.draft.internalTeam).city}` : state.draft.originKind === 'external' ? `${state.draft.originTeam} · ${state.draft.originCity}` : 'Sin equipo anterior';
    players.push({ id: `p-${Date.now()}`, first: state.draft.first, last: state.draft.last, ficha: state.draft.ficha, origin, number: '', state: 'Borrador', position: 'Posición sin definir' });
    state.rosterFilter = 'Todos';
    state.searchByList.roster = '';
    for (const key of Object.keys(state.draft)) state.draft[key] = key === 'originKind' ? 'external' : '';
    toast('Jugador agregado como borrador en esta muestra.'); go(event.submitter?.value === 'another' ? 'jugadores/nuevo/1' : 'buena-fe');
  }
  if (form.dataset.form === 'schedule') {
    const match = state.fixture.find((item) => item.id === Number(form.dataset.id));
    const time = String(data.get('time'));
    state.scheduleDrafts[form.dataset.id] = Object.fromEntries(data);
    if (state.fixture.some((item) => item.id !== match.id && item.time === time && item.court === data.get('court'))) {
      state.error = 'Ya hay otro encuentro a esa hora en esta cancha. Elegí otro horario.';
      render(); document.querySelector('[role="alert"]')?.focus(); return;
    }
    const reason = String(data.get('reason')).trim();
    if (!reason) { state.error = 'Escribí el motivo del cambio.'; render(); return; }
    state.scheduleHistory.push({ id: match.id, before: match.time, after: time, reason });
    match.time = time;
    delete state.scheduleDrafts[form.dataset.id];
    toast('Horario actualizado en la muestra. La jornada se conserva.'); go('fixture');
  }
  if (form.dataset.form === 'access' && current.role === 'superadmin') {
    const person = state.admins.find((item) => item.id === form.dataset.id);
    const after = { activar: 'Activo', suspender: 'Suspendido', bloquear: 'Bloqueado' }[form.dataset.change];
    const reason = String(data.get('reason')).trim();
    if (!reason || !after) return;
    state.accessHistory.push({ id: person.id, before: person.status, after, reason });
    person.status = after;
    toast('Estado actualizado solo en la muestra.'); go(`administradores/${person.id}`);
  }
});
window.addEventListener('hashchange', () => {
  lastHash = location.hash;
  render(true);
});
window.addEventListener('offline', () => { toast('Vista local: los cambios de muestra siguen solo en memoria.'); render(); });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('scroll', () => positions.set(lastHash, window.scrollY), { passive: true });
lastHash = location.hash;
render();
