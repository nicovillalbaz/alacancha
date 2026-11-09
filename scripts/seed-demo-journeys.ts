import { randomUUID } from 'node:crypto';
import { createPool } from '@torneos/db';
import type { RuleConfig } from '@torneos/shared';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { demoPassword, seed, seedIds } from '../packages/db/src/seed.ts';

const config=readConfig(),destination=new URL(config.databaseUrl);
if(process.env.NODE_ENV==='production'||destination.hostname!=='127.0.0.1'||destination.pathname!=='/torneos_local')throw new Error('Solo se permite poblar torneos_local en 127.0.0.1.');
const pool=createPool(config.databaseUrl);
const basic:RuleConfig={initialPhase:{mode:'league',legs:1,groupCount:null},playersOnField:5,minimumToStart:4,minimumToContinue:3,maxMatchRoster:10,maxBenchPlayers:5,maxBenchStaff:2,lineupRoles:{goalkeeperRequired:false,captainRequired:false},maxRegisteredPlayers:16,substitutions:{mode:'unlimited',maxChanges:null,maxWindows:null,reentry:true},eligibility:{age:null,requiredDocuments:[]},advanced:{tiebreakers:['head_to_head_points','goal_difference','goals_for','wins','yellow_cards','manual_draw'],discipline:{yellowCards:true,redCards:true,secondYellowRed:false,yellowAccumulation:null,redReviewRequired:true},walkover:{enabled:false,winnerGoals:null,loserGoals:null,winnerPoints:null,loserPoints:null}},periods:[{name:'Primer tiempo',minutes:25},{name:'Segundo tiempo',minutes:25}],points:{win:3,draw:1,loss:0}};
const scenarios=[
  {name:'Liga finalizada · Muestra 2026',mode:'league' as const,teams:4,date:'2026-10-10',complete:true,rules:basic},
  {name:'Copa por grupos · Muestra 2026',mode:'groups' as const,teams:8,date:'2026-11-07',complete:false,rules:{...basic,initialPhase:{mode:'groups' as const,legs:1 as const,groupCount:2},competitionPlan:{qualification:{from:'groups' as const,perGroup:2,bestRemaining:0},bracketSize:4,rounds:[{size:4,pairing:'positions' as const,legs:1 as const},{size:2,pairing:'positions' as const,legs:1 as const}]}}},
  {name:'Copa eliminación · Muestra 2026',mode:'knockout' as const,teams:4,date:'2026-11-14',complete:false,rules:{...basic,initialPhase:{mode:'knockout' as const,legs:1 as const,groupCount:null}}},
  {name:'Liga para sortear · Muestra 2026',mode:'league' as const,teams:4,date:'2026-11-21',complete:false,rules:basic,drawReady:true},
];
try{
  await seed(pool,config.databaseUrl);
  const app=await buildApp(config,pool);
  try{
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'ana@ejemplo.test',password:demoPassword}});
    if(login.statusCode!==200)throw new Error(`Acceso sintético: ${login.statusCode} ${login.body}`);
    const cookie=`torneos_session=${login.cookies[0].value}`;let csrf=login.json().csrfToken as string;
    async function call(method:'GET'|'POST'|'PATCH',path:string,payload?:unknown){const response=await app.inject({method,url:`/api/v1${path}`,headers:{cookie,'x-csrf-token':csrf},payload:payload as object});if(response.statusCode>=400)throw new Error(`${method} ${path}: ${response.statusCode} ${response.body}`);return response.json();}
    csrf=(await call('POST','/auth/context',{organizationId:seedIds.a})).csrfToken;
    const root=`/organizations/${seedIds.a}`;
    for(const scenario of scenarios){
      const existing=await pool.query('SELECT id FROM tournaments WHERE organization_id=$1 AND name=$2',[seedIds.a,scenario.name]);
      if(existing.rowCount && !('drawReady' in scenario && scenario.drawReady)){const {rows:players}=await pool.query(`SELECT pr.id FROM player_registrations pr JOIN team_entries te ON te.organization_id=pr.organization_id AND te.id=pr.entry_id JOIN categories c ON c.organization_id=te.organization_id AND c.id=te.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id LEFT JOIN player_publications pp ON pp.organization_id=pr.organization_id AND pp.registration_id=pr.id WHERE pr.organization_id=$1 AND ed.tournament_id=$2 AND COALESCE(pp.visible,false)=false`,[seedIds.a,existing.rows[0].id]);for(const player of players)await call('POST',`${root}/registrations/${player.id}/publication`,{visible:true,reason:'Nombre ficticio visible en la muestra'});console.log(JSON.stringify({name:scenario.name,reused:true,url:`http://127.0.0.1:4311/#/torneo/${existing.rows[0].id}/fixture`}));continue;}
      const created=existing.rowCount?(await pool.query(`SELECT t.id "tournamentId",ed.id "editionId",c.id "categoryId" FROM tournaments t JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id WHERE t.organization_id=$1 AND t.id=$2 LIMIT 1`,[seedIds.a,existing.rows[0].id])).rows[0]:await call('POST',`${root}/tournaments`,{requestId:randomUUID(),name:scenario.name,timezone:'America/Asuncion',editionName:'Temporada 2026',categoryName:'Libre',preset:'F5',teamLimit:scenario.teams,rules:scenario.rules});
      const {tournamentId,categoryId,editionId}=created;
      if(!existing.rowCount)await call('POST',`${root}/categories/${categoryId}/rules/publish`,{expectedRevision:1,reason:'Reglamento de muestra'});
      const roster=new Map<string,string>();
      for(let index=0;index<scenario.teams;index++){
        const teamName=`${['Norte','Sur','Este','Oeste','Centro','Unión','Atlético','Deportivo'][index]} ${'drawReady' in scenario?'Sorteo':scenario.mode} Demo`;
        if(existing.rowCount && (await pool.query('SELECT 1 FROM teams WHERE organization_id=$1 AND name=$2',[seedIds.a,teamName])).rowCount)continue;
        const team=await call('POST',`${root}/teams`,{requestId:randomUUID(),name:teamName,color:['#165D46','#245486','#9B3F2F','#8A6B25','#6A3D83','#9C5C24','#3C6974','#7D3348'][index],categoryId});
        await call('POST',`${root}/entries/${team.entryId}/publication`,{publicVisible:true,reason:'Equipo sintético visible'});
        const player=await call('POST',`${root}/entries/${team.entryId}/players`,{givenNames:['Matías','Diego','Lucía','Bruno','Andrés','Nicolás','Elías','Samuel'][index],familyNames:['Acuña','Vera','Silva','Ríos','Ortiz','Sosa','Medina','Torres'][index],documentKind:null,documentNumber:null,birthDate:`200${index}-04-12`,registrationNumber:null,origin:{kind:'none'},details:{}});
        roster.set(team.entryId,player.id);
        await call('POST',`${root}/registrations/${player.id}/publication`,{visible:true,reason:'Nombre ficticio visible en la muestra'});
      }
      const venue=existing.rowCount?(await pool.query('SELECT v.id FROM tournament_venues tv JOIN venues v ON v.organization_id=tv.organization_id AND v.id=tv.venue_id WHERE tv.organization_id=$1 AND tv.tournament_id=$2 LIMIT 1',[seedIds.a,tournamentId])).rows[0]||await call('POST',`${root}/tournaments/${tournamentId}/venues`,{name:'Polideportivo Municipal · Muestra',city:'Asunción'}):await call('POST',`${root}/tournaments/${tournamentId}/venues`,{name:'Polideportivo Municipal · Muestra',city:'Asunción'});
      if('drawReady' in scenario && scenario.drawReady){console.log(JSON.stringify({name:scenario.name,tournamentId,mode:scenario.mode,drawReady:true,url:`http://127.0.0.1:4311/#/torneo/${tournamentId}/fixture`}));continue;}
      const phase=await call('POST',`${root}/categories/${categoryId}/fixture/phase`,{});
      await call('POST',`${root}/categories/${categoryId}/fixture/generate`,{expectedRevision:phase.revision});
      const fixture=await call('GET',`${root}/categories/${categoryId}/fixture`);
      const rounds=scenario.complete?[...new Set(fixture.rounds.map((round:{ordinal:number})=>round.ordinal))] as number[]:[1];
      for(const ordinal of rounds){
        const day=await call('POST',`${root}/editions/${editionId}/matchdays`,{ordinal});
        const matches=fixture.rounds.filter((round:{ordinal:number})=>round.ordinal===ordinal).flatMap((round:{matches:Array<{id:string;home_entry_id:string;away_entry_id:string}>})=>round.matches);
        const date=new Date(`${scenario.date}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+(ordinal-1)*7);const matchDate=date.toISOString().slice(0,10);
        for(const [index,match] of matches.entries())await call('PATCH',`${root}/fixture/matches/${match.id}/schedule`,{matchdayId:day.id,venueId:venue.id,courtLabel:'Cancha 1',date:matchDate,time:`${String(10+index*2).padStart(2,'0')}:00`,durationMinutes:60,refereeName:null,expectedRevision:0,reason:'Fixture sintético'});
        const preview=await call('GET',`${root}/matchdays/${day.id}/preview`);if(preview.missing.length)throw new Error(preview.missing.join(' '));
        await call('POST',`${root}/matchdays/${day.id}/publish`,{expectedRevision:preview.revision,reason:'Fecha sintética publicada'});
        if(scenario.complete)for(const [index,match] of matches.entries()){
          await call('POST',`${root}/matches/${match.id}/record/start`,{});
          const goals=index%2===0?[[match.home_entry_id,2],[match.away_entry_id,1]]:[[match.home_entry_id,0],[match.away_entry_id,2]];
          for(const [entry,count] of goals)for(let n=0;n<Number(count);n++)await call('POST',`${root}/matches/${match.id}/events`,{clientEventId:randomUUID(),kind:'goal',teamEntryId:entry,registrationId:roster.get(entry),period:n%2?'ST':'PT',minute:null});
          await call('POST',`${root}/matches/${match.id}/acta/submit`,{reason:'Resultado sintético'});
          await call('POST',`${root}/matches/${match.id}/acta/approve`,{reason:'Resultado sintético confirmado',overrideSignoffs:true});
        }
      }
      console.log(JSON.stringify({name:scenario.name,tournamentId,mode:scenario.mode,dates:rounds.length,url:`http://127.0.0.1:4311/#/torneo/${tournamentId}/fixture`}));
    }
  }finally{await app.close();}
}finally{await pool.end();}
