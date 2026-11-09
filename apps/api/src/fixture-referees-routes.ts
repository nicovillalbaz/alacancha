import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, transaction, type DatabasePool } from '@torneos/db';

export function registerFixtureRefereeRoutes(app: FastifyInstance, pool: DatabasePool, access: (request: FastifyRequest, organizationId: string, organizerOnly?: boolean) => Promise<{user_id:string}>, fail: (status:number,code:string,message:string)=>never) {
  const base = '/api/v1/organizations/:id/fixture/referees';
  app.get(base, async (request) => {
    const organizationId=z.uuid().parse((request.params as {id:string}).id);
    await access(request,organizationId,true);
    const {rows}=await pool.query('SELECT id,name,archived_at FROM fixture_referees WHERE organization_id=$1 ORDER BY archived_at NULLS FIRST,lower(name),id',[organizationId]);
    return rows;
  });
  app.post(base, async (request,reply) => {
    const organizationId=z.uuid().parse((request.params as {id:string}).id),actor=await access(request,organizationId,true);
    const {name}=z.object({name:z.string().trim().min(2).max(120)}).strict().parse(request.body);
    const result=await transaction(pool,async(client)=>{
      const {rows:[existing]}=await client.query('SELECT id,name,archived_at FROM fixture_referees WHERE organization_id=$1 AND lower(trim(name))=lower(trim($2)) FOR UPDATE',[organizationId,name]);
      if(existing && !existing.archived_at)return {...existing,reused:true};
      const id=existing?.id||randomUUID();
      if(existing)await client.query('UPDATE fixture_referees SET name=$3,archived_at=NULL WHERE organization_id=$1 AND id=$2',[organizationId,id,name]);
      else await client.query('INSERT INTO fixture_referees(id,organization_id,name,created_by) VALUES($1,$2,$3,$4)',[id,organizationId,name,actor.user_id]);
      await audit(client,actor.user_id,organizationId,existing?'fixture.referee_reactivated':'fixture.referee_created',id,'Catálogo de árbitros del organizador',null,{name});
      return {id,name,archived_at:null,reused:false};
    });
    return reply.code(result.reused?200:201).send(result);
  });
  app.post(`${base}/:refereeId/archive`,async(request)=>{
    const {id,refereeId}=request.params as {id:string;refereeId:string};
    const organizationId=z.uuid().parse(id),referee=z.uuid().parse(refereeId),actor=await access(request,organizationId,true);
    const {reason}=z.object({reason:z.string().trim().min(3).max(300)}).strict().parse(request.body);
    return transaction(pool,async(client)=>{
      const {rows:[found]}=await client.query('SELECT id,name,archived_at FROM fixture_referees WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,referee]);
      if(!found)fail(404,'REFEREE_NOT_FOUND','No se encontró el árbitro en esta organización.');
      if(!found.archived_at){await client.query('UPDATE fixture_referees SET archived_at=now() WHERE organization_id=$1 AND id=$2',[organizationId,referee]);await audit(client,actor.user_id,organizationId,'fixture.referee_archived',referee,reason,{name:found.name},{archived:true});}
      return {id:referee,archived:true};
    });
  });
}
