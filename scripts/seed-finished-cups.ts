import {randomUUID} from 'node:crypto';
import {createPool} from '@torneos/db';
import type {RuleConfig} from '@torneos/shared';
import {buildApp} from '../apps/api/src/app.ts';
import {readConfig} from '../apps/api/src/config.ts';
import {demoPassword,seed,seedIds} from '../packages/db/src/seed.ts';

const config=readConfig(),destination=new URL(config.databaseUrl);
if(process.env.NODE_ENV==='production'||destination.hostname!=='127.0.0.1'||destination.pathname!=='/torneos_local')throw new Error('Solo se permiten ejemplos sintéticos en torneos_local.');
const pool=createPool(config.databaseUrl);
const base:RuleConfig={initialPhase:{mode:'league',legs:1,groupCount:null},playersOnField:5,minimumToStart:4,minimumToContinue:3,maxMatchRoster:10,maxBenchPlayers:5,maxBenchStaff:2,lineupRoles:{goalkeeperRequired:false,captainRequired:false},maxRegisteredPlayers:16,substitutions:{mode:'unlimited',maxChanges:null,maxWindows:null,reentry:true},eligibility:{age:null,requiredDocuments:[]},advanced:{tiebreakers:['head_to_head_points','goal_difference','goals_for','wins','yellow_cards','manual_draw'],discipline:{yellowCards:true,redCards:true,secondYellowRed:false,yellowAccumulation:null,redReviewRequired:true},walkover:{enabled:false,winnerGoals:null,loserGoals:null,winnerPoints:null,loserPoints:null}},periods:[{name:'Primer tiempo',minutes:25},{name:'Segundo tiempo',minutes:25}],points:{win:3,draw:1,loss:0}};
const scenarios=[
  {name:'Copa por grupos · Finalizada 2026',mode:'groups' as const,teams:8,rules:{...base,initialPhase:{mode:'groups' as const,legs:1 as const,groupCount:2},competitionPlan:{qualification:{from:'groups' as const,perGroup:2,bestRemaining:0},bracketSize:4,rounds:[{size:4,pairing:'positions' as const,legs:1 as const},{size:2,pairing:'positions' as const,legs:1 as const}]}}},
  {name:'Copa eliminación · Finalizada 2026',mode:'knockout' as const,teams:4,rules:{...base,initialPhase:{mode:'knockout' as const,legs:1 as const,groupCount:null},competitionPlan:{qualification:{from:'direct' as const,entrants:4},bracketSize:4,rounds:[{size:4,pairing:'draw' as const,legs:2 as const,resolution:'aggregate' as const},{size:2,pairing:'positions' as const,legs:1 as const}]}}},
  {name:'Liguilla y eliminación · Finalizada 2026',mode:'league' as const,teams:4,rules:{...base,initialPhase:{mode:'league' as const,legs:1 as const,groupCount:null},competitionPlan:{qualification:{from:'league' as const,top:4},bracketSize:4,rounds:[{size:4,pairing:'positions' as const,legs:2 as const,resolution:'match_points_third' as const},{size:2,pairing:'positions' as const,legs:2 as const,resolution:'match_points_penalties' as const}]}}},
];
type Match={id:string;home_entry_id:string;away_entry_id:string;matchday_id:string|null;fixture_leg:number|null};
type Slot={stage:number;slot:number;match_id:string|null;return_match_id:string|null;decider_match_id:string|null};
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
      const {rows:[existing]}=await pool.query('SELECT id FROM tournaments WHERE organization_id=$1 AND name=$2',[seedIds.a,scenario.name]);
      const created=existing?(await pool.query(`SELECT t.id "tournamentId",ed.id "editionId",c.id "categoryId" FROM tournaments t JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id WHERE t.organization_id=$1 AND t.id=$2 LIMIT 1`,[seedIds.a,existing.id])).rows[0]:await call('POST',`${root}/tournaments`,{requestId:randomUUID(),name:scenario.name,timezone:'America/Asuncion',editionName:'Temporada 2026',categoryName:'Libre',preset:'F5',teamLimit:scenario.teams,rules:scenario.rules});
      const {tournamentId,editionId,categoryId}=created;
      if(!existing)await call('POST',`${root}/categories/${categoryId}/rules/publish`,{expectedRevision:1,reason:'Reglamento del ejemplo terminado'});
      for(let index=0;index<scenario.teams;index++){
        const teamName=`${['Norte','Sur','Este','Oeste','Centro','Unión','Atlético','Deportivo'][index]} ${scenario.mode} Final`;
        const {rows:[oldTeam]}=await pool.query('SELECT e.id "entryId" FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE e.organization_id=$1 AND e.category_id=$2 AND t.name=$3',[seedIds.a,categoryId,teamName]);
        const team=oldTeam||await call('POST',`${root}/teams`,{requestId:randomUUID(),name:teamName,color:['#165D46','#245486','#9B3F2F','#8A6B25','#6A3D83','#9C5C24','#3C6974','#7D3348'][index],categoryId});
        if(!oldTeam)await call('POST',`${root}/entries/${team.entryId}/publication`,{publicVisible:true,reason:'Equipo ficticio visible'});
        const {rows:[oldPlayer]}=await pool.query('SELECT id FROM player_registrations WHERE organization_id=$1 AND entry_id=$2 LIMIT 1',[seedIds.a,team.entryId]);
        if(!oldPlayer){const player=await call('POST',`${root}/entries/${team.entryId}/players`,{givenNames:['Matías','Diego','Lucía','Bruno','Andrés','Nicolás','Elías','Samuel'][index],familyNames:['Acuña','Vera','Silva','Ríos','Ortiz','Sosa','Medina','Torres'][index],documentKind:null,documentNumber:null,birthDate:`200${index}-04-12`,registrationNumber:null,origin:{kind:'none'},details:{}});await call('POST',`${root}/registrations/${player.id}/publication`,{visible:true,reason:'Nombre ficticio visible'});}
      }
      const {rows:rosterRows}=await pool.query(`SELECT pr.entry_id,pr.id FROM player_registrations pr JOIN team_entries te ON te.organization_id=pr.organization_id AND te.id=pr.entry_id JOIN categories c ON c.organization_id=te.organization_id AND c.id=te.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id WHERE pr.organization_id=$1 AND ed.tournament_id=$2`,[seedIds.a,tournamentId]);
      const roster=new Map<string,string>(rosterRows.map(row=>[row.entry_id,row.id]));
      const {rows:[oldVenue]}=await pool.query('SELECT v.id FROM tournament_venues tv JOIN venues v ON v.organization_id=tv.organization_id AND v.id=tv.venue_id WHERE tv.organization_id=$1 AND tv.tournament_id=$2 LIMIT 1',[seedIds.a,tournamentId]);
      const venue=oldVenue||await call('POST',`${root}/tournaments/${tournamentId}/venues`,{name:'Polideportivo Municipal · Muestra',city:'Asunción'});
      let overview=await call('GET',`${root}/categories/${categoryId}/fixture`);
      if(!overview.phase){const phase=await call('POST',`${root}/categories/${categoryId}/fixture/phase`,{});await call('POST',`${root}/categories/${categoryId}/fixture/generate`,{expectedRevision:phase.revision});overview=await call('GET',`${root}/categories/${categoryId}/fixture`);}
      const initialOrder=new Map<string,number>();
      if(scenario.mode==='groups'){
        const groups=new Map<number,string[]>();for(const entry of overview.groups as Array<{group_no:number;entry_id:string}>){const list=groups.get(entry.group_no)||[];list.push(entry.entry_id);groups.set(entry.group_no,list);}
        for(const list of groups.values())list.forEach((id,index)=>initialOrder.set(id,index));
      }else if(scenario.mode==='league'){const {rows}=await pool.query('SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 ORDER BY id',[seedIds.a,categoryId]);rows.forEach((row,index)=>initialOrder.set(row.id,index));}
      async function record(match:Match,slot:Slot|undefined){
        const leg=match.fixture_leg||1;let home=0,away=0,shootout:{home:number;away:number}|null=null;
        if(!slot){const homeRank=initialOrder.get(match.home_entry_id)??0,awayRank=initialOrder.get(match.away_entry_id)??1;[home,away]=homeRank<awayRank?[2+Math.max(0,awayRank-homeRank-1),0]:[0,2+Math.max(0,homeRank-awayRank-1)];}
        else if(scenario.mode==='groups'){[home,away]=slot.stage===2?[1,1]:[2,1];if(slot.stage===2)shootout={home:4,away:3};}
        else if(scenario.mode==='knockout'){
          if(slot.stage===1&&slot.slot===1)[home,away]=leg===1?[2,0]:[1,0];
          else if(slot.stage===1)[home,away]=leg===1?[1,1]:[0,0];
          else [home,away]=[2,1];
          if(slot.stage===1&&slot.slot===2&&leg===2)shootout={home:4,away:3};
        }else{
          if(slot.stage===1&&slot.slot===1){[home,away]=leg===1?[1,0]:leg===2?[3,0]:[2,1];}
          else if(slot.stage===1){[home,away]=leg===1?[2,0]:[0,1];}
          else {[home,away]=leg===1?[1,0]:[3,0];if(leg===2)shootout={home:4,away:5};}
        }
        await call('POST',`${root}/matches/${match.id}/record/start`,{});
        for(const [entry,count] of [[match.home_entry_id,home],[match.away_entry_id,away]] as const)for(let n=0;n<count;n++)await call('POST',`${root}/matches/${match.id}/events`,{clientEventId:randomUUID(),kind:'goal',teamEntryId:entry,registrationId:roster.get(entry)||null,period:n%2?'ST':'PT',minute:null});
        if(shootout)for(const [entry,count] of [[match.home_entry_id,shootout.home],[match.away_entry_id,shootout.away]] as const)for(let n=0;n<5;n++)await call('POST',`${root}/matches/${match.id}/events`,{clientEventId:randomUUID(),kind:n<count?'shootout_goal':'shootout_miss',teamEntryId:entry,registrationId:roster.get(entry)||null,period:null,minute:null});
        await call('POST',`${root}/matches/${match.id}/acta/submit`,{reason:'Resultado ficticio'});
        await call('POST',`${root}/matches/${match.id}/acta/approve`,{reason:'Resultado ficticio confirmado',overrideSignoffs:true});
      }
      for(let attempts=0;attempts<15;attempts++){
        overview=await call('GET',`${root}/categories/${categoryId}/fixture`);
        const slots=overview.bracket as Slot[];
        const rounds=overview.rounds as Array<{ordinal:number;matches:Match[]}>;
        const ordinals=[...new Set(rounds.filter(round=>round.matches.some(match=>!match.matchday_id)).map(round=>round.ordinal))].sort((a,b)=>a-b);
        for(const ordinal of ordinals){
          const {rows:[oldDay]}=await pool.query('SELECT id FROM matchdays WHERE organization_id=$1 AND edition_id=$2 AND ordinal=$3',[seedIds.a,editionId,ordinal]);
          const day=oldDay||await call('POST',`${root}/editions/${editionId}/matchdays`,{ordinal});
          const matches=rounds.filter(round=>round.ordinal===ordinal).flatMap(round=>round.matches).filter(match=>!match.matchday_id);
          const date=new Date('2026-07-01T12:00:00Z');date.setUTCDate(date.getUTCDate()+ordinal*3);const matchDate=date.toISOString().slice(0,10);
          for(const [index,match] of matches.entries())await call('PATCH',`${root}/fixture/matches/${match.id}/schedule`,{matchdayId:day.id,venueId:venue.id,courtLabel:'Principal',date:matchDate,time:`${String(10+index*2).padStart(2,'0')}:00`,durationMinutes:60,refereeName:null,expectedRevision:0,reason:'Fecha de muestra'});
          const preview=await call('GET',`${root}/matchdays/${day.id}/preview`);if(preview.missing.length)throw new Error(preview.missing.join(' '));
          await call('POST',`${root}/matchdays/${day.id}/publish`,{expectedRevision:preview.revision,reason:'Fecha ficticia publicada'});
        }
        overview=await call('GET',`${root}/categories/${categoryId}/fixture`);
        const matches=(overview.rounds as Array<{matches:Match[]}>).flatMap(round=>round.matches);
        for(const match of matches){const {rows:[recordRow]}=await pool.query('SELECT approval_id FROM match_records WHERE organization_id=$1 AND match_id=$2',[seedIds.a,match.id]);if(recordRow?.approval_id)continue;const slot=(overview.bracket as Slot[]).find(item=>[item.match_id,item.return_match_id,item.decider_match_id].includes(match.id));await record(match,slot);}
        const progress=await call('POST',`${root}/categories/${categoryId}/fixture/advance`,{reason:'Avance del ejemplo terminado'});
        if(progress.status==='complete'){console.log(JSON.stringify({name:scenario.name,tournamentId,championEntryId:progress.championEntryId,url:`http://127.0.0.1:4311/#/publico/${tournamentId}`}));break;}
        if(progress.status!=='generated')throw new Error(`${scenario.name}: avance pendiente ${JSON.stringify(progress)}`);
        if(attempts===14)throw new Error(`${scenario.name}: demasiadas rondas`);
      }
    }
  }finally{await app.close();}
}finally{await pool.end();}
