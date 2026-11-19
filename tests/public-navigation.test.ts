import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closePublicDetail,publicMeasurementUrl,publicNavigationUrl,readPublicNavigation} from '../apps/web/src/public-navigation.ts';
import {claimFanView} from '../apps/web/src/public-visits.ts';
import {createPublicReads} from '../apps/web/src/public-reads.ts';

test('las lecturas públicas comparten la solicitud en curso y se renuevan con el resultado', async t => {
  let fetched = 0;
  const fetchMock = t.mock.method(globalThis,'fetch', async () => Response.json({value:++fetched}));
  const read = createPublicReads();
  const first = read('/cup/competition','1');
  assert.equal(first, read('/cup/competition','1'));
  assert.deepEqual(await first,{value:1});
  assert.deepEqual(await read('/cup/competition','1'),{value:1});
  assert.deepEqual(await read('/cup/competition','2'),{value:2});
  assert.equal(fetchMock.mock.callCount(),2);
  assert.equal(fetchMock.mock.calls[0].arguments[1]?.credentials,'omit');
});

test('una sesión cuenta una visita, una apertura por copa y una apertura por sección', () => {
  function newSession() {
    const storage = new Map<string, string>();
    return { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) };
  }
  const storage = newSession();
  const view = { id: 'copa-a', section: 'partidos' };
  assert.equal(claimFanView(storage)?.visit, true);
  assert.deepEqual(claimFanView(storage, view), { visit: false, tournament: { ...view, first: true } });
  assert.equal(claimFanView(storage, view), null);
  assert.equal(claimFanView(storage, { ...view, section: 'equipos' })?.tournament?.first, false);
  assert.equal(claimFanView(storage, { ...view, id: 'copa-b' })?.tournament?.first, true);
  assert.equal(claimFanView(newSession(), view)?.visit, true);
});

test('la URL pública conserva la copa y abre una sección directamente',()=>{
  const url=publicNavigationUrl('/fcfs-copacaacupe','','clasificacion');
  assert.equal(url,'/fcfs-copacaacupe?vista=clasificacion');
  assert.deepEqual(readPublicNavigation(new URL(url,'https://alacancha.top').search),{view:'clasificacion',detail:null});
});

test('partido y equipo tienen una sola dirección activa y volver limpia el detalle',()=>{
  const match=publicNavigationUrl('/copa-sanber','?vista=equipos&equipo=anterior','partidos',{kind:'partido',id:'match-1'});
  assert.equal(match,'/copa-sanber?partido=match-1');
  assert.deepEqual(readPublicNavigation(new URL(match,'https://alacancha.top').search),{view:'partidos',detail:{kind:'partido',id:'match-1'}});
  assert.equal(publicNavigationUrl('/copa-sanber',new URL(match,'https://alacancha.top').search,'partidos'),'/copa-sanber');
});

test('un cruce anunciado mantiene su jornada y preserva parámetros ajenos',()=>{
  const url=publicNavigationUrl('/copa-sanber','?origen=mensaje&partido=viejo','fixture',{kind:'cruce',id:'2-3'});
  assert.equal(url,'/copa-sanber?origen=mensaje&vista=fixture&cruce=2-3');
  assert.deepEqual(readPublicNavigation(new URL(url,'https://alacancha.top').search),{view:'fixture',detail:{kind:'cruce',id:'2-3'}});
});

test('cerrar un detalle vuelve por historial o limpia un enlace directo',()=>{
  const oldHistory=globalThis.history,oldLocation=globalThis.location;
  let backwards=0,replaced='';
  try{
    Object.assign(globalThis,{location:{pathname:'/copa-sanber',search:'?partido=F1'},history:{state:{alacanchaPublicDetail:true},back:()=>{backwards++;},replaceState:(_state:unknown,_title:string,target:string)=>{replaced=target;}}});
    closePublicDetail('partidos');
    assert.equal(backwards,1);
    (globalThis.history as unknown as {state:unknown}).state=null;
    closePublicDetail('partidos');
    assert.equal(replaced,'/copa-sanber');
  }finally{Object.assign(globalThis,{history:oldHistory,location:oldLocation});}
});

test('la medición distingue secciones y tipos de ficha sin copiar identificadores ni rutas privadas',()=>{
  const origin='https://torneos.example';
  const canonical=`${origin}/copa-demo`;
  assert.equal(publicMeasurementUrl(canonical,new URL(`${canonical}?vista=equipos&equipo=123&dato=privado`)),`${canonical}?vista=equipos&detalle=equipo`);
  assert.equal(publicMeasurementUrl(canonical,new URL(`${canonical}?vista=sin-validar&cruce=2-3`)),`${canonical}?vista=partidos&detalle=cruce`);
  assert.equal(publicMeasurementUrl(canonical,new URL(`${canonical}#/recuperacion/ejemplo`)),null);
  assert.equal(publicMeasurementUrl(canonical,new URL(`${origin}/panel/actividad`)),null);
  assert.equal(publicMeasurementUrl(canonical,new URL(`${origin}/otra-copa?vista=equipos`)),null);
});
