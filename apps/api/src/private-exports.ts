import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { audit, transaction, type DatabasePool } from '@torneos/db';
import { projectMatchJournal, type MatchJournalEvent } from '@torneos/shared';
import { sportsReportCsv, sportsReportPdf, type SportsReport } from './sports-report.ts';

type Access = (request:FastifyRequest, organizationId:string, entryId:string)=>Promise<{user_id:string}>;
type Reject = (status:number,code:string,message:string)=>never;
type Player = {givenNames:string;familyNames:string;registrationNumber:string};

export function registerPrivateExports(app:FastifyInstance,pool:DatabasePool,teamAccess:Access,fail:Reject,uuid:(value:unknown)=>string){
  app.get('/api/v1/organizations/:id/entries/:entryId/exports/:kind/:resourceId/:version/:format',async(request,reply)=>{
    const params=request.params as {id:string;entryId:string;kind:string;resourceId:string;version:string;format:string};
    const organizationId=uuid(params.id),entry=uuid(params.entryId);
    const kind=z.enum(['good-faith','lineup','acta','discipline']).parse(params.kind);
    const format=z.enum(['pdf','csv']).parse(params.format);
    const actor=await teamAccess(request,organizationId,entry);
    const now=new Date().toISOString();
    const {rows:[scope]}=await pool.query(`SELECT t.name team_name,c.name category_name,ed.name edition_name,tr.name tournament_name
      FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
      JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      JOIN tournaments tr ON tr.organization_id=ed.organization_id AND tr.id=ed.tournament_id
      WHERE e.organization_id=$1 AND e.id=$2`,[organizationId,entry]);
    if(!scope)fail(404,'ENTRY_NOT_FOUND','No se encontró esta participación.');
    let report:SportsReport;
    const base={scope:`${scope.tournament_name} · ${scope.edition_name} · ${scope.category_name} · ${scope.team_name}`,generatedAt:now};
    if(kind==='good-faith'){
      if(params.resourceId!=='list')fail(400,'INVALID_EXPORT','La referencia de lista no es válida.');
      const version=z.coerce.number().int().positive().parse(params.version);
      const {rows:[row]}=await pool.query("SELECT snapshot,reviewed_at FROM good_faith_versions WHERE organization_id=$1 AND entry_id=$2 AND version=$3 AND status='approved'",[organizationId,entry,version]);
      if(!row)fail(404,'EXPORT_NOT_FOUND','Solo se exporta una lista aprobada.');
      report={...base,title:'Lista de buena fe aprobada',version:String(version),sourceDate:row.reviewed_at.toISOString(),columns:['Apellidos','Nombres','Ficha','Procedencia'],rows:(row.snapshot as Array<Player & {originKind:string;originTeamName?:string|null}>).map(p=>[p.familyNames,p.givenNames,p.registrationNumber,p.originTeamName||p.originKind])};
    }else if(kind==='lineup'){
      const match=uuid(params.resourceId),version=z.coerce.number().int().positive().parse(params.version);
      const {rows:[row]}=await pool.query(`SELECT l.snapshot,l.reviewed_at,to_char(m.match_date,'YYYY-MM-DD') match_date
        FROM lineup_versions l JOIN draft_matches m ON m.organization_id=l.organization_id AND m.id=l.match_id
        WHERE l.organization_id=$1 AND l.entry_id=$2 AND l.match_id=$3 AND l.version=$4 AND l.status='approved'`,[organizationId,entry,match,version]);
      if(!row)fail(404,'EXPORT_NOT_FOUND','Solo se exporta una planilla aprobada de este equipo.');
      const selected=row.snapshot as {players:Array<{registrationId:string;shirtNumber:number|null}>;staffIds:string[]};
      const ids=selected.players.map(p=>p.registrationId);
      const {rows:names}=await pool.query(`SELECT r.id,p.given_names,p.family_names FROM player_registrations r JOIN players p ON p.organization_id=r.organization_id AND p.id=r.player_id WHERE r.organization_id=$1 AND r.entry_id=$2 AND r.id=ANY($3::uuid[])`,[organizationId,entry,ids]);
      const byId=new Map(names.map(p=>[p.id,`${p.family_names}, ${p.given_names}`]));
      const {rows:staff}=await pool.query('SELECT id,name,role FROM team_staff WHERE organization_id=$1 AND entry_id=$2 AND id=ANY($3::uuid[])',[organizationId,entry,selected.staffIds||[]]);
      report={...base,title:`Planilla del encuentro · ${row.match_date}`,version:String(version),sourceDate:row.reviewed_at.toISOString(),columns:['Tipo','Nombre','Dorsal o función'],rows:[...selected.players.map(p=>['Jugador',byId.get(p.registrationId)||'Jugador no disponible',p.shirtNumber===null?'':String(p.shirtNumber)]),...staff.map(p=>['Cuerpo técnico',p.name,p.role])]};
    }else if(kind==='acta'){
      const match=uuid(params.resourceId),version=z.coerce.number().int().positive().parse(params.version);
      const {rows:[row]}=await pool.query(`SELECT s.snapshot,s.created_at,to_char(m.match_date,'YYYY-MM-DD') match_date,m.home_entry_id,m.away_entry_id,h.name home_name,a.name away_name
        FROM match_acta_snapshots s JOIN draft_matches m ON m.organization_id=s.organization_id AND m.id=s.match_id
        JOIN team_entries he ON he.organization_id=m.organization_id AND he.id=m.home_entry_id JOIN teams h ON h.organization_id=he.organization_id AND h.id=he.team_id
        JOIN team_entries ae ON ae.organization_id=m.organization_id AND ae.id=m.away_entry_id JOIN teams a ON a.organization_id=ae.organization_id AND a.id=ae.team_id
        WHERE s.organization_id=$1 AND (m.home_entry_id=$2 OR m.away_entry_id=$2) AND s.match_id=$3 AND s.version=$4 AND s.kind='approved'`,[organizationId,entry,match,version]);
      if(!row)fail(404,'EXPORT_NOT_FOUND','Solo se exporta un acta oficial de este partido.');
      const snapshot=row.snapshot as {score:{home:number;away:number};events:MatchJournalEvent[]};
      const active=projectMatchJournal(snapshot.events,row.home_entry_id,row.away_entry_id).active;
      const ids=active.flatMap(e=>e.registrationId?[e.registrationId]:[]);
      const {rows:names}=await pool.query(`SELECT r.id,p.given_names,p.family_names FROM player_registrations r JOIN players p ON p.organization_id=r.organization_id AND p.id=r.player_id WHERE r.organization_id=$1 AND r.id=ANY($2::uuid[])`,[organizationId,ids]);
      const byId=new Map(names.map(p=>[p.id,`${p.given_names} ${p.family_names}`]));
      report={...base,title:`Acta oficial · ${row.home_name} ${snapshot.score.home}–${snapshot.score.away} ${row.away_name}`,version:String(version),sourceDate:row.created_at.toISOString(),columns:['Secuencia','Equipo','Evento','Tiempo','Jugador'],rows:active.map(e=>[String(e.sequence),e.teamEntryId===row.home_entry_id?row.home_name:e.teamEntryId===row.away_entry_id?row.away_name:'Partido',e.kind,[e.period||'Sin tiempo',e.minute===null?'':String(e.minute)].filter(Boolean).join(' '),e.registrationId?byId.get(e.registrationId)||'Jugador no disponible':''])};
    }else{
      if(params.resourceId!=='summary'||params.version!=='current')fail(400,'INVALID_EXPORT','La referencia disciplinaria no es válida.');
      const {rows:cases}=await pool.query(`SELECT c.id,c.summary,c.status,c.created_at,d.status decision_status,d.fine_amount_guaranies,d.reason decision_reason,p.given_names,p.family_names
        FROM discipline_cases c LEFT JOIN discipline_decisions d ON d.organization_id=c.organization_id AND d.case_id=c.id
        LEFT JOIN player_registrations r ON r.organization_id=c.organization_id AND r.id=c.registration_id
        LEFT JOIN players p ON p.organization_id=r.organization_id AND p.id=r.player_id
        WHERE c.organization_id=$1 AND c.entry_id=$2 ORDER BY c.created_at,c.id`,[organizationId,entry]);
      const rows=cases.map(c=>[c.summary,c.given_names?`${c.given_names} ${c.family_names}`:'Equipo',c.status,c.decision_status||'Sin resolución',c.fine_amount_guaranies===null?'':String(c.fine_amount_guaranies),c.decision_reason||'']);
      const fingerprint=createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,12);
      report={...base,title:'Resumen disciplinario',version:`corte-${fingerprint}`,sourceDate:now,columns:['Asunto','Sujeto','Estado','Resolución','Multa deportiva Gs.','Motivo'],rows};
    }
    const bytes=format==='pdf'?sportsReportPdf(report):Buffer.from(sportsReportCsv(report),'utf8');
    await transaction(pool,client=>audit(client,actor.user_id,organizationId,'private_export.downloaded',entry,'Descarga privada de reporte deportivo',null,{kind,format,resourceId:params.resourceId,version:report.version,bytes:bytes.length}));
    return reply.header('Cache-Control','private, no-store').header('Content-Disposition',`attachment; filename="${kind}-${report.version.replace(/[^a-zA-Z0-9-]/g,'')}.${format}"`).type(format==='pdf'?'application/pdf':'text/csv; charset=utf-8').send(bytes);
  });
}
