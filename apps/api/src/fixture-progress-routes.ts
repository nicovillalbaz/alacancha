import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, transaction, type DatabasePool } from '@torneos/db';
import { knockoutBracket, ruleSchema } from '@torneos/shared';
import { categoryStatistics, withDocumentedTiebreaks } from './statistics.ts';
import { bestRemainingTie, qualifiedEntries, tieWinner, type ApprovedScore } from './fixture-progress.ts';

interface Slot { id:string;stage:number;slot:number;round_id:string;home_entry_id:string|null;away_entry_id:string|null;home_source_id:string|null;away_source_id:string|null;match_id:string|null;return_match_id:string|null;decider_match_id:string|null;match_home:string|null;match_away:string|null;first_snapshot:ApprovedScore|null;second_snapshot:ApprovedScore|null;third_snapshot:ApprovedScore|null }
const shuffle = <T>(items:T[]) => { const result=[...items];for(let i=result.length-1;i>0;i--){const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}return result; };

export function registerFixtureProgressRoutes(app:FastifyInstance,pool:DatabasePool,access:(request:FastifyRequest,organizationId:string,organizerOnly?:boolean)=>Promise<{user_id:string}>,fail:(status:number,code:string,message:string)=>never){
  app.post('/api/v1/organizations/:id/categories/:categoryId/fixture/advance',async(request)=>{
    const {id,categoryId}=request.params as {id:string;categoryId:string};
    const organizationId=z.uuid().parse(id),category=z.uuid().parse(categoryId),actor=await access(request,organizationId,true);
    const input=z.object({reason:z.string().trim().min(3).max(300),manualOrder:z.array(z.uuid()).min(2).max(256).optional(),sourceKey:z.string().regex(/^[0-9a-f]{64}$/).optional()}).strict().parse(request.body);
    return transaction(pool,async(client)=>{
      const {rows:[phase]}=await client.query("SELECT * FROM fixture_phases WHERE organization_id=$1 AND category_id=$2 AND status='generated' FOR UPDATE",[organizationId,category]);
      if(!phase)fail(409,'FIXTURE_REQUIRED','Generá primero la fase de esta categoría.');
      const {rows:[version]}=await client.query('SELECT rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=$3',[organizationId,category,phase.rule_version]);
      const parsed=ruleSchema.safeParse(version?.rules);if(!parsed.success)fail(409,'RULES_INCOMPLETE','El reglamento de esta fase necesita revisión.');
      const plan=parsed.data.competitionPlan;
      if(phase.mode!=='knockout'&&!plan)fail(409,'BRACKET_NOT_PLANNED','El reglamento no planifica un cuadro después de la fase inicial.');
      let {rows:slots}=await client.query<Slot>(`SELECT s.*,m.home_entry_id match_home,m.away_entry_id match_away,a.snapshot first_snapshot,b.snapshot second_snapshot,c.snapshot third_snapshot
        FROM fixture_bracket_slots s LEFT JOIN draft_matches m ON m.organization_id=s.organization_id AND m.id=s.match_id
        LEFT JOIN match_records r ON r.organization_id=s.organization_id AND r.match_id=s.match_id
        LEFT JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved'
        LEFT JOIN match_records rr ON rr.organization_id=s.organization_id AND rr.match_id=s.return_match_id
        LEFT JOIN match_acta_snapshots b ON b.organization_id=rr.organization_id AND b.id=rr.approval_id AND b.kind='approved'
        LEFT JOIN match_records rrr ON rrr.organization_id=s.organization_id AND rrr.match_id=s.decider_match_id
        LEFT JOIN match_acta_snapshots c ON c.organization_id=rrr.organization_id AND c.id=rrr.approval_id AND c.kind='approved'
        WHERE s.organization_id=$1 AND s.phase_id=$2 ORDER BY s.stage,s.slot`,[organizationId,phase.id]);
      const firstStage=async()=>{
        const qualification=plan?.qualification;
        if(!qualification||qualification.from==='direct')fail(409,'BRACKET_NOT_PLANNED','No hay clasificación desde esta fase.');
        const {rows:[count]}=await client.query(`SELECT count(*)::int total,count(r.approval_id)::int official
          FROM draft_matches m LEFT JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id
          WHERE m.organization_id=$1 AND m.fixture_phase_id=$2 AND m.competition_stage='initial'`,[organizationId,phase.id]);
        if(!count.total||count.total!==count.official)fail(409,'MATCHES_PENDING','Esperá las actas oficiales de todos los partidos de la fase inicial.');
        const projection=await categoryStatistics(client as unknown as DatabasePool,organizationId,category);
        if(!projection)fail(409,'STANDINGS_PENDING','No se pudo calcular la clasificación oficial.');
        const documented=await withDocumentedTiebreaks(client as unknown as DatabasePool,organizationId,projection);
        const criteria=parsed.data.advanced?.tiebreakers||[];
        const tie=qualification.from==='groups'?bestRemainingTie(documented,qualification,criteria):[];
        if(input.manualOrder && (!tie.length||input.sourceKey!==projection.sourceKey))fail(409,'QUALIFICATION_CHANGED','La tabla o el empate cambió. Volvé a revisar los clasificados.');
        const selected=qualifiedEntries(documented,qualification,criteria,input.manualOrder);
        if(!selected){
          if(tie.length&&criteria.includes('manual_draw'))return {status:'tie',sourceKey:projection.sourceKey,candidates:tie.map(entryId=>({entryId,name:projection.entries.find(entry=>entry.id===entryId)?.name||'Equipo'})),message:'Elegí el orden de los equipos empatados en el corte y documentá el motivo.'};
          fail(409,'QUALIFICATION_TIE','La clasificación o el corte de mejores restantes necesita un desempate documentado.');
        }
        const ordered=plan.rounds[0].pairing==='draw'?shuffle(selected):selected;
        const bracket=knockoutBracket(ordered,plan.bracketSize).filter((item)=>item.stage===1);
        const {rows:[max]}=await client.query('SELECT coalesce(max(ordinal),0)::int ordinal FROM fixture_rounds WHERE organization_id=$1 AND phase_id=$2',[organizationId,phase.id]);
        const homeRound=randomUUID(),backRound=plan.rounds[0].legs===2?randomUUID():null;
        await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,1,1)',[homeRound,organizationId,phase.id,max.ordinal+1]);
        if(backRound)await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,2,1)',[backRound,organizationId,phase.id,max.ordinal+2]);
        let created=0;
        for(const item of bracket){
          const slotId=randomUUID();let matchId:string|null=null,returnMatchId:string|null=null;
          if(item.homeEntryId&&item.awayEntryId){matchId=await addMatch(homeRound,1,item.homeEntryId,item.awayEntryId);if(backRound)returnMatchId=await addMatch(backRound,2,item.awayEntryId,item.homeEntryId);created++;}
          else await client.query('INSERT INTO fixture_byes(organization_id,round_id,entry_id) VALUES($1,$2,$3)',[organizationId,homeRound,item.homeEntryId||item.awayEntryId]);
          await client.query(`INSERT INTO fixture_bracket_slots(id,organization_id,phase_id,round_id,stage,slot,home_entry_id,away_entry_id,match_id,return_match_id)
            VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9)`,[slotId,organizationId,phase.id,homeRound,item.slot,item.homeEntryId,item.awayEntryId,matchId,returnMatchId]);
        }
        await client.query('UPDATE fixture_phases SET revision=revision+1 WHERE id=$1',[phase.id]);
        await audit(client,actor.user_id,organizationId,'fixture.qualification_generated',phase.id,input.reason,null,{categoryId:category,sourceKey:projection.sourceKey,ordered,manualOrder:input.manualOrder||null,bracketSize:plan.bracketSize,matches:created});
        return {status:'generated',stage:1,matches:created,qualified:ordered.length};
      };
      const addMatch=async(roundId:string,leg:1|2|3,home:string,away:string)=>{
        const matchId=randomUUID();
        await client.query(`INSERT INTO draft_matches(id,organization_id,category_id,home_entry_id,away_entry_id,match_date,created_by,fixture_phase_id,fixture_round_id,fixture_leg,competition_stage)
          VALUES($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,'knockout')`,[matchId,organizationId,category,home,away,actor.user_id,phase.id,roundId,leg]);
        return matchId;
      };
      if(!slots.length)return firstStage();
      const winners=new Map<string,string>();
      const stages=[...new Set(slots.map((slot)=>slot.stage))].sort((a,b)=>a-b);
      for(const stage of stages){
        const current=slots.filter((slot)=>slot.stage===stage);
        const ready:Array<{slot:Slot;home:string;away:string}>=[];
        const deciders:Array<{slot:Slot;home:string;away:string}>=[];
        let pending=false;
        for(const slot of current){
          const home=slot.home_entry_id||winners.get(slot.home_source_id||'')||null;
          const away=slot.away_entry_id||winners.get(slot.away_source_id||'')||null;
          if(slot.match_id){
            if(home&&away&&(slot.match_home!==home||slot.match_away!==away))fail(409,'BRACKET_SOURCE_CHANGED','Una rectificación cambió un clasificado. Revisá el cuadro antes de continuar.');
            const resolution=plan?.rounds[stage-1]?.resolution||'aggregate';
            const winner=home&&away?tieWinner(home,away,slot.first_snapshot,slot.return_match_id?slot.second_snapshot:undefined,resolution,slot.decider_match_id?slot.third_snapshot:undefined,parsed.data.points):null;
            if(winner)winners.set(slot.id,winner);
            else if(home&&away&&resolution==='match_points_third'&&slot.first_snapshot&&slot.second_snapshot&&!slot.decider_match_id)deciders.push({slot,home,away});
            else pending=true;
          }else if(home&&away)ready.push({slot,home,away});
          else if(home||away)winners.set(slot.id,(home||away)!);
          else pending=true;
        }
        if(deciders.length){
          const {rows:[max]}=await client.query('SELECT coalesce(max(ordinal),0)::int ordinal FROM fixture_rounds WHERE organization_id=$1 AND phase_id=$2',[organizationId,phase.id]);
          const roundId=randomUUID();
          await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,3,1)',[roundId,organizationId,phase.id,max.ordinal+1]);
          for(const item of deciders){const matchId=await addMatch(roundId,3,item.home,item.away);await client.query('UPDATE fixture_bracket_slots SET decider_match_id=$2 WHERE organization_id=$1 AND id=$3',[organizationId,matchId,item.slot.id]);}
          await client.query('UPDATE fixture_phases SET revision=revision+1 WHERE id=$1',[phase.id]);
          await audit(client,actor.user_id,organizationId,'fixture.third_match_generated',phase.id,input.reason,null,{stage,matches:deciders.map(item=>item.slot.id)});
          return {status:'generated',stage,matches:deciders.length,decider:true};
        }
        if(pending)return {status:'pending',stage,message:'Faltan actas oficiales o una tanda decisiva para continuar.'};
        if(ready.length){
          const legs=plan?.rounds[stage-1]?.legs??phase.legs;
          const {rows:[round]}=await client.query('SELECT ordinal FROM fixture_rounds WHERE organization_id=$1 AND id=$2',[organizationId,current[0].round_id]);
          let backRound:string|null=null;
          if(legs===2){const {rows:[existing]}=await client.query('SELECT id FROM fixture_rounds WHERE organization_id=$1 AND phase_id=$2 AND ordinal=$3 AND leg=2',[organizationId,phase.id,round.ordinal+1]);backRound=existing?.id||randomUUID();if(!existing)await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,2,1)',[backRound,organizationId,phase.id,round.ordinal+1]);}
          for(const item of ready){const matchId=await addMatch(item.slot.round_id,1,item.home,item.away);const returnMatchId=backRound?await addMatch(backRound,2,item.away,item.home):null;await client.query('UPDATE fixture_bracket_slots SET match_id=$2,return_match_id=$3 WHERE id=$1',[item.slot.id,matchId,returnMatchId]);}
          await client.query('UPDATE fixture_phases SET revision=revision+1 WHERE id=$1',[phase.id]);
          await audit(client,actor.user_id,organizationId,'fixture.round_advanced',phase.id,input.reason,null,{stage,matches:ready.length,sourceSlots:ready.map((item)=>[item.slot.home_source_id,item.slot.away_source_id])});
          return {status:'generated',stage,matches:ready.length};
        }
      }
      const last=stages.at(-1)!;
      const target=last+1,maxStage=plan?.rounds.length??Math.log2(slots.filter((slot)=>slot.stage===1).length*2);
      if(target>maxStage)return {status:'complete',championEntryId:winners.get(slots.find((slot)=>slot.stage===last)!.id)||null};
      const previous=slots.filter((slot)=>slot.stage===last),draw=plan?.rounds[target-1]?.pairing==='draw',sources=draw?shuffle(previous):previous;
      const {rows:[max]}=await client.query('SELECT coalesce(max(ordinal),0)::int ordinal FROM fixture_rounds WHERE organization_id=$1 AND phase_id=$2',[organizationId,phase.id]);
      const legs=plan?.rounds[target-1]?.legs??phase.legs,homeRound=randomUUID(),backRound=legs===2?randomUUID():null;
      await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,1,1)',[homeRound,organizationId,phase.id,max.ordinal+1]);
      if(backRound)await client.query('INSERT INTO fixture_rounds(id,organization_id,phase_id,ordinal,leg,group_no) VALUES($1,$2,$3,$4,2,1)',[backRound,organizationId,phase.id,max.ordinal+2]);
      let made=0;
      for(let index=0;index<sources.length/2;index++){
        const homeSource=draw?sources[index*2]:sources[index],awaySource=draw?sources[index*2+1]:sources[sources.length-1-index],home=winners.get(homeSource.id),away=winners.get(awaySource.id);
        if(!home||!away)fail(409,'WINNERS_PENDING','Hay ganadores pendientes en la ronda anterior.');
        const matchId=await addMatch(homeRound,1,home,away),returnMatchId=backRound?await addMatch(backRound,2,away,home):null;
        await client.query(`INSERT INTO fixture_bracket_slots(id,organization_id,phase_id,round_id,stage,slot,home_source_id,away_source_id,match_id,return_match_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),organizationId,phase.id,homeRound,target,index+1,homeSource.id,awaySource.id,matchId,returnMatchId]);made++;
      }
      await client.query('UPDATE fixture_phases SET revision=revision+1 WHERE id=$1',[phase.id]);
      await audit(client,actor.user_id,organizationId,plan?.rounds[target-1]?.pairing==='draw'?'fixture.round_drawn':'fixture.round_advanced',phase.id,input.reason,null,{stage:target,matches:made,sourceSlots:sources.map((slot)=>slot.id)});
      return {status:'generated',stage:target,matches:made};
    });
  });
}
