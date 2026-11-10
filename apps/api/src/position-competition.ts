import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DatabasePool } from '@torneos/db';
import { derivePositionCompetition, projectMatchJournal, ruleSchema, type MatchJournalEvent, type PositionGame, type PositionManualOrders, type PositionResult } from '@torneos/shared';

type Queryable=PoolClient|DatabasePool;

export async function positionCompetitionState(db:Queryable, organizationId:string, categoryId:string, publicOnly=false, withManual=true){
  const {rows:[blueprint]}=await db.query('SELECT id,revision FROM fixture_position_blueprints WHERE organization_id=$1 AND category_id=$2',[organizationId,categoryId]);
  if(!blueprint)return null;
  const {rows:assignments}=await db.query('SELECT slot_code,entry_id FROM fixture_position_assignments WHERE organization_id=$1 AND blueprint_id=$2 ORDER BY slot_code',[organizationId,blueprint.id]);
  const slots=new Map<string,string|null>(assignments.map(row=>[row.slot_code,row.entry_id]));
  const {rows:games}=await db.query(`SELECT id,code,stage,sporting_round,jornada_no,to_char(planned_date,'YYYY-MM-DD') planned_date,home_ref,away_ref
    FROM fixture_position_games WHERE organization_id=$1 AND blueprint_id=$2 ORDER BY ordinal`,[organizationId,blueprint.id]);
  const {rows:[rule]}=await db.query(`SELECT version,revision,status,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2
    ORDER BY (status='published') DESC,version DESC LIMIT 1`,[organizationId,categoryId]);
  const parsed=ruleSchema.safeParse(rule?.rules);
  if(!parsed.success)throw new Error('El reglamento de la Copa no es válido.');
  const {rows:approved}=await db.query(`SELECT g.code,m.id match_id,m.home_entry_id,m.away_entry_id,a.id approval_id,a.snapshot
    FROM fixture_position_games g JOIN draft_matches m ON m.organization_id=g.organization_id AND m.position_game_id=g.id AND m.archived_at IS NULL
    JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
    JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id AND r.approval_id IS NOT NULL
    JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved'
    WHERE g.organization_id=$1 AND g.blueprint_id=$2 AND ($3::boolean=false OR md.status='published')`,[organizationId,blueprint.id,publicOnly]);
  const {rows:matches}=await db.query(`SELECT g.code,m.id match_id,m.matchday_id,md.status day_status FROM draft_matches m
    JOIN fixture_position_games g ON g.organization_id=m.organization_id AND g.id=m.position_game_id
    LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
    WHERE g.organization_id=$1 AND g.blueprint_id=$2 AND m.archived_at IS NULL`,[organizationId,blueprint.id]);
  const playerTotals=new Map<string,{registrationId:string;entryId:string;goals:number}>();
  const results:PositionResult[]=approved.map(row=>{
    const snapshot=row.snapshot as {score:{home:number;away:number};shootout:{home:number;away:number};events:MatchJournalEvent[]};
    const active=projectMatchJournal(snapshot.events,row.home_entry_id,row.away_entry_id).active;
    for(const event of active){
      if(!event.registrationId||!event.teamEntryId||!['goal','penalty'].includes(event.kind))continue;
      const key=`${event.teamEntryId}:${event.registrationId}`;
      const player=playerTotals.get(key)||{registrationId:event.registrationId,entryId:event.teamEntryId,goals:0};
      player.goals++;
      playerTotals.set(key,player);
    }
    const count=(team:string,kind:'yellow'|'red')=>active.filter(event=>event.teamEntryId===team&&(kind==='yellow'?event.kind==='yellow'||event.kind==='second_yellow':event.kind==='red'||event.kind==='second_yellow')).length;
    return {code:row.code,homeEntryId:row.home_entry_id,awayEntryId:row.away_entry_id,homeGoals:snapshot.score.home,awayGoals:snapshot.score.away,homePenalties:snapshot.shootout.home,awayPenalties:snapshot.shootout.away,homeYellowCards:count(row.home_entry_id,'yellow'),awayYellowCards:count(row.away_entry_id,'yellow'),homeRedCards:count(row.home_entry_id,'red'),awayRedCards:count(row.away_entry_id,'red')};
  });
  const simpleGames:PositionGame[]=games.map(game=>({code:game.code,stage:game.stage,homeRef:game.home_ref,awayRef:game.away_ref}));
  const groupCodes=new Set(games.filter(game=>game.stage==='groups').map(game=>game.code));
  const fingerprint=(stage:string,rows:typeof approved)=>createHash('sha256').update(JSON.stringify({stage,ruleVersion:rule.version,ruleRevision:rule.revision,rulePoints:parsed.data.points,ruleBreakers:parsed.data.advanced?.tiebreakers,slots:[...slots.entries()],approvals:rows.map(row=>[row.code,row.approval_id]).sort((a,b)=>a[0].localeCompare(b[0]))})).digest('hex');
  const groupApprovals=approved.filter(row=>groupCodes.has(row.code));
  const sourceKeys={A:fingerprint('A',groupApprovals),B:fingerprint('B',groupApprovals),general:fingerprint('general',groupApprovals),final:fingerprint('final',approved)};
  const manualOrders:PositionManualOrders={};
  if(withManual){
    const {rows:decisions}=await db.query(`SELECT source_key,group_key,position,entry_order FROM standing_tiebreak_decisions
      WHERE organization_id=$1 AND category_id=$2 AND source_key=ANY($3::text[]) AND group_key LIKE 'position:%'
      ORDER BY decided_at DESC,id DESC`,[organizationId,categoryId,Object.values(sourceKeys)]);
    for(const row of decisions){
      const key=row.group_key.slice('position:'.length) as keyof typeof sourceKeys;
      if(!(key in sourceKeys)||row.source_key!==sourceKeys[key])continue;
      const positions=manualOrders[key] as Map<number,string[]>|undefined;
      if(positions?.has(row.position))continue;
      (positions||((manualOrders as Record<string,Map<number,string[]>>)[key]=new Map())).set(row.position,row.entry_order);
    }
  }
  const competition=derivePositionCompetition(slots,simpleGames,results,parsed.data,manualOrders);
  const titleTie=competition.final&&competition.official.quadrangular===6?competition.final.totals.filter(row=>row.points===Math.max(...competition.final!.totals.map(item=>item.points))).map(row=>row.teamId):[];
  const {rows:[extra]}=await db.query(`SELECT d.decision,d.match_id,m.home_entry_id,m.away_entry_id,to_char(m.match_date,'YYYY-MM-DD') match_date,md.status day_status,a.snapshot
    FROM fixture_position_title_decisions d LEFT JOIN draft_matches m ON m.organization_id=d.organization_id AND m.id=d.match_id
    LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
    LEFT JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id AND r.approval_id IS NOT NULL
    LEFT JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved'
    WHERE d.organization_id=$1 AND d.category_id=$2`,[organizationId,categoryId]);
  const extraScore=extra?.snapshot&&(!publicOnly||extra.day_status==='published')?{home:extra.snapshot.score.home,away:extra.snapshot.score.away,homePenalties:extra.snapshot.shootout.home,awayPenalties:extra.snapshot.shootout.away}:null;
  if(extraScore&&extra.home_entry_id&&extra.away_entry_id){
    const active=projectMatchJournal(extra.snapshot.events,extra.home_entry_id,extra.away_entry_id).active;
    for(const event of active){
      if(!event.registrationId||!event.teamEntryId||!['goal','penalty'].includes(event.kind))continue;
      const key=`${event.teamEntryId}:${event.registrationId}`;
      const player=playerTotals.get(key)||{registrationId:event.registrationId,entryId:event.teamEntryId,goals:0};
      player.goals++;
      playerTotals.set(key,player);
    }
  }
  const titleExtra=extra?{decision:extra.decision as 'no_extra'|'extra',matchId:extra.match_id as string|null,homeEntryId:extra.home_entry_id as string|null,awayEntryId:extra.away_entry_id as string|null,date:extra.match_date as string|null,dayStatus:extra.day_status as string|null,score:extraScore,winnerEntryId:!extraScore?null:extraScore.home>extraScore.away?extra.home_entry_id:extraScore.away>extraScore.home?extra.away_entry_id:extraScore.homePenalties>extraScore.awayPenalties?extra.home_entry_id:extraScore.awayPenalties>extraScore.homePenalties?extra.away_entry_id:null}:null;
  const defense=new Map([...slots.values()].filter((id):id is string=>!!id).map(id=>[id,{entryId:id,played:0,goalsAgainst:0}]));
  for(const result of results){
    const home=defense.get(result.homeEntryId),away=defense.get(result.awayEntryId);
    if(home){home.played++;home.goalsAgainst+=result.awayGoals;}
    if(away){away.played++;away.goalsAgainst+=result.homeGoals;}
  }
  if(extraScore&&extra.home_entry_id&&extra.away_entry_id){
    const home=defense.get(extra.home_entry_id),away=defense.get(extra.away_entry_id);
    if(home){home.played++;home.goalsAgainst+=extraScore.away;}
    if(away){away.played++;away.goalsAgainst+=extraScore.home;}
  }
  return {blueprint,slots,games,results,competition,matches,preparedMatches:matches.length,ruleVersion:rule.version,rulesPublished:rule.status==='published',playerTotals:[...playerTotals.values()],defense:[...defense.values()],titleTie,titleExtra,sourceKeys};
}

