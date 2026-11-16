import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { createPool } from '@torneos/db';
import { ruleSchema } from '@torneos/shared';
import { csrfFor, digest, opaqueToken } from '../apps/api/src/security.ts';

const config=readConfig(),target=process.env.FSBFS_RULES_TARGET;
const database=new URL(config.databaseUrl);
const expectedDatabase=target==='production'?'/torneos_prod':'/torneos_sanber_rules_rehearsal';
if(process.env.NODE_ENV!=='production'||!['production','rehearsal'].includes(target||'')||database.hostname!=='127.0.0.1'||database.pathname!==expectedDatabase||config.origin!=='https://alacancha.top')throw new Error('Destino de reglamento Sanber no autorizado.');

const organizationId='7a8be048-ffce-4e14-9213-cb0d902e326d';
const categoryId='198ee7f1-a932-4fce-9165-33dd23d89ed8';
const tournamentId='5edc2433-5833-4eb4-9c6b-53971f6454aa';
const pool=createPool(config.databaseUrl),app=await buildApp(config,pool);
let sessionId='';
try{
  const {rows:[state]}=await pool.query(`SELECT t.name,t.status tournament_status,e.status edition_status,c.status category_status,c.team_limit,
    (SELECT count(*)::int FROM team_entries te WHERE te.organization_id=c.organization_id AND te.category_id=c.id AND te.status='active' AND te.public_visible) team_count,
    (SELECT count(*)::int FROM draft_matches m WHERE m.organization_id=c.organization_id AND m.category_id=c.id) official_drafts
    FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id
    JOIN tournaments t ON t.organization_id=e.organization_id AND t.id=e.tournament_id
    WHERE c.organization_id=$1 AND c.id=$2 AND t.id=$3`,[organizationId,categoryId,tournamentId]);
  if(!state||state.name!=='Copa Sanber'||state.tournament_status!=='draft'||state.edition_status!=='draft'||state.category_status!=='draft'||state.team_limit!==10||state.team_count!==10||state.official_drafts!==0)throw new Error('El estado de Copa Sanber cambió; no se publicó el reglamento.');

  const {rows:[rule]}=await pool.query('SELECT version,revision,status,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,categoryId]);
  if(!rule||rule.version!==1||rule.revision!==2||rule.status!=='draft'||rule.rules.initialPhase!==null||rule.rules.competitionPlan!==null)throw new Error('El borrador de Sanber cambió; revisión manual requerida.');
  const original=ruleSchema.parse(rule.rules);
  if(original.points.win!==2||original.points.draw!==1||original.points.loss!==0||original.periods.length!==2||original.periods.some(period=>period.minutes!==20)||original.advanced?.discipline.customCards?.filter(card=>card.code==='azul'&&card.label==='Azul'&&card.color==='#2278C7').length!==1)throw new Error('Los puntos, tiempos o tarjeta Azul no coinciden con lo confirmado.');
  const updated=ruleSchema.parse({...original,
    initialPhase:{mode:'league',legs:1,groupCount:null},
    competitionPlan:{qualification:{from:'league',top:8},bracketSize:8,rounds:[
      {size:8,pairing:'draw',legs:1},
      {size:4,pairing:'draw',legs:1},
      {size:2,pairing:'positions',legs:1},
    ]},
  });

  const {rows:organizers}=await pool.query(`SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id AND m.organization_id=$1
    WHERE lower(u.username)='usuariofsbfs' AND u.disabled_at IS NULL AND m.role='tournament_admin' AND m.status='active'`,[organizationId]);
  if(organizers.length!==1)throw new Error('No hay exactamente un organizador activo de Sanber.');
  const token=opaqueToken();sessionId=randomUUID();
  await pool.query("INSERT INTO sessions(id,user_id,token_hash,organization_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')",[sessionId,organizers[0].id,digest(token),organizationId]);
  const headers={cookie:`torneos_session=${token}`,'x-csrf-token':csrfFor(config.appSecret,token)};
  const base=`/api/v1/organizations/${organizationId}/categories/${categoryId}`;
  const forbidden=await app.inject({method:'POST',url:`/api/v1/organizations/85b89c2d-d78a-4a23-81e3-ce0ba9272c40/categories/${categoryId}/rules/draft`,headers,payload:{rules:updated,expectedRevision:2,reason:'Control de alcance entre organizaciones'}});
  if(forbidden.statusCode!==403)throw new Error(`La escritura entre organizaciones no se denegó: ${forbidden.statusCode}`);

  const plan=await app.inject({method:'GET',url:`${base}/fixture/announced`,headers});
  if(plan.statusCode!==200)throw new Error(`No se pudo leer el calendario anunciado: ${plan.statusCode}`);
  const existingPlan=plan.json();
  if(existingPlan.revision!==1||existingPlan.rounds.length!==9||existingPlan.rounds.reduce((sum:number,round:{matches:unknown[]})=>sum+round.matches.length,0)!==45||existingPlan.qualification_count!==8||existingPlan.semifinal_pairing!=='pending')throw new Error('El calendario anunciado cambió; no se reemplazó.');
  const savedPlan=await app.inject({method:'PUT',url:`${base}/fixture/announced`,headers,payload:{expectedRevision:existingPlan.revision,rounds:existingPlan.rounds,qualificationCount:8,semifinalPairing:'in_person_draw',reason:'Semifinales por sorteo presencial confirmadas por el propietario'}});
  if(savedPlan.statusCode!==200)throw new Error(`No se pudo guardar el sorteo de semifinales: ${savedPlan.statusCode} ${savedPlan.body}`);
  const publicPlan=await app.inject({method:'POST',url:`${base}/fixture/announced/publish`,headers,payload:{expectedRevision:savedPlan.json().revision,reason:'Confirmar sorteo presencial de semifinales sin cambiar cruces ni fechas'}});
  if(publicPlan.statusCode!==200)throw new Error(`No se pudo publicar la revisión del calendario: ${publicPlan.statusCode} ${publicPlan.body}`);

  const savedRule=await app.inject({method:'POST',url:`${base}/rules/draft`,headers,payload:{rules:updated,expectedRevision:rule.revision,reason:'Una rueda, ocho clasificados, sorteo presencial en cuartos y semifinales, final entre ganadores'}});
  if(savedRule.statusCode!==200)throw new Error(`No se pudo guardar el reglamento: ${savedRule.statusCode} ${savedRule.body}`);
  const published=await app.inject({method:'POST',url:`${base}/rules/publish`,headers,payload:{expectedRevision:savedRule.json().revision,reason:'Reglamento Copa Sanber confirmado por el propietario: 2/1/0, dos tiempos de 20 minutos y sorteos presenciales'}});
  if(published.statusCode!==200)throw new Error(`No se pudo publicar el reglamento: ${published.statusCode} ${published.body}`);

  const publicResult=await app.inject({method:'GET',url:`/api/v1/public/organizations/${organizationId}/categories/${categoryId}/fixture/announced`});
  if(publicResult.statusCode!==200||publicResult.json().revision!==2||publicResult.json().semifinalPairing!=='in_person_draw'||publicResult.json().rounds.length!==9||publicResult.json().teams.length!==10)throw new Error('El calendario público ya no coincide con el confirmado.');
  const catalog=await app.inject({method:'GET',url:`/api/v1/public/organizations/${organizationId}/tournaments`});
  const publicCup=catalog.statusCode===200?catalog.json().tournaments.find((item:{id:string})=>item.id===tournamentId):null;
  if(!publicCup||publicCup.status!=='published'||publicCup.rule_status!=='published'||publicCup.rules?.advanced?.discipline?.customCards?.find((card:{code:string})=>card.code==='azul')===undefined)throw new Error('El catálogo público no muestra el reglamento y Azul publicados.');
  const payments=await app.inject({method:'GET',url:`/api/v1/organizations/${organizationId}/tournaments/${tournamentId}/payments`,headers});
  if(payments.statusCode!==200||!payments.json().cards.some((card:{key:string})=>card.key===`${categoryId}:azul`))throw new Error('La tarjeta Azul no aparece en Pagos.');
  const {rows:[finalState]}=await pool.query(`SELECT (SELECT count(*)::int FROM draft_matches WHERE organization_id=$1 AND category_id=$2) official_drafts,
    (SELECT count(*)::int FROM match_records r JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id WHERE r.organization_id=$1 AND m.category_id=$2) records`,[organizationId,categoryId]);
  if(finalState.official_drafts!==0||finalState.records!==0)throw new Error('La publicación creó partidos o actas inesperados.');
  console.log(JSON.stringify({target,ruleVersion:published.json().version,ruleRevision:published.json().revision,fixtureRevision:publicResult.json().revision,teams:10,announcedMatches:45,officialMatches:0,blueCard:true,url:'https://alacancha.top/copa-sanber'}));
}finally{
  if(sessionId)await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[sessionId]);
  await app.close();await pool.end();
}
