import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanLegacyHash,isFixtureOverview,isPublicRoute,routeFromUrl} from '../apps/web/src/client-route.ts';
import {startFixtureReads} from '../apps/web/src/fixture-start.ts';

test('las pantallas del panel abren directamente sin fragmento',()=>{
  assert.equal(routeFromUrl('/panel/torneo/copa-id/estadisticas',''), 'torneo/copa-id/estadisticas');
  assert.equal(routeFromUrl('/panel/equipo/equipo-id',''), 'equipo/equipo-id');
  assert.equal(routeFromUrl('/panel',''), 'panel');
});

test('enlaces privados anteriores se ordenan y los tokens permanecen en el fragmento',()=>{
  assert.equal(routeFromUrl('/','#/torneo/copa-id/estadisticas'),'torneo/copa-id/estadisticas');
  assert.equal(cleanLegacyHash('#/torneo/copa-id/estadisticas'),'/panel/torneo/copa-id/estadisticas');
  assert.equal(cleanLegacyHash('#/publico/organizacion-id'),null);
  assert.equal(cleanLegacyHash('#/invitacion/token-secreto'),null);
  assert.equal(cleanLegacyHash('#/recuperacion/token-secreto'),null);
});

test('un alias público y el contexto inicial siguen resolviéndose como torneo',()=>{
  assert.equal(routeFromUrl('/fcfs-copacaacupe','',{publicPath:'/fcfs-copacaacupe',publicOrganizationId:'organizacion-id',publicTournamentId:'torneo-id'}),'publico/organizacion-id/torneo-id');
  assert.equal(routeFromUrl('/fcfs-copacaacupe',''),'portal/fcfs-copacaacupe');
});

test('el arranque público y el panel respetan enlaces directos y fragmentos antiguos',()=>{
  for (const [pathname,hash] of [['/',''],['/fcfs-copacaacupe',''],['/','#/publico/organizacion/torneo'],['/','#/publico']]){
    assert.equal(isPublicRoute(routeFromUrl(pathname,hash)),true,`${pathname}${hash}`);
  }
  for (const [pathname,hash] of [['/acceso',''],['/panel',''],['/panel/torneo/id/partidos',''],['/','#/invitacion/token-secreto'],['/','#/recuperacion/token-secreto'],['/','#/torneo/id/partidos']]){
    assert.equal(isPublicRoute(routeFromUrl(pathname,hash)),false,`${pathname}${hash}`);
  }
});

test('solo la entrada directa a Fixture adelanta la sesión del panel',()=>{
  const fixture='torneo/1245a013-9ac4-47d7-bd81-2cadccc603aa/fixture';
  assert.equal(isFixtureOverview(routeFromUrl(`/panel/${fixture}`,'')),true);
  assert.equal(isFixtureOverview(routeFromUrl('/',`#/${fixture}`)),true);
  assert.equal(isFixtureOverview(`${fixture}/new`),false);
  assert.equal(isFixtureOverview('acceso'),false);
  assert.equal(isFixtureOverview('portal/copa-sanber'),false);
});

test('el arranque del Fixture comparte el calendario anunciado con la vista', {timeout:2000}, async t => {
  const org = '/organizations/organizacion';
  const announcement = '/public' + org + '/categories/primera/fixture/announced';
  let announce!: () => void;
  const requestedAnnouncement = new Promise<void>(resolve => { announce = resolve; });
  const fetch = t.mock.method(globalThis,'fetch',async (input: string, options: RequestInit) => {
    const path = input.slice('/api/v1'.length);
    if (path === '/auth/me') return Response.json({
      organizationId:'organizacion',platformAdmin:false,
      memberships:[{organization_id:'organizacion',organization_status:'active',role:'tournament_admin',status:'active'}],
    });
    if (path === `${org}/tournaments`) return Response.json([
      {id:'otra-copa',edition_id:'otra',category_id:'otra',has_position_blueprint:true},
      {id:'copa',edition_id:'2026',category_id:'primera',has_position_blueprint:false,has_announced_fixture:true},
    ]);
    if (path === announcement) {
      assert.equal(options.credentials,'omit');
      announce();
    }
    return Response.json({path});
  });
  const start = startFixtureReads('torneo/copa/fixture');
  try {
    await requestedAnnouncement;
    assert.equal((await (await start.take(announcement))?.json()).path,announcement);
    assert.equal(start.take(announcement),undefined);
    assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]),[
      '/api/v1/auth/me',`/api/v1${org}/tournaments`,`/api/v1${org}`,
      `/api/v1${org}/teams?torneo=copa`,`/api/v1${org}/editions/2026/matchdays?vista=lista`,
      `/api/v1${org}/categories/primera/fixture`,`/api/v1${announcement}`,
    ]);
  } finally {
    start.cancel();
  }
});