/** Idempotent: each plan game has at most one match. A correction never rewrites a started or published opponent silently. */
export async function syncPositionMatches(client:PoolClient,organizationId:string,categoryId:string,actorId:string){
  const state=await positionCompetitionState(client,organizationId,categoryId);
  if(!state)return {created:0,updated:0,blocked:'blueprint'};
  if(!state.rulesPublished)return {created:0,updated:0,blocked:'rules'};
  if(state.competition.blocked==='draw')return {created:0,updated:0,blocked:'draw'};
  const opening=state.games.filter(game=>game.stage==='groups'&&game.sporting_round==='F1');
  if(opening.length!==5||opening.some(game=>!game.jornada_no||!game.planned_date))return {created:0,updated:0,blocked:'opening'};
  const {rows:[category]}=await client.query('SELECT edition_id FROM categories WHERE organization_id=$1 AND id=$2',[organizationId,categoryId]);
  const existingDays=await client.query('SELECT id,ordinal FROM matchdays WHERE organization_id=$1 AND edition_id=$2',[organizationId,category.edition_id]);
  const days=new Map<number,string>(existingDays.rows.map(row=>[row.ordinal,row.id]));
  let created=0,updated=0;
  for(const game of state.games){
    const pair=state.competition.participants[game.code];
    if(!pair?.homeEntryId||!pair.awayEntryId||!game.planned_date||!game.jornada_no)continue;
    const {rows:[existing]}=await client.query(`SELECT m.id,m.home_entry_id,m.away_entry_id,m.matchday_id,md.status day_status,
      EXISTS(SELECT 1 FROM match_records r WHERE r.organization_id=m.organization_id AND r.match_id=m.id) started,
      EXISTS(SELECT 1 FROM lineup_versions l WHERE l.organization_id=m.organization_id AND l.match_id=m.id) has_lineup
      FROM draft_matches m LEFT JOIN matchdays md ON md.organization_id=m.organization_id AND md.id=m.matchday_id
      WHERE m.organization_id=$1 AND m.position_game_id=$2 FOR UPDATE OF m`,[organizationId,game.id]);
    if(existing){
      if(existing.home_entry_id!==pair.homeEntryId||existing.away_entry_id!==pair.awayEntryId){
        if(existing.started||existing.has_lineup||existing.day_status==='published')throw new Error(`El cruce ${game.code} ya comenzó o se publicó con otros equipos. Revisalo manualmente.`);
        await client.query('UPDATE draft_matches SET home_entry_id=$3,away_entry_id=$4 WHERE organization_id=$1 AND id=$2',[organizationId,existing.id,pair.homeEntryId,pair.awayEntryId]);
        updated++;
      }
      continue;
    }
    if(!days.has(game.jornada_no)){
      const dayId=randomUUID();
      const {rows:[inserted]}=await client.query(`INSERT INTO matchdays(id,organization_id,edition_id,ordinal,created_by) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(organization_id,edition_id,ordinal) DO UPDATE SET ordinal=excluded.ordinal RETURNING id`,[dayId,organizationId,category.edition_id,game.jornada_no,actorId]);
      days.set(game.jornada_no,inserted.id);
    }
    await client.query(`INSERT INTO draft_matches(id,organization_id,category_id,home_entry_id,away_entry_id,match_date,created_by,matchday_id,position_game_id,competition_stage)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),organizationId,categoryId,pair.homeEntryId,pair.awayEntryId,game.planned_date,actorId,days.get(game.jornada_no),game.id,game.stage==='groups'?'initial':'knockout']);
    created++;
  }
  return {created,updated,blocked:state.competition.blocked};
}
