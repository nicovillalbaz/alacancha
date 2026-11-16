import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, transaction, type DatabasePool } from '@torneos/db';

const matchSchema=z.object({homeEntryId:z.uuid(),awayEntryId:z.uuid()}).strict();
const roundSchema=z.object({ordinal:z.number().int().min(1).max(128),matches:z.array(matchSchema).min(1).max(128)}).strict();
const planSchema=z.object({expectedRevision:z.number().int().nonnegative(),rounds:z.array(roundSchema).min(1).max(127),qualificationCount:z.number().int().min(2).max(128),semifinalPairing:z.enum(['pending','in_person_draw','bracket']).default('pending'),reason:z.string().trim().min(3).max(300)}).strict();

export function validateRoundRobin(rounds:z.infer<typeof roundSchema>[],entryIds:string[],qualificationCount:number,fail:(status:number,code:string,message:string)=>never){
  const count=entryIds.length;
  if(count!==10||rounds.length!==9||qualificationCount!==8)
    fail(409,'FIXTURE_FORMAT','El calendario requiere 10 equipos, nueve jornadas y ocho clasificados.');
  const valid=new Set(entryIds),pairs=new Set<string>();
  for(let index=0;index<rounds.length;index++){
    const round=rounds[index];
    if(round.ordinal!==index+1||round.matches.length!==count/2)fail(400,'FIXTURE_ROUND','Cada jornada debe tener exactamente cinco partidos, en orden.');
    const seen=new Set<string>();
    for(const match of round.matches){
      const {homeEntryId:home,awayEntryId:away}=match;
      if(!valid.has(home)||!valid.has(away)||home===away||seen.has(home)||seen.has(away))fail(400,'FIXTURE_TEAMS','Un equipo falta, se repite o no pertenece a la categoría.');
      seen.add(home);seen.add(away);
      const pair=[home,away].sort().join(':');
      if(pairs.has(pair))fail(400,'FIXTURE_PAIR','Hay un cruce repetido.');
      pairs.add(pair);
    }
  }
  if(pairs.size!==count*(count-1)/2)fail(400,'FIXTURE_INCOMPLETE','Faltan cruces de la rueda única.');
}

