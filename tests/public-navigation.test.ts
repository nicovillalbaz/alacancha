import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closePublicDetail,pushPublicNavigation,publicMeasurementUrl,publicNavigationUrl,readPublicNavigation} from '../apps/web/src/public-navigation.ts';
import {claimFanView} from '../apps/web/src/public-visits.ts';
import {createViewReads} from '../apps/web/src/view-reads.ts';
import {createPublicReads} from '../apps/web/src/public-reads.ts';
import {isMatchListRoute,savedListScroll} from '../apps/web/src/match-list-navigation.ts';
import {closeOwnDetail,moveWithinApp,skipDiscardedEntry} from '../apps/web/src/navigation-entry.ts';
import {invalidatePanelMutation} from '../apps/web/src/panel-mutations.ts';
import {organizerReads} from '../apps/web/src/view-reads.ts';
import {resolveAnnouncedPair} from '../apps/web/src/announced-fixture.ts';

test('un enlace a un cruce conserva el partido cuando cambia el orden de su jornada',()=>{
  const first={homeEntryId:'first',awayEntryId:'second'};
  const other={homeEntryId:'other',awayEntryId:'last'};
  const rounds=[{ordinal:2,legacyHomeOrder:['first','other'],matches:[other,first]}];
  assert.deepEqual(resolveAnnouncedPair(rounds,'2-1'),{ordinal:2,pair:first});
  assert.deepEqual(resolveAnnouncedPair(rounds,'2.first'),{ordinal:2,pair:first});
  assert.equal(resolveAnnouncedPair(rounds,'2.unknown'),undefined);
});

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

test('una edición de dorsal invalida el plantel exacto y deja disponibles horarios y pagos', async () => {
  const affected = 'token:org:/organizations/org/entries/team-a/players:';
  const otherEntry = 'token:org:/organizations/org/entries/team-b/players:';
  const otherOrg = 'token:other:/organizations/other/entries/team-a/players:';
  await Promise.all([
    organizerReads.read('roster',affected,async()=>1),
    organizerReads.read('roster',otherEntry,async()=>2),
    organizerReads.read('roster',otherOrg,async()=>3),
    organizerReads.read('schedule','token:org:/organizations/org/editions/round/matchdays:',async()=>4),
    organizerReads.read('payments','token:org:cup',async()=>5),
  ]);
  invalidatePanelMutation('/organizations/org/entries/team-a/players/player/shirt-number');
  assert.equal(organizerReads.peek('roster',affected),undefined);
  assert.equal(organizerReads.peek('roster',otherEntry),2);
  assert.equal(organizerReads.peek('roster',otherOrg),3);
  assert.equal(organizerReads.peek('schedule','token:org:/organizations/org/editions/round/matchdays:'),4);
  assert.equal(organizerReads.peek('payments','token:org:cup'),5);
  organizerReads.invalidate();
});

