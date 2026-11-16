import { readFile } from 'node:fs/promises';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { createPool } from '@torneos/db';

const config=readConfig(),target=process.env.FSBFS_FIXTURE_TARGET;
const database=new URL(config.databaseUrl);
if(process.env.NODE_ENV!=='production'||!['production','rehearsal'].includes(target||'')||database.hostname!=='127.0.0.1'||database.pathname!==(target==='production'?'/torneos_prod':'/torneos_fsbfs_rehearsal')||config.origin!=='https://alacancha.top')throw new Error('Destino de Copa Sanber no autorizado.');
const organizationId='7a8be048-ffce-4e14-9213-cb0d902e326d',categoryId='198ee7f1-a932-4fce-9165-33dd23d89ed8';
const names:Record<string,string>={A:'Concepción Fútbol Club',B:'San Cristóbal',C:'Deportivo Puerta del Lago',D:'Villa Delfina',E:'Sport Comando',F:'Santa Rosa FC',G:'Los Russia FC',H:'Sport Center',I:'Sport Santa Lucía',J:'3 de Febrero'};
const pairs=['AH BC DG EF JI','CA FJ GE HD IB','AI BF DC HG JE','CH EB FA GJ ID','AE BJ CG DF HI','ED FH GB IC JA','AB CF DJ HE IG','AG BD EC FI JH','CJ DA GF HB IE'];
const pool=createPool(config.databaseUrl),app=await buildApp(config,pool);
try{
  const {rows:entries}=await pool.query(`SELECT e.id,t.name FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE e.organization_id=$1 AND e.category_id=$2 AND e.status='active' AND e.public_visible`,[organizationId,categoryId]);
  if(entries.length!==10||Object.values(names).some(name=>entries.filter(entry=>entry.name===name).length!==1))throw new Error('Los diez equipos públicos no coinciden con la hoja.');
  const entryByName=new Map(entries.map(entry=>[entry.name,entry.id]));
  const rounds=pairs.map((line,index)=>({ordinal:index+1,matches:line.split(' ').map(pair=>({homeEntryId:entryByName.get(names[pair[0]])!,awayEntryId:entryByName.get(names[pair[1]])!}))}));
  const fullSet=new Set(rounds.flatMap(round=>round.matches.map(match=>[match.homeEntryId,match.awayEntryId].sort().join(':'))));
  if(fullSet.size!==45||rounds.some(round=>new Set(round.matches.flatMap(match=>[match.homeEntryId,match.awayEntryId])).size!==10))throw new Error('La transcripción no forma una rueda única completa.');
  const {rows:[state]}=await pool.query(`SELECT t.name,t.public_preview_at,t.status tournament_status,c.status category_status,rv.status rule_status,(SELECT count(*)::int FROM draft_matches WHERE organization_id=$1 AND category_id=$2) official_drafts FROM categories c JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id JOIN rule_versions rv ON rv.organization_id=c.organization_id AND rv.category_id=c.id WHERE c.organization_id=$1 AND c.id=$2 ORDER BY rv.version DESC LIMIT 1`,[organizationId,categoryId]);
  if(!state||state.name!=='Copa Sanber'||!state.public_preview_at||state.tournament_status!=='draft'||state.category_status!=='draft'||state.rule_status!=='draft'||state.official_drafts!==0)throw new Error('El estado de Copa Sanber cambió; revisión manual requerida.');
  const credential=await readFile(`/srv/torneos/private/fsbfs-access-${target}.txt`,'utf8');
  const password=credential.match(/^Contraseña: (.+)$/m)?.[1];if(!password)throw new Error('Falta la credencial organizadora privada.');
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'usuariofsbfs',password}});
  if(login.statusCode!==200)throw new Error(`No se pudo autenticar al organizador: ${login.statusCode}`);
  const cookie=`torneos_session=${login.cookies[0].value}`;
  const context=await app.inject({method:'POST',url:'/api/v1/auth/context',headers:{cookie,'x-csrf-token':login.json().csrfToken},payload:{organizationId}});
  if(context.statusCode!==200)throw new Error(`No se pudo seleccionar la organización: ${context.statusCode}`);
  const headers={cookie,'x-csrf-token':context.json().csrfToken};
  const base=`/api/v1/organizations/${organizationId}/categories/${categoryId}/fixture/announced`;
  const forbidden=await app.inject({method:'PUT',url:`/api/v1/organizations/85b89c2d-d78a-4a23-81e3-ce0ba9272c40/categories/${categoryId}/fixture/announced`,headers,payload:{}});
  if(forbidden.statusCode!==403)throw new Error(`El control entre organizaciones no rechazó la escritura: ${forbidden.statusCode}`);
  const existing=await app.inject({method:'GET',url:base,headers});
  if(existing.statusCode!==200&&existing.statusCode!==404)throw new Error(`No se pudo leer el plan: ${existing.statusCode}`);
  const old=existing.statusCode===200?existing.json():null;
  if(old&&(old.rounds.length!==rounds.length||old.rounds.some((round:{ordinal:number;matches:Array<{homeEntryId:string;awayEntryId:string}>},index:number)=>round.ordinal!==rounds[index].ordinal||round.matches.length!==5||round.matches.some((match,matchIndex)=>match.homeEntryId!==rounds[index].matches[matchIndex].homeEntryId||match.awayEntryId!==rounds[index].matches[matchIndex].awayEntryId))))throw new Error('Existe otro fixture de Sanber; no se reemplazó automáticamente.');
  let revision=old?.revision||0;
  if(!old){
    const saved=await app.inject({method:'PUT',url:base,headers,payload:{expectedRevision:0,rounds,qualificationCount:8,semifinalPairing:'pending',reason:'Transcripción verificada del calendario entregado por el organizador'}});
    if(saved.statusCode!==200)throw new Error(`No se pudo guardar el calendario: ${saved.statusCode} ${saved.body}`);
    revision=saved.json().revision;
  }
  const published=await app.inject({method:'POST',url:`${base}/publish`,headers,payload:{expectedRevision:revision,reason:'Publicar las nueve jornadas anunciadas sin fechas ni horas'}});
  if(published.statusCode!==200)throw new Error(`No se pudo publicar el calendario: ${published.statusCode} ${published.body}`);
  const publicResult=await app.inject({method:'GET',url:`/api/v1/public/organizations/${organizationId}/categories/${categoryId}/fixture/announced`});
  if(publicResult.statusCode!==200||publicResult.json().rounds.length!==9||publicResult.json().teams.length!==10)throw new Error('El portal público no entrega el calendario completo.');
  console.log(JSON.stringify({target,revision,rounds:9,matches:45,teams:10,qualificationCount:8,quarterPairing:'in_person_draw',semifinalPairing:'pending',finalPairing:'winners',url:'https://alacancha.top/copa-sanber'}));
}finally{await app.close();await pool.end();}