export function registerUndatedFixtureRoutes(app:FastifyInstance,pool:DatabasePool,access:(request:FastifyRequest,organizationId:string,organizerOnly?:boolean)=>Promise<{user_id:string}>,fail:(status:number,code:string,message:string)=>never){
  app.get('/api/v1/organizations/:id/categories/:categoryId/fixture/announced',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};const organizationId=z.uuid().parse(id),category=z.uuid().parse(categoryId);
    await access(request,organizationId);
    const {rows:[plan]}=await pool.query('SELECT id,revision,rounds,qualification_count,semifinal_pairing FROM undated_fixture_plans WHERE organization_id=$1 AND category_id=$2',[organizationId,category]);
    if(!plan)fail(404,'FIXTURE_NOT_FOUND','No hay calendario anunciado.');
    return plan;
  });
  app.put('/api/v1/organizations/:id/categories/:categoryId/fixture/announced',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};const organizationId=z.uuid().parse(id),category=z.uuid().parse(categoryId),actor=await access(request,organizationId,true);
    const input=planSchema.parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[categoryRow]}=await client.query(`SELECT c.id,t.public_preview_at FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id JOIN tournaments t ON t.organization_id=e.organization_id AND t.id=e.tournament_id WHERE c.organization_id=$1 AND c.id=$2 FOR UPDATE OF c`,[organizationId,category]);
      if(!categoryRow)fail(404,'CATEGORY_NOT_FOUND','No se encontró la categoría.');
      const {rows:entries}=await client.query("SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active' AND public_visible ORDER BY id",[organizationId,category]);
      validateRoundRobin(input.rounds,entries.map(row=>row.id),input.qualificationCount,fail);
      const {rows:[existing]}=await client.query('SELECT id,revision FROM undated_fixture_plans WHERE organization_id=$1 AND category_id=$2 FOR UPDATE',[organizationId,category]);
      if((existing?.revision||0)!==input.expectedRevision)fail(409,'REVISION_CONFLICT','El calendario cambió. Actualizá antes de guardar.');
      const planId=existing?.id||randomUUID(),revision=input.expectedRevision+1;
      if(existing)await client.query('UPDATE undated_fixture_plans SET revision=$3,rounds=$4,qualification_count=$5,semifinal_pairing=$6,updated_at=now() WHERE organization_id=$1 AND id=$2',[organizationId,planId,revision,JSON.stringify(input.rounds),input.qualificationCount,input.semifinalPairing]);
      else await client.query('INSERT INTO undated_fixture_plans(id,organization_id,category_id,revision,rounds,qualification_count,semifinal_pairing,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[planId,organizationId,category,revision,JSON.stringify(input.rounds),input.qualificationCount,input.semifinalPairing,actor.user_id]);
      await audit(client,actor.user_id,organizationId,'fixture.announced_saved',planId,input.reason,null,{categoryId:category,revision,matches:input.rounds.reduce((sum,round)=>sum+round.matches.length,0)});
      return {id:planId,revision};
    });
  });
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/announced/publish',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};const organizationId=z.uuid().parse(id),category=z.uuid().parse(categoryId),actor=await access(request,organizationId,true);
    const input=z.object({expectedRevision:z.number().int().positive(),reason:z.string().trim().min(3).max(300)}).strict().parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[plan]}=await client.query(`SELECT p.*,t.public_preview_at,t.status tournament_status FROM undated_fixture_plans p JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id JOIN tournaments t ON t.organization_id=e.organization_id AND t.id=e.tournament_id WHERE p.organization_id=$1 AND p.category_id=$2 FOR UPDATE OF p`,[organizationId,category]);
      if(!plan)fail(404,'FIXTURE_NOT_FOUND','No hay calendario anunciado.');
      if(plan.revision!==input.expectedRevision)fail(409,'REVISION_CONFLICT','El calendario cambió. Actualizá antes de publicar.');
      if(!plan.public_preview_at&&plan.tournament_status!=='published')fail(409,'TOURNAMENT_PRIVATE','Primero hacé visible la presentación del torneo.');
      const {rows:entries}=await client.query("SELECT id FROM team_entries WHERE organization_id=$1 AND category_id=$2 AND status='active' AND public_visible ORDER BY id",[organizationId,category]);
      validateRoundRobin(plan.rounds,entries.map(row=>row.id),plan.qualification_count,fail);
      const {rows:[prior]}=await client.query('SELECT id FROM undated_fixture_publications WHERE organization_id=$1 AND plan_id=$2 AND revision=$3',[organizationId,plan.id,plan.revision]);
      if(prior)return {id:prior.id,revision:plan.revision,alreadyPublished:true};
      const snapshot={rounds:plan.rounds,qualificationCount:plan.qualification_count,quarterPairing:plan.quarter_pairing,semifinalPairing:plan.semifinal_pairing,finalPairing:plan.final_pairing};
      const publicationId=randomUUID();
      await client.query('INSERT INTO undated_fixture_publications(id,organization_id,plan_id,revision,snapshot,published_by) VALUES($1,$2,$3,$4,$5,$6)',[publicationId,organizationId,plan.id,plan.revision,JSON.stringify(snapshot),actor.user_id]);
      await audit(client,actor.user_id,organizationId,'fixture.announced_published',plan.id,input.reason,null,{categoryId:category,revision:plan.revision,publicationId});
      return {id:publicationId,revision:plan.revision};
    });
  });
  app.get('/api/v1/public/organizations/:id/categories/:categoryId/fixture/announced',async request=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};const organizationId=z.uuid().parse(id),category=z.uuid().parse(categoryId);
    const {rows:[row]}=await pool.query(`SELECT p.revision,p.snapshot FROM undated_fixture_publications p JOIN undated_fixture_plans f ON f.organization_id=p.organization_id AND f.id=p.plan_id JOIN categories c ON c.organization_id=f.organization_id AND c.id=f.category_id JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id JOIN tournaments t ON t.organization_id=e.organization_id AND t.id=e.tournament_id JOIN organizations o ON o.id=t.organization_id AND o.status='active' WHERE p.organization_id=$1 AND f.category_id=$2 AND (t.public_preview_at IS NOT NULL OR t.status='published') ORDER BY p.revision DESC LIMIT 1`,[organizationId,category]);
    if(!row)fail(404,'FIXTURE_NOT_PUBLIC','No hay calendario anunciado públicamente.');
    const {rows:teams}=await pool.query(`SELECT e.id entry_id,t.id team_id,t.name,t.color,(t.shield_id IS NOT NULL) has_shield FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE e.organization_id=$1 AND e.category_id=$2 AND e.status='active' AND e.public_visible`,[organizationId,category]);
    return {revision:row.revision,...row.snapshot,teams};
  });
}