test('el historial conserva solo la base y una ficha, y Adelante omite formularios descartados', () => {
  const original={history:globalThis.history,location:globalThis.location,window:globalThis.window};
  const events = new EventTarget();
  const rows: Array<{ path: string; state: unknown }> = [{ path: '/origen', state: null },{ path: '/panel/torneos', state: null }];
  let index = 1;
  const assign = (path: string) => Object.assign(globalThis,{location:new URL(path,'https://example.test')});
  function visit(next: number) {
    index=next;
    assign(rows[next].path);
    const event=Object.assign(new Event('popstate'),{state:rows[next].state}) as PopStateEvent;
    events.dispatchEvent(event);
  }
  const navigation = {
    get state() { return rows[index].state; },
    replaceState(state:unknown,_title:string,path?:string) {
      rows[index]={path:path??rows[index].path,state};
      assign(rows[index].path);
    },
    pushState(state:unknown,_title:string,path:string) {
      rows.splice(++index,Infinity,{path,state});
      assign(path);
    },
    back() { visit(index-1); },
  };
  try {
    Object.assign(globalThis,{history:navigation,window:events});
    assign(rows[index].path);
    events.addEventListener('popstate',event=>skipDiscardedEntry(event as PopStateEvent));
    for(const tab of ['equipos','pagos','fixture','partidos','estadisticas'])moveWithinApp('panel',`/panel/torneo/cup/${tab}`,false);
    assert.equal(index,1);
    moveWithinApp('panel','/panel/partido/category/match',true);
    moveWithinApp('panel','/panel/jugador/team/player',true);
    assert.equal(index,2);
    assert.equal(closeOwnDetail('panel'),true);
    assert.equal(location.pathname,'/panel/torneo/cup/estadisticas');
    visit(2);
    assert.equal(location.pathname,'/panel/jugador/team/player');
    moveWithinApp('panel','/panel/torneo/cup/partidos',false);
    assert.equal(location.pathname,'/panel/torneo/cup/partidos');
    visit(2);
    assert.equal(location.pathname,'/panel/torneo/cup/partidos');
    navigation.back();
    assert.equal(location.pathname,'/origen');
  } finally {
    Object.assign(globalThis,original);
  }
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
    Object.assign(globalThis,{location:{pathname:'/copa-sanber',search:'?partido=F1'},history:{state:{appDetail:{area:'public',origin:'/copa-sanber'}},back:()=>{backwards++;},replaceState:(_state:unknown,_title:string,target:string)=>{replaced=target;}}});
    closePublicDetail('partidos');
    assert.equal(backwards,1);
    (globalThis.history as unknown as {state:unknown}).state=null;
    closePublicDetail('partidos');
    assert.equal(replaced,'/copa-sanber');
  }finally{Object.assign(globalThis,{history:oldHistory,location:oldLocation});}
});

test('la ficha de equipo abre la sección solicitada tras terminar la vuelta de historial',()=>{
  const original={history:globalThis.history,location:globalThis.location,window:globalThis.window};
  const events=new EventTarget();
  const origin='/copa-sanber?vista=valla';
  const assign=(path:string)=>Object.assign(globalThis,{location:new URL(path,'https://example.test')});
  let backed=false,rendered='';
  const navigation={
    state:{appDetail:{area:'public',origin}} as unknown,
    back(){backed=true;},
    replaceState(state:unknown,_title:string,path:string){this.state=state;assign(path);},
  };
  try{
    assign('/copa-sanber?vista=equipos&equipo=one');
    Object.assign(globalThis,{history:navigation,window:events});
    pushPublicNavigation('clasificacion',null,false,()=>{rendered=readPublicNavigation(location.search).view;});
    assert.equal(backed,true);
    assert.equal(rendered,'');
    navigation.state=null;
    assign(origin);
    events.dispatchEvent(new Event('popstate'));
    assert.equal(rendered,'clasificacion');
    assert.deepEqual(readPublicNavigation(location.search),{view:'clasificacion',detail:null});
  }finally{Object.assign(globalThis,original);}
});

test('la vuelta conserva el desplazamiento en la entrada de la lista y no lo copia al detalle',()=>{
  const original={history:globalThis.history,location:globalThis.location,window:globalThis.window};
  const listing={pathname:'/copa-sanber',search:'?vista=fixture',hash:'',href:'https://alacancha.top/copa-sanber?vista=fixture'};
  const previous={matchList:{choices:{round:4}}};
  const navigation={state:previous as unknown,replaceState(state:unknown){this.state=state;},pushState(state:unknown){this.state=state;}};
  try{
    let saved:unknown;
    Object.assign(globalThis,{history:navigation,location:listing,window:{scrollY:720}});
    const replace=navigation.replaceState;
    navigation.replaceState=function(state:unknown){saved=state;replace.call(this,state);};
    pushPublicNavigation('fixture',{kind:'cruce',id:'4-2'});
    assert.deepEqual(saved,{matchList:{choices:{round:4},scroll:{top:720,matchId:undefined,href:undefined,offset:undefined,focus:false}}});
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
    const navigation={state:null as {appDetail:{area:string;origin:string}}|null,replaceState:(state:{appDetail?:unknown}|null)=>{fromList=!!state?.appDetail;}};
    Object.assign(globalThis,{history:navigation,location:{pathname:'/copa-sanber',search:'?cruce=1-1',hash:''}});
    pushPublicNavigation('partidos',{kind:'partido',id:'nuevo'},true);
    assert.equal(fromList,false);
    navigation.state={appDetail:{area:'public',origin:'/copa-sanber'}};
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
