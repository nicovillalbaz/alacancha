import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '@torneos/db';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { hashPassword } from '../apps/api/src/security.ts';
import { processFlyerJobs } from '../apps/worker/src/flyers.ts';
import { localConnection } from './backup.ts';

const connection=process.env.TEST_DATABASE_URL!;
if(new URL(connection).pathname!=='/torneos_test'||process.env.NODE_ENV==='production')throw new Error('La medición con escritura solo admite torneos_test sintética.');
localConnection(connection);
const pool=createPool(connection),config={...readConfig(),databaseUrl:connection,mediaDir:resolve('.local/test-media')};
const app=await buildApp(config,pool);
const percentile=(numbers:number[],p:number)=>Math.round(numbers.slice().sort((a,b)=>a-b)[Math.ceil(numbers.length*p)-1]);
const identity=randomUUID(),password=`Perf-${randomUUID()}!`;
let created=false;
try{
  const {rows:matches}=await pool.query(`SELECT r.organization_id,r.match_id,m.home_entry_id FROM match_records r
    JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
    JOIN organizations o ON o.id=r.organization_id AND o.status='active'
    WHERE r.status='capturing' ORDER BY r.started_at DESC LIMIT 4`);
  if(matches.length<2)throw new Error('Se necesitan al menos dos partidos sintéticos en captura. Ejecutá primero npm test.');
  await pool.query('INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)',[identity,`perf-${identity}@ejemplo.test`,'Capturista sintético temporal',await hashPassword(password)]);
  created=true;
  for(const org of new Set(matches.map(item=>item.organization_id)))await pool.query("INSERT INTO memberships(id,organization_id,user_id,role,status) VALUES($1,$2,$3,'tournament_admin','active')",[randomUUID(),org,identity]);
  const sessions:Record<string,{cookie:string;csrf:string}>={};
  for(const [index,org] of [...new Set<string>(matches.map(item=>item.organization_id))].entries()){
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:`203.0.113.${30+index}`,payload:{username:`perf-${identity}@ejemplo.test`,password}});
    if(login.statusCode!==200)throw new Error(`Ingreso sintético falló: HTTP ${login.statusCode}`);
    const cookie=`torneos_session=${login.cookies[0].value}`;
    const context=await app.inject({method:'POST',url:'/api/v1/auth/context',headers:{cookie,'x-csrf-token':login.json().csrfToken},payload:{organizationId:org}});
    if(context.statusCode!==200)throw new Error(`Contexto sintético falló: HTTP ${context.statusCode}`);
    sessions[org]={cookie,csrf:context.json().csrfToken};
  }
  const foreign=await app.inject({method:'POST',url:`/api/v1/organizations/${matches[1].organization_id}/matches/${matches[1].match_id}/events`,headers:{cookie:sessions[matches[0].organization_id].cookie,'x-csrf-token':sessions[matches[0].organization_id].csrf},payload:{clientEventId:randomUUID(),kind:'incident',teamEntryId:matches[1].home_entry_id,registrationId:null,relatedRegistrationId:null,incidentNote:'Intento entre organizaciones',windowNo:null,period:null,minute:null}});
  if(foreign.statusCode!==403)throw new Error(`El acceso entre organizaciones debió fallar con 403: HTTP ${foreign.statusCode}`);
  const captureTimes:number[]=[],createdEvents:string[]=[];
  for(let offset=0;offset<20;offset+=4)await Promise.all(Array.from({length:Math.min(4,20-offset)},async(_,index)=>{
    const n=offset+index,match=matches[n%matches.length],session=sessions[match.organization_id],clientEventId=randomUUID();
    const payload={clientEventId,kind:'incident',teamEntryId:match.home_entry_id,registrationId:null,relatedRegistrationId:null,incidentNote:`Medición sintética ${n}`,windowNo:null,period:null,minute:null};
    const start=performance.now();const response=await app.inject({method:'POST',url:`/api/v1/organizations/${match.organization_id}/matches/${match.match_id}/events`,headers:{cookie:session.cookie,'x-csrf-token':session.csrf},payload});
    if(response.statusCode!==201)throw new Error(`Captura sintética HTTP ${response.statusCode}: ${response.body}`);
    captureTimes.push(performance.now()-start);createdEvents.push(clientEventId);
  }));
  const {rows:[replayCount]}=await pool.query('SELECT count(*)::int n FROM match_record_events WHERE client_event_id=$1',[createdEvents[0]]);
  if(replayCount.n!==1)throw new Error('La medición duplicó un evento.');
  const {rows:[queue]}=await pool.query("SELECT count(*)::int n FROM flyer_exports WHERE status IN ('queued','running')");
  if(queue.n)throw new Error('Hay flyers pendientes previos; no se puede aislar la medición del worker.');
  const {rows:[sample]}=await pool.query("SELECT * FROM flyer_exports WHERE status='ready' AND format='png' ORDER BY generated_at DESC LIMIT 1");
  if(!sample)throw new Error('Se necesita un flyer PNG sintético listo. Ejecutá primero npm test.');
  const {rows:[latest]}=await pool.query('SELECT max(version)::int version FROM flyer_exports WHERE organization_id=$1 AND kind=$2 AND source_id=$3 AND page_no=$4 AND format=$5 AND size_code=$6',[sample.organization_id,sample.kind,sample.source_id,sample.page_no,sample.format,sample.size_code]);
  const flyerIds:string[]=[];
  for(let n=1;n<=3;n++){
    const id=randomUUID();flyerIds.push(id);
    await pool.query(`INSERT INTO flyer_exports(id,organization_id,kind,source_id,page_no,version,template_key,template_version,format,size_code,source_key,request_key,input_fingerprint,snapshot,note,reason,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[id,sample.organization_id,sample.kind,sample.source_id,sample.page_no,latest.version+n,sample.template_key,sample.template_version,sample.format,sample.size_code,sample.source_key,randomUUID(),sample.input_fingerprint,JSON.stringify(sample.snapshot),sample.note,'Medición local del generador',sample.created_by]);
  }
  const workerStart=performance.now();await processFlyerJobs(pool,config.mediaDir,3);const workerMs=Math.round(performance.now()-workerStart);
  const {rows:generated}=await pool.query('SELECT id,status,error_message FROM flyer_exports WHERE id=ANY($1::uuid[])',[flyerIds]);
  if(generated.some(item=>item.status!=='ready'))throw new Error(`Generación de flyers incompleta: ${JSON.stringify(generated)}`);
  const report={at:new Date().toISOString(),database:'torneos_test',matches:matches.length,organizations:new Set(matches.map(item=>item.organization_id)).size,capture:{requests:captureTimes.length,concurrency:4,p50Ms:percentile(captureTimes,.5),p95Ms:percentile(captureTimes,.95),maxMs:Math.round(Math.max(...captureTimes)),crossOrganizationDenied:true,uniqueClientEvent:true},worker:{flyers:3,totalMs:workerMs,averageMs:Math.round(workerMs/3)},note:'Datos sintéticos. Fastify inject sin red; los eventos y flyers de medición permanecen en torneos_test para preservar historial.'};
  await writeFile('.local/perf-scenario.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
  if(created){await pool.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[identity]);await pool.query('UPDATE users SET disabled_at=now() WHERE id=$1',[identity]);}
  await app.close();await pool.end();
}
