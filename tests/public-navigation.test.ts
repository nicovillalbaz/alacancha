import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closePublicDetail,publicNavigationUrl,readPublicNavigation} from '../apps/web/src/public-navigation.ts';

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
