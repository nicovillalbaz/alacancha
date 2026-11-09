import { createHash } from 'node:crypto';
import type { DatabasePool } from '@torneos/db';
import { categoryStatistics, playerStatNames, withDocumentedTiebreaks } from './statistics.ts';
import { flyerSizes, type FlyerKind, type FlyerSize, type FlyerSnapshot } from './flyer-template.ts';

export class FlyerSourceError extends Error { constructor(public statusCode:number,public code:string,message:string){super(message);} }
const missing=():never=>{throw new FlyerSourceError(404,'SOURCE_NOT_PUBLIC','La fuente todavía no está publicada o dejó de estar visible.');};
const conflict=(message:string):never=>{throw new FlyerSourceError(409,'SOURCE_NOT_READY',message);};
export const sourceHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type PublicMatch={id:string;category_id:string;category_name:string;home_entry_id:string;away_entry_id:string;home_name:string;away_name:string;venue_name:string;court_label:string;match_date:string;match_time:string;schedule_revision:number};
async function base(pool:DatabasePool,org:string){const {rows:[row]}=await pool.query("SELECT name,logo_id FROM organizations WHERE id=$1 AND status='active'",[org]);if(!row)missing();return row as {name:string;logo_id:string|null};}
async function day(pool:DatabasePool,org:string,id:string){
 const {rows:[row]}=await pool.query(`SELECT md.id,md.ordinal,p.revision,p.snapshot,ed.name edition_name,t.name tournament_name
 FROM matchdays md JOIN editions ed ON ed.organization_id=md.organization_id AND ed.id=md.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
 JOIN LATERAL (SELECT revision,snapshot FROM matchday_publications WHERE organization_id=md.organization_id AND matchday_id=md.id ORDER BY revision DESC LIMIT 1) p ON true
 WHERE md.organization_id=$1 AND md.id=$2 AND md.status='published' AND ed.status='published' AND t.status='published'`,[org,id]);if(!row)missing();return row as {id:string;ordinal:number;revision:number;snapshot:PublicMatch[];edition_name:string;tournament_name:string};
}
async function visible(pool:DatabasePool,org:string,ids:string[]){
 const unique=[...new Set(ids)];if(!unique.length)return true;
 const {rows}=await pool.query("SELECT id FROM team_entries WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND status='active' AND public_visible",[org,unique]);return rows.length===unique.length;
}
async function shields(pool:DatabasePool,org:string,ids:string[]){
 const {rows}=await pool.query('SELECT e.id,t.shield_id FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE e.organization_id=$1 AND e.id=ANY($2::uuid[])',[org,ids]);return new Map<string,string|null>(rows.map(row=>[row.id,row.shield_id]));
}
function place(match:PublicMatch){const venue=match.venue_name.trim(),court=match.court_label.trim();const extra=court&&court.toLocaleLowerCase('es')!==venue.toLocaleLowerCase('es')&&court.toLocaleLowerCase('es')!=='cancha 1'?court:'';return [venue,extra].filter(Boolean).join(' · ');}
function usefulCategory(name:string){return name.trim().toLocaleLowerCase('es')==='libre'?'':name;}
function stamp(match:PublicMatch){const [year,month,day]=match.match_date.split('-');return [`${day}/${month}/${year}`,match.match_time,place(match)].filter(Boolean).join(' · ');}
function linesPage<T>(items:T[],size:FlyerSize,pageNo:number){const per=flyerSizes[size].perPage,total=Math.max(1,Math.ceil(items.length/per));if(pageNo>total)missing();return {items:items.slice((pageNo-1)*per,pageNo*per),total};}
export async function loadFlyerSource(pool:DatabasePool,org:string,kind:FlyerKind,sourceId:string,size:FlyerSize,pageNo:number,note:string|null):Promise<FlyerSnapshot>{
 const organization=await base(pool,org);
 const snapshot:FlyerSnapshot={kind,sourceId,title:'',kicker:'',competition:organization.name,subline:'',footer:'',lines:[],note,orgAssetId:organization.logo_id,entryIds:[],scorerRegistrationIds:[],matchdayId:null,sourceRevision:null,approvalId:null,pageNo,totalPages:1};
 if(kind==='match'||kind==='result'||kind==='champion'){
  const {rows:[reference]}=await pool.query('SELECT matchday_id FROM draft_matches WHERE organization_id=$1 AND id=$2',[org,sourceId]);if(!reference?.matchday_id)missing();
  const publication=await day(pool,org,reference.matchday_id);const match=publication.snapshot.find(item=>item.id===sourceId);if(!match)return missing();
  if(!await visible(pool,org,[match.home_entry_id,match.away_entry_id]))missing();
  const assets=await shields(pool,org,[match.home_entry_id,match.away_entry_id]);
  Object.assign(snapshot,{title:kind==='champion'?'Campeón':kind==='result'?'Resultado oficial':'Próximo encuentro',kicker:`${publication.tournament_name} · Jornada ${publication.ordinal}`,competition:publication.edition_name,subline:kind==='result'?`${match.match_date.split('-').reverse().join('/')} · ${match.match_time}`:stamp(match),footer:match.category_name,home:{name:match.home_name,assetId:assets.get(match.home_entry_id)||null},away:{name:match.away_name,assetId:assets.get(match.away_entry_id)||null},entryIds:[match.home_entry_id,match.away_entry_id],matchdayId:publication.id,sourceRevision:publication.revision});
  if(kind!=='match'){
   const {rows:[record]}=await pool.query("SELECT r.approval_id,a.snapshot FROM match_records r JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved' WHERE r.organization_id=$1 AND r.match_id=$2",[org,sourceId]);if(!record)conflict('El resultado necesita un acta oficial aprobada.');
   snapshot.score=record.snapshot.score;snapshot.approvalId=record.approval_id;
   if(record.snapshot.shootout&&(record.snapshot.shootout.home>0||record.snapshot.shootout.away>0))snapshot.shootout=record.snapshot.shootout;
   if(kind==='result'){
    const goals=(record.snapshot.events as Array<{kind:string;registrationId?:string;registration_id?:string;teamEntryId?:string;team_entry_id?:string;period?:string|null;voidsEventId?:string;voids_event_id?:string;id:string}>).filter(event=>['goal','penalty','own_goal'].includes(event.kind));
    const voided=new Set((record.snapshot.events as Array<{kind:string;voidsEventId?:string;voids_event_id?:string}>).filter(event=>event.kind==='void').map(event=>event.voidsEventId||event.voids_event_id));
    const active=goals.filter(event=>!voided.has(event.id));const ids=active.map(event=>event.registrationId||event.registration_id).filter((id):id is string=>Boolean(id));
    const {rows:names}=await pool.query(`SELECT pr.id,p.given_names,p.family_names FROM player_registrations pr JOIN player_publications pub ON pub.organization_id=pr.organization_id AND pub.registration_id=pr.id AND pub.visible
      JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id WHERE pr.organization_id=$1 AND pr.id=ANY($2::uuid[])`,[org,ids]);
    const byId=new Map(names.map(row=>[row.id,`${row.given_names} ${row.family_names}`]));snapshot.scorerRegistrationIds=names.map(row=>row.id);
    const pages=Math.max(1,Math.ceil(active.length/4));if(pageNo>pages)return missing();snapshot.totalPages=pages;
    snapshot.lines=active.slice((pageNo-1)*4,pageNo*4).map(event=>({left:`${byId.get(event.registrationId||event.registration_id)||'Gol sin autor'}${event.kind==='penalty'?' (pen.)':event.kind==='own_goal'?' (aut.)':''}`,right:event.period||'',side:(event.kind==='own_goal'?(event.teamEntryId||event.team_entry_id)===match.home_entry_id?'away':'home':(event.teamEntryId||event.team_entry_id)===match.home_entry_id?'home':'away') as 'home'|'away'}));
   }else{
    const {rows:[final]}=await pool.query(`SELECT s.match_id,s.return_match_id FROM fixture_bracket_slots s JOIN fixture_phases p ON p.organization_id=s.organization_id AND p.id=s.phase_id AND p.mode='knockout' AND p.status='generated' WHERE s.organization_id=$1 AND (s.match_id=$2 OR s.return_match_id=$2) AND s.stage=(SELECT max(stage) FROM fixture_bracket_slots WHERE organization_id=s.organization_id AND phase_id=s.phase_id)`,[org,sourceId]);
    if(!final)conflict('El campeón requiere una final de eliminación publicada y un acta oficial.');
    let goals=record.snapshot.score;const shootout=record.snapshot.shootout;
    if(final.return_match_id){
      if(sourceId!==final.return_match_id)conflict('Para una final de ida y vuelta elegí el partido de vuelta.');
      const {rows:[firstReference]}=await pool.query('SELECT matchday_id FROM draft_matches WHERE organization_id=$1 AND id=$2',[org,final.match_id]);if(!firstReference?.matchday_id)conflict('La ida de la final no está publicada.');
      const firstDay=await day(pool,org,firstReference.matchday_id),firstMatch=firstDay.snapshot.find(item=>item.id===final.match_id);if(!firstMatch)return missing();if(!await visible(pool,org,[firstMatch.home_entry_id,firstMatch.away_entry_id]))missing();
      const {rows:[firstActa]}=await pool.query("SELECT r.approval_id,a.snapshot FROM match_records r JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved' WHERE r.organization_id=$1 AND r.match_id=$2",[org,final.match_id]);if(!firstActa)conflict('La ida de la final necesita acta oficial.');
      const sum=new Map<string,number>();for(const [leg,score] of [[firstMatch,firstActa.snapshot.score],[match,record.snapshot.score]] as const){sum.set(leg.home_entry_id,(sum.get(leg.home_entry_id)||0)+score.home);sum.set(leg.away_entry_id,(sum.get(leg.away_entry_id)||0)+score.away);}
      goals={home:sum.get(match.home_entry_id)||0,away:sum.get(match.away_entry_id)||0};snapshot.score=goals;snapshot.subline=`Resultado global · ${stamp(match)}`;
      snapshot.relatedMatchdayId=firstDay.id;snapshot.relatedSourceRevision=firstDay.revision;snapshot.relatedApprovalId=firstActa.approval_id;
    }
    if(goals.home===goals.away&&(!shootout||shootout.home===shootout.away))conflict('La final no tiene un ganador definido.');
    const homeWon=goals.home===goals.away?shootout.home>shootout.away:goals.home>goals.away;
    const winner=homeWon?match.home_name:match.away_name;
    snapshot.title=winner;snapshot.lines=[{left:'Campeón',right:publication.tournament_name}];
   }
  }
  if(kind!=='result'&&pageNo!==1)return missing();
  return snapshot;
 }
 if(kind==='matchday'){
  const publication=await day(pool,org,sourceId);const matches=publication.snapshot;
  if(!matches.length)conflict('La jornada publicada no tiene encuentros.');
  if(!await visible(pool,org,matches.flatMap(match=>[match.home_entry_id,match.away_entry_id])))missing();
  const page=linesPage(matches,size,pageNo),assets=await shields(pool,org,matches.flatMap(match=>[match.home_entry_id,match.away_entry_id]));Object.assign(snapshot,{title:`Jornada ${publication.ordinal}`,kicker:publication.tournament_name,competition:publication.edition_name,subline:'',footer:'',matchdayId:publication.id,sourceRevision:publication.revision,totalPages:page.total,entryIds:[...new Set(matches.flatMap(match=>[match.home_entry_id,match.away_entry_id]))],lines:page.items.map(match=>({left:`${match.home_name} vs ${match.away_name}`,homeName:match.home_name,awayName:match.away_name,homeAssetId:assets.get(match.home_entry_id)||null,awayAssetId:assets.get(match.away_entry_id)||null,right:match.match_time,sub:[usefulCategory(match.category_name),place(match)].filter(Boolean).join(' · ')}))});return snapshot;
 }
 if(kind==='scorer'){
  if(pageNo!==1)missing();
  const {rows:[reference]}=await pool.query(`SELECT e.id entry_id,e.category_id,c.name category_name,ed.name edition_name,t.name tournament_name,tm.name team_name
    FROM player_registrations pr JOIN team_entries e ON e.organization_id=pr.organization_id AND e.id=pr.entry_id
    JOIN teams tm ON tm.organization_id=e.organization_id AND tm.id=e.team_id
    JOIN categories c ON c.organization_id=e.organization_id AND c.id=e.category_id
    JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
    JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
    WHERE pr.organization_id=$1 AND pr.id=$2 AND e.status='active' AND e.public_visible AND c.status='published' AND ed.status='published' AND t.status='published'`,[org,sourceId]);
  if(!reference)missing();
  const projection=await categoryStatistics(pool,org,reference.category_id);
  const player=projection?.players.find(item=>item.registrationId===sourceId);
  const name=(await playerStatNames(pool,org,[sourceId])).get(sourceId);
  if(!player || player.goals===0 || !name || !name.publicName)return conflict('El goleador necesita al menos un gol oficial y nombre público autorizado.');
  Object.assign(snapshot,{title:name.name,kicker:reference.tournament_name,competition:reference.edition_name,subline:reference.category_name,footer:'Goleador',lines:[{left:name.name,right:`${player.goals} ${player.goals===1?'gol':'goles'}`,sub:reference.team_name}],entryIds:[reference.entry_id],scorerRegistrationIds:[sourceId]});
  return snapshot;
 }
 if(kind==='standings'||kind==='scorers'||kind==='defense'){
  const {rows:[category]}=await pool.query(`SELECT c.name,ed.name edition_name,t.name tournament_name FROM categories c JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id WHERE c.organization_id=$1 AND c.id=$2 AND c.status='published' AND ed.status='published' AND t.status='published'`,[org,sourceId]);if(!category)missing();
  const projection=await categoryStatistics(pool,org,sourceId);if(!projection||!projection.tables.length)return conflict('Todavía no hay tabla publicada.');
  if(!await visible(pool,org,projection.entries.map(entry=>entry.id)))missing();
  const ordered=await withDocumentedTiebreaks(pool,org,projection);
  const assets=await shields(pool,org,projection.entries.map(entry=>entry.id));
  if(kind==='standings'){
   const pages=ordered.tables.flatMap(table=>{
    const rows=table.groups.flatMap(group=>group.teamIds.map(id=>{const team=ordered.entries.find(entry=>entry.id===id);const total=table.totals.find(item=>item.teamId===id);return {left:`${group.unresolved?'–':`${group.position}.`} ${team?.name||'Equipo'}`,right:`${total?.points||0} pts`,sub:`PJ ${total?.played||0} · DG ${total?.goalDifference||0}`,homeName:team?.name||'Equipo',homeAssetId:assets.get(id)||null};}));
    const count=Math.max(1,Math.ceil(rows.length/flyerSizes[size].perPage));
    const label=table.groupNo===null?'General':`Grupo ${table.groupNo}`;
    return Array.from({length:count},(_,index)=>({label:count===1?label:`${label} · ${index+1}/${count}`,lines:rows.slice(index*flyerSizes[size].perPage,(index+1)*flyerSizes[size].perPage)}));
   });
   if(pageNo>pages.length)missing();
   const page=pages[pageNo-1];Object.assign(snapshot,{title:'Tabla de posiciones',kicker:category.tournament_name,competition:category.edition_name,subline:page.label,footer:'',lines:page.lines,totalPages:pages.length,pageLabels:pages.map(item=>item.label),entryIds:projection.entries.map(entry=>entry.id),sourceRevision:null});return snapshot;
  }
  if(kind==='scorers'){
   const names=await playerStatNames(pool,org,projection.players.map(player=>player.registrationId));
   const scored=projection.players.filter(player=>player.goals>0 && names.get(player.registrationId)?.publicName).sort((a,b)=>b.goals-a.goals || (names.get(a.registrationId)?.name||'').localeCompare(names.get(b.registrationId)?.name||'','es'));
   if(!scored.length)conflict('Todavía no hay goleadores con nombre autorizado para publicar.');
   const page=linesPage(scored,size,pageNo);Object.assign(snapshot,{title:'Goleadores',kicker:category.tournament_name,competition:category.edition_name,subline:usefulCategory(category.name),footer:`${projection.officialMatches} partidos oficiales`,lines:page.items.map(player=>{const team=projection.entries.find(entry=>entry.id===player.entryId);return {left:names.get(player.registrationId)!.name,right:String(player.goals),sub:team?.name||'Equipo',homeName:team?.name||'Equipo',homeAssetId:assets.get(player.entryId)||null};}),totalPages:page.total,entryIds:projection.entries.map(entry=>entry.id),scorerRegistrationIds:scored.map(player=>player.registrationId)});return snapshot;
  }
  const rows=projection.defense.filter(total=>total.played>0).map(total=>{const team=projection.entries.find(entry=>entry.id===total.entryId);return {left:team?.name||'Equipo',right:`${total.goalsAgainst} GC`,sub:`${total.played} PJ`,homeName:team?.name||'Equipo',homeAssetId:assets.get(total.entryId)||null};}).sort((a,b)=>Number.parseInt(a.right)-Number.parseInt(b.right)||a.left.localeCompare(b.left,'es'));
  if(!rows.length)conflict('Todavía no hay partidos oficiales para esta tabla.');
  const page=linesPage(rows,size,pageNo);Object.assign(snapshot,{title:'Valla menos vencida',kicker:category.tournament_name,competition:category.edition_name,subline:usefulCategory(category.name),footer:`${projection.officialMatches} partidos oficiales`,lines:page.items,totalPages:page.total,entryIds:projection.entries.map(entry=>entry.id)});return snapshot;
 }
 if(['bracket','semifinal','final'].includes(kind)){
  const {rows:[phase]}=await pool.query(`SELECT p.revision,c.name category_name,ed.name edition_name,t.name tournament_name FROM fixture_phases p JOIN categories c ON c.organization_id=p.organization_id AND c.id=p.category_id JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id WHERE p.organization_id=$1 AND p.id=$2 AND p.mode='knockout' AND p.status='generated' AND c.status='published' AND ed.status='published' AND t.status='published'`,[org,sourceId]);if(!phase)missing();
  const {rows:slots}=await pool.query(`SELECT s.stage,s.slot,s.home_entry_id,s.away_entry_id,h.name home_name,a.name away_name,md.status day_status FROM fixture_bracket_slots s LEFT JOIN team_entries he ON he.organization_id=s.organization_id AND he.id=s.home_entry_id LEFT JOIN teams h ON h.organization_id=he.organization_id AND h.id=he.team_id LEFT JOIN team_entries ae ON ae.organization_id=s.organization_id AND ae.id=s.away_entry_id LEFT JOIN teams a ON a.organization_id=ae.organization_id AND a.id=ae.team_id LEFT JOIN draft_matches m ON m.organization_id=s.organization_id AND m.id=s.match_id LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id WHERE s.organization_id=$1 AND s.phase_id=$2 ORDER BY s.stage,s.slot`,[org,sourceId]);
  if(!slots.length||slots.some(slot=>slot.stage===1&&slot.day_status!=='published'))conflict('El cuadro todavía no tiene sus cruces iniciales publicados.');
  const ids=slots.flatMap(slot=>[slot.home_entry_id,slot.away_entry_id].filter(Boolean));if(!await visible(pool,org,ids))missing();
  const max=Math.max(...slots.map(slot=>slot.stage));const chosen=kind==='semifinal'?slots.filter(slot=>slot.stage===max-1):kind==='final'?slots.filter(slot=>slot.stage===max):slots;
  if(!chosen.length)conflict('Esa ronda todavía no está planificada.');const page=linesPage(chosen,size,pageNo),assets=await shields(pool,org,ids);
  Object.assign(snapshot,{title:kind==='semifinal'?'Semifinales':kind==='final'?'Final':'Cuadro de eliminación',kicker:phase.tournament_name,competition:phase.edition_name,subline:phase.category_name,footer:'',lines:page.items.map(slot=>({left:`${slot.home_name||'Por definir'} vs ${slot.away_name||'Por definir'}`,homeName:slot.home_name||'Por definir',awayName:slot.away_name||'Por definir',homeAssetId:assets.get(slot.home_entry_id)||null,awayAssetId:assets.get(slot.away_entry_id)||null,sub:kind==='bracket'?`Ronda ${slot.stage} · Llave ${slot.slot}`:`Llave ${slot.slot}`})),totalPages:page.total,entryIds:ids,sourceRevision:phase.revision});return snapshot;
 }
 if(kind==='notice'){
  const {rows:[tournament]}=await pool.query("SELECT name FROM tournaments WHERE organization_id=$1 AND id=$2 AND status='published'",[org,sourceId]);if(!tournament)missing();if(!note)conflict('Escribí el comunicado antes de generar el flyer.');Object.assign(snapshot,{title:'Comunicado',kicker:tournament.name,subline:note,footer:'Información oficial del torneo'});return snapshot;
 }
 return missing();
}
