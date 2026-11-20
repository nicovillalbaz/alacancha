import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closePublicDetail,pushPublicNavigation,publicMeasurementUrl,publicNavigationUrl,readPublicNavigation} from '../apps/web/src/public-navigation.ts';
import {claimFanView} from '../apps/web/src/public-visits.ts';
import {createViewReads} from '../apps/web/src/view-reads.ts';
import {createPublicReads} from '../apps/web/src/public-reads.ts';
import {isMatchListRoute,savedListScroll} from '../apps/web/src/match-list-navigation.ts';

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

test('el panel comparte la consulta al volver atrás y descarta datos tras guardar o cambiar de sesión', async () => {
  let time=0, calls=0;
  const reads=createViewReads(10,15_000,()=>time);
  let finish!: (value:number)=>void;
  const original=reads.read('schedule','session-a:org-a',()=>new Promise<number>(resolve=>{calls++;finish=resolve;}));
  assert.equal(reads.read('schedule','session-a:org-a',async()=>99),original);
  await Promise.resolve();
  reads.invalidate('schedule');
  const afterChange=await reads.read('schedule','session-a:org-a',async()=>++calls);
  finish(1);
  assert.equal(await original,1);
  assert.equal(afterChange,2);
  assert.equal(await reads.read('schedule','session-a:org-a',async()=>++calls),2);
  assert.equal(await reads.read('schedule','session-b:org-a',async()=>++calls),3);
  assert.equal(await reads.read('schedule','session-a:org-b',async()=>++calls),4);
  time=15_000;
  assert.equal(await reads.read('schedule','session-a:org-a',async()=>++calls),5);
  await assert.rejects(reads.read('payments','session-a:org-a',async()=>{throw new Error('red');}));
  assert.equal(await reads.read('payments','session-a:org-a',async()=>++calls),6);
  assert.equal(await reads.read('schedule','session-a:org-a',async()=>++calls),5);
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

test('la vuelta conserva el desplazamiento en la entrada de la lista y no lo copia al detalle',()=>{
  const original={history:globalThis.history,location:globalThis.location,window:globalThis.window};
  const listing={pathname:'/copa-sanber',search:'?vista=fixture',href:'https://alacancha.top/copa-sanber?vista=fixture'};
  const previous={matchList:{choices:{round:4}}};
  const navigation={state:previous as unknown,replaceState(state:unknown){this.state=state;},pushState(state:unknown){this.state=state;}};
  try{
    let saved:unknown;
    Object.assign(globalThis,{history:navigation,location:listing,window:{scrollY:720}});
    const replace=navigation.replaceState;
    navigation.replaceState=function(state:unknown){saved=state;replace.call(this,state);};
    pushPublicNavigation('fixture',{kind:'cruce',id:'4-2'});
    assert.deepEqual(saved,{matchList:{choices:{round:4},scroll:{top:720,matchId:undefined,offset:undefined}}});
    assert.equal(savedListScroll(),undefined);
    navigation.state=saved;
    assert.equal(savedListScroll()?.top,720);
    assert.equal(isMatchListRoute('torneo/nueva-copa/partidos/fecha-cuatro'),true);
    assert.equal(isMatchListRoute('torneo/nueva-copa/fixture/fecha-cuatro'),true);
    assert.equal(isMatchListRoute('partido/categoria/partido'),false);
  }finally{Object.assign(globalThis,original);}
});

test('publicar un cruce abierto conserva si se entró desde la lista o por enlace directo',()=>{
  const oldHistory=globalThis.history,oldLocation=globalThis.location;
  try{
    let fromList=false;
    const navigation={state:null as {alacanchaPublicDetail:boolean}|null,replaceState:(state:{alacanchaPublicDetail:boolean})=>{fromList=state.alacanchaPublicDetail;}};
    Object.assign(globalThis,{history:navigation,location:{pathname:'/copa-sanber',search:'?cruce=1-1'}});
    pushPublicNavigation('partidos',{kind:'partido',id:'nuevo'},true);
    assert.equal(fromList,false);
    navigation.state={alacanchaPublicDetail:true};
    pushPublicNavigation('partidos',{kind:'partido',id:'nuevo'},true);
    assert.equal(fromList,true);
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
