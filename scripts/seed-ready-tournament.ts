import { randomUUID } from 'node:crypto';
import { createPool } from '@torneos/db';
import type { RuleConfig } from '@torneos/shared';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { demoPassword, seed, seedIds } from '../packages/db/src/seed.ts';

const config=readConfig();
const destination=new URL(config.databaseUrl);
if(process.env.NODE_ENV==='production'||destination.hostname!=='127.0.0.1'||destination.pathname!=='/torneos_local')throw new Error('La muestra solo puede crearse en torneos_local de 127.0.0.1.');
const pool=createPool(config.databaseUrl);
const name='Copa de los Barrios · Demo 2026';
const rules:RuleConfig={initialPhase:{mode:'league',legs:1,groupCount:null},playersOnField:5,minimumToStart:4,minimumToContinue:3,maxMatchRoster:10,maxBenchPlayers:5,maxBenchStaff:2,lineupRoles:{goalkeeperRequired:false,captainRequired:false},maxRegisteredPlayers:16,substitutions:{mode:'unlimited',maxChanges:null,maxWindows:null,reentry:true},eligibility:{age:null,requiredDocuments:[]},advanced:{tiebreakers:['head_to_head_points','goal_difference','goals_for','wins','yellow_cards','manual_draw'],discipline:{yellowCards:true,redCards:true,secondYellowRed:false,yellowAccumulation:null,redReviewRequired:true},walkover:{enabled:false,winnerGoals:null,loserGoals:null,winnerPoints:null,loserPoints:null}},periods:[{name:'Primer tiempo',minutes:25},{name:'Segundo tiempo',minutes:25}],points:{win:3,draw:1,loss:0}};
const squads=[
  {name:'Barrio Norte Demo',color:'#165D46',players:[['Matías','Acuña'],['Lucas','Ríos'],['Diego','Ferreira'],['Gabriel','Vera'],['Nicolás','López'],['Iván','Duarte'],['Tomás','Benítez'],['Bruno','Giménez']]},
  {name:'Atlético Arroyo Demo',color:'#245486',players:[['Joaquín','Cáceres'],['Andrés','Medina'],['Federico','Ortiz'],['Samuel','Caballero'],['Alan','González'],['Thiago','Maidana'],['Rodrigo','Pérez'],['Enzo','Ayala']]},
  {name:'Unión Sur Demo',color:'#9B3F2F',players:[['Emanuel','Sosa'],['Carlos','Franco'],['Miguel','Romero'],['Agustín','Villalba'],['Kevin','Núñez'],['Pablo','Valdez'],['Hugo','Morales'],['Elías','Gómez']]},
  {name:'Deportivo Central Demo',color:'#8A6B25',players:[['Facundo','Martínez'],['Lautaro','Silva'],['Damián','Torres'],['Marcelo','Barrios'],['Alex','Báez'],['Oscar','Leiva'],['Cristian','Britez'],['Milton','Escobar']]},
];
try{
  await seed(pool,config.databaseUrl);
  const existing=await pool.query('SELECT id FROM tournaments WHERE organization_id=$1 AND name=$2',[seedIds.a,name]);
  if(existing.rowCount){console.log(JSON.stringify({reused:true,tournamentId:existing.rows[0].id,url:`http://127.0.0.1:4311/#/torneo/${existing.rows[0].id}/equipos`}));process.exitCode=0;}
  else{
    const app=await buildApp(config,pool);
    try{
      const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'ana@ejemplo.test',password:demoPassword}});
      if(login.statusCode!==200)throw new Error(`Acceso de muestra: ${login.statusCode} ${login.body}`);
      const cookie=`torneos_session=${login.cookies[0].value}`;
      let csrf=login.json().csrfToken as string;
      async function call(method:'GET'|'POST'|'PATCH',path:string,payload?:unknown){const response=await app.inject({method,url:`/api/v1${path}`,headers:{cookie,'x-csrf-token':csrf},payload:payload as any});if(response.statusCode>=400)throw new Error(`${method} ${path}: ${response.statusCode} ${response.body}`);return response.json();}
      const context=await call('POST','/auth/context',{organizationId:seedIds.a});csrf=context.csrfToken;
      const base=`/organizations/${seedIds.a}`;
      const created=await call('POST',`${base}/tournaments`,{requestId:randomUUID(),name,timezone:'America/Asuncion',editionName:'Temporada 2026',categoryName:'Libre',preset:'F5',teamLimit:8,rules,paymentRates:{yellowGuaranies:10000,redGuaranies:25000}});
      const tournamentId=created.tournamentId,categoryId=created.categoryId,editionId=created.editionId;
      await call('POST',`${base}/categories/${categoryId}/rules/publish`,{expectedRevision:1,reason:'Reglamento ficticio para probar el torneo'});
      const teams:Array<{entryId:string;name:string}>=[];
      for(const squad of squads){
        const team=await call('POST',`${base}/teams`,{requestId:randomUUID(),name:squad.name,color:squad.color,categoryId});
        teams.push({entryId:team.entryId,name:squad.name});
        await call('POST',`${base}/entries/${team.entryId}/publication`,{publicVisible:true,reason:'Equipo ficticio visible en la muestra'});
        const registrations:string[]=[];
        for(const [index,[givenNames,familyNames]] of squad.players.entries()){
          const player=await call('POST',`${base}/entries/${team.entryId}/players`,{givenNames,familyNames,documentKind:null,documentNumber:null,birthDate:`200${index%5}-0${index%8+1}-12`,registrationNumber:null,origin:{kind:'none'},details:{}});
          registrations.push(player.id);
        }
        await call('POST',`${base}/entries/${team.entryId}/good-faith/submit`,{registrationIds:registrations,expectedVersion:0,reason:'Plantel ficticio para la fecha inicial'});
        await call('POST',`${base}/entries/${team.entryId}/good-faith/review`,{version:1,decision:'approved',reason:'Aprobación de datos ficticios de muestra'});
      }
      const venue=await call('POST',`${base}/tournaments/${tournamentId}/venues`,{name:'Polideportivo Municipal Demo',city:'Asunción'});
      const phase=await call('POST',`${base}/categories/${categoryId}/fixture/phase`,{});
      await call('POST',`${base}/categories/${categoryId}/fixture/generate`,{expectedRevision:phase.revision});
      const fixture=await call('GET',`${base}/categories/${categoryId}/fixture`);
      const firstRound=fixture.rounds.find((round:{ordinal:number;leg:number})=>round.ordinal===1&&round.leg===1);
      if(!firstRound||firstRound.matches.length!==2)throw new Error('La ronda inicial no tiene los dos partidos previstos.');
      const day=await call('POST',`${base}/editions/${editionId}/matchdays`,{ordinal:1});
      for(const [index,match] of firstRound.matches.entries())await call('PATCH',`${base}/fixture/matches/${match.id}/schedule`,{matchdayId:day.id,venueId:venue.id,courtLabel:`Cancha ${index+1}`,date:'2026-11-01',time:'18:00',durationMinutes:50,refereeName:null,expectedRevision:0,reason:'Primera fecha ficticia programada'});
      const ready=await call('GET',`${base}/matchdays/${day.id}/preview`);
      if(ready.missing?.length)throw new Error(`La fecha ficticia no está lista: ${ready.missing.join(' ')}`);
      await call('POST',`${base}/matchdays/${day.id}/publish`,{expectedRevision:ready.revision,reason:'Primera fecha de la muestra lista para iniciar'});
      const payments=`${base}/tournaments/${tournamentId}/payments`;
      for(const team of teams)await call('POST',payments,{kind:'income',category:'registration',entryId:team.entryId,amountGuaranies:50000,description:`Inscripción ${team.name}`,occurredOn:'2026-10-30'});
      await call('POST',payments,{kind:'income',category:'tickets',entryId:null,amountGuaranies:15000,description:'Venta anticipada de entradas',occurredOn:'2026-10-30'});
      await call('POST',payments,{kind:'expense',category:'referee',entryId:null,amountGuaranies:20000,description:'Seña arbitral de Fecha 1',occurredOn:'2026-10-30'});
      await call('POST',payments,{kind:'charge',category:'fine_other',entryId:teams[0].entryId,amountGuaranies:8000,description:'Presentación tardía de planilla · muestra',occurredOn:'2026-10-30'});
      console.log(JSON.stringify({tournamentId,categoryId,teams:teams.length,players:32,matchdayId:day.id,matches:firstRound.matches.length,url:`http://127.0.0.1:4311/#/torneo/${tournamentId}/equipos`}));
    }finally{await app.close();}
  }
}finally{await pool.end();}
