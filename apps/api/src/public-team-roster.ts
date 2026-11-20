import type { DatabasePool } from '@torneos/db';
import { projectMatchJournal, type MatchJournalEvent, type PublicRosterPlayer } from '@torneos/shared';

export async function publicTeamRoster(pool: DatabasePool, organizationId: string, categoryId: string, entryId: string) {
  const {rows} = await pool.query(`SELECT pr.id,p.given_names,p.family_names,pr.shirt_number
    FROM player_registrations pr
    JOIN team_entries e ON e.organization_id=pr.organization_id AND e.id=pr.entry_id
    JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
    JOIN player_publications pub ON pub.organization_id=pr.organization_id AND pub.registration_id=pr.id AND pub.visible
    WHERE pr.organization_id=$1 AND pr.entry_id=$3 AND e.category_id=$2 AND e.status='active'
      AND pr.status<>'rejected' AND pr.reverted_at IS NULL
    ORDER BY p.family_names,p.given_names,pr.id LIMIT 500`,[organizationId,categoryId,entryId]);
  const players = new Map<string,PublicRosterPlayer>(rows.map(row=>[row.id,{
    name:`${row.given_names} ${row.family_names}`,shirtNumber:row.shirt_number,goals:0,yellowCards:0,redCards:0,customCards:[],
  }]));
  if(!players.size)return [];
  const {rows:matches}=await pool.query(`SELECT m.home_entry_id,m.away_entry_id,a.snapshot->'events' events,
      rv.rules #> '{advanced,discipline,customCards}' cards
    FROM draft_matches m
    JOIN matchdays d ON d.organization_id=m.organization_id AND d.id=m.matchday_id AND d.status='published' AND d.archived_at IS NULL
    JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id
    JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved'
    JOIN rule_versions rv ON rv.organization_id=m.organization_id AND rv.category_id=m.category_id AND rv.version=r.rule_version
    WHERE m.organization_id=$1 AND m.category_id=$2 AND m.archived_at IS NULL
      AND (m.home_entry_id=$3 OR m.away_entry_id=$3)
    ORDER BY a.created_at DESC,a.id`,[organizationId,categoryId,entryId]);
  for(const match of matches){
    const events=projectMatchJournal(match.events as MatchJournalEvent[],match.home_entry_id,match.away_entry_id).active;
    for(const event of events){
      if(event.teamEntryId!==entryId||!event.registrationId)continue;
      const player=players.get(event.registrationId);
      if(!player)continue;
      if(event.kind==='goal'||event.kind==='penalty')player.goals++;
      if(event.kind==='yellow'||event.kind==='second_yellow')player.yellowCards++;
      if(event.kind==='red'||event.kind==='second_yellow')player.redCards++;
      if(event.kind==='custom_card'){
        const card=(match.cards as Array<{code:string;label:string;color:string}>|null)?.find(item=>item.code===event.cardCode);
        if(!card)continue;
        const current=player.customCards.find(item=>item.label===card.label&&item.color===card.color);
        if(current)current.count++;
        else player.customCards.push({label:card.label,color:card.color,count:1});
      }
    }
  }
  return [...players.values()];
}
