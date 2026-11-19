import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanLegacyHash,isPublicRoute,routeFromUrl} from '../apps/web/src/client-route.ts';

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
