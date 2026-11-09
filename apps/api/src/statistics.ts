import { createHash } from 'node:crypto';
import type { DatabasePool } from '@torneos/db';
import { deriveOfficialStatistics, ruleSchema, type OfficialStatMatch, type StatEntry } from '@torneos/shared';

export interface CategoryStatistics {
  categoryId: string;
  phaseMode: 'league' | 'groups' | 'knockout' | null;
  ruleVersion: number;
  entries: StatEntry[];
  officialMatches: number;
  tableMatches: number;
  tables: ReturnType<typeof deriveOfficialStatistics>['tables'];
  defense: Array<{entryId:string;played:number;goalsAgainst:number}>;
  players: ReturnType<typeof deriveOfficialStatistics>['players'];
  sourceKey: string;
}

export async function categoryStatistics(pool: DatabasePool, organizationId: string, categoryId: string, force = false): Promise<CategoryStatistics | null> {
  const { rows: [category] } = await pool.query('SELECT id FROM categories WHERE organization_id=$1 AND id=$2', [organizationId, categoryId]);
  if (!category) return null;
  const { rows: [phase] } = await pool.query("SELECT id,mode,rule_version,status FROM fixture_phases WHERE organization_id=$1 AND category_id=$2", [organizationId, categoryId]);
  const { rows: [rule] } = await pool.query('SELECT version,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND version=coalesce($3::integer,(SELECT max(version) FROM rule_versions WHERE organization_id=$1 AND category_id=$2 AND status=\'published\'))', [organizationId, categoryId, phase?.rule_version ?? null]);
  if (!rule) return { categoryId, phaseMode: phase?.mode ?? null, ruleVersion: 0, entries: [], officialMatches: 0, tableMatches: 0, tables: [], defense: [], players: [], sourceKey: '0'.repeat(64) };
  const rules = ruleSchema.parse(rule.rules);
  const { rows: entryRows } = await pool.query(`SELECT e.id,t.name,
      CASE WHEN $3::text='groups' THEN g.group_no ELSE NULL END group_no
    FROM team_entries e JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
    LEFT JOIN fixture_group_entries g ON g.organization_id=e.organization_id AND g.entry_id=e.id AND g.phase_id=$4::uuid
    WHERE e.organization_id=$1 AND e.category_id=$2 AND e.status='active'
      AND ($4::uuid IS NULL OR $5::text<>'generated' OR g.entry_id IS NOT NULL OR
        EXISTS(SELECT 1 FROM draft_matches m WHERE m.organization_id=e.organization_id AND m.fixture_phase_id=$4 AND (m.home_entry_id=e.id OR m.away_entry_id=e.id)) OR
        EXISTS(SELECT 1 FROM fixture_byes b JOIN fixture_rounds r ON r.organization_id=b.organization_id AND r.id=b.round_id WHERE b.organization_id=e.organization_id AND r.phase_id=$4 AND b.entry_id=e.id))
    ORDER BY group_no NULLS FIRST,t.name,e.id`, [organizationId, categoryId, phase?.mode ?? null, phase?.id ?? null, phase?.status ?? null]);
  const entries: StatEntry[] = !phase || phase.status === 'generated' ? entryRows.map(row => ({ id: row.id, name: row.name, groupNo: row.group_no })) : [];
  const { rows: matchRows } = await pool.query(`SELECT m.id,m.home_entry_id,m.away_entry_id,m.fixture_phase_id,m.competition_stage,r.approval_id,a.snapshot,
      fr.group_no,hl.snapshot home_lineup,al.snapshot away_lineup,r.roster_snapshot
    FROM draft_matches m JOIN match_records r ON r.organization_id=m.organization_id AND r.match_id=m.id AND r.approval_id IS NOT NULL
    JOIN match_acta_snapshots a ON a.organization_id=r.organization_id AND a.id=r.approval_id AND a.kind='approved'
    LEFT JOIN lineup_versions hl ON hl.organization_id=r.organization_id AND hl.id=r.home_lineup_id
    LEFT JOIN lineup_versions al ON al.organization_id=r.organization_id AND al.id=r.away_lineup_id
    LEFT JOIN fixture_rounds fr ON fr.organization_id=m.organization_id AND fr.id=m.fixture_round_id
    WHERE m.organization_id=$1 AND m.category_id=$2 ORDER BY m.id`, [organizationId, categoryId]);
  const matches: OfficialStatMatch[] = matchRows.map(row => ({
    id: row.id, homeEntryId: row.home_entry_id, awayEntryId: row.away_entry_id,
    groupNo: phase?.mode === 'groups' && row.fixture_phase_id === phase.id ? row.group_no : null,
    tableEligible: row.competition_stage === 'initial' && (!phase ? row.fixture_phase_id === null : phase.status === 'generated' && phase.mode !== 'knockout' && row.fixture_phase_id === phase.id),
    score: row.snapshot.score, events: row.snapshot.events,
    homeRoster: (row.roster_snapshot?.home?.length ? row.roster_snapshot.home : row.home_lineup?.players || []).map((player: { registrationId: string }) => player.registrationId),
    awayRoster: (row.roster_snapshot?.away?.length ? row.roster_snapshot.away : row.away_lineup?.players || []).map((player: { registrationId: string }) => player.registrationId),
  }));
  const { rows: adjustments } = await pool.query('SELECT id,entry_id,points_delta FROM standing_adjustments WHERE organization_id=$1 AND category_id=$2 ORDER BY decided_at,id', [organizationId, categoryId]);
  const pointAdjustments = new Map<string,number>();
  for (const item of adjustments) pointAdjustments.set(item.entry_id, (pointAdjustments.get(item.entry_id) || 0) + item.points_delta);
  const sourceKey = createHash('sha256').update(JSON.stringify({ projectionVersion: 8, phase: phase?.id ?? null, version: rule.version, entries: entries.map(entry => [entry.id, entry.name, entry.groupNo]), approvals: matchRows.map(row => [row.id, row.approval_id]), adjustments: adjustments.map(item => [item.id,item.entry_id,item.points_delta]) })).digest('hex');
  const { rows: [cached] } = await pool.query('SELECT source_key,projection FROM category_statistics WHERE organization_id=$1 AND category_id=$2', [organizationId, categoryId]);
  if (!force && cached?.source_key === sourceKey) return cached.projection as CategoryStatistics;
  const derived = deriveOfficialStatistics(entries, matches, rules, pointAdjustments);
  const defenseByEntry=new Map(entries.map(entry=>[entry.id,{entryId:entry.id,played:0,goalsAgainst:0}]));
  for(const match of matches){
    const home=defenseByEntry.get(match.homeEntryId),away=defenseByEntry.get(match.awayEntryId);
    if(home){home.played++;home.goalsAgainst+=match.score.away;}
    if(away){away.played++;away.goalsAgainst+=match.score.home;}
  }
  const tableMatches = matches.filter(match => match.tableEligible).length;
  const projection: CategoryStatistics = { categoryId, phaseMode: phase?.mode ?? null, ruleVersion: rule.version, entries, officialMatches: matches.length, tableMatches, tables: derived.tables, defense:[...defenseByEntry.values()], players: derived.players, sourceKey };
  await pool.query(`INSERT INTO category_statistics(organization_id,category_id,source_key,projection) VALUES($1,$2,$3,$4)
    ON CONFLICT(organization_id,category_id) DO UPDATE SET source_key=excluded.source_key,projection=excluded.projection,calculated_at=now()`, [organizationId, categoryId, sourceKey, JSON.stringify(projection)]);
  return projection;
}

export async function playerStatNames(pool: DatabasePool, organizationId: string, registrationIds: string[]) {
  if (!registrationIds.length) return new Map<string, { name: string; publicName: boolean }>();
  const { rows } = await pool.query(`SELECT pr.id,p.given_names,p.family_names,coalesce(pub.visible,false) public_name
    FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
    LEFT JOIN player_publications pub ON pub.organization_id=pr.organization_id AND pub.registration_id=pr.id
    WHERE pr.organization_id=$1 AND pr.id=ANY($2::uuid[])`, [organizationId, registrationIds]);
  return new Map(rows.map(row => [row.id, { name: `${row.given_names} ${row.family_names}`, publicName: row.public_name }]));
}

export async function withDocumentedTiebreaks(pool: DatabasePool, organizationId: string, projection: CategoryStatistics): Promise<CategoryStatistics> {
  const {rows}=await pool.query(`SELECT group_key,position,entry_order FROM standing_tiebreak_decisions
    WHERE organization_id=$1 AND category_id=$2 AND source_key=$3 ORDER BY decided_at DESC,id DESC`,[organizationId,projection.categoryId,projection.sourceKey]);
  const decisions=new Map<string,string[]>();
  for(const row of rows){const key=`${row.group_key}:${row.position}`;if(!decisions.has(key)) decisions.set(key,row.entry_order);}
  return {...projection,tables:projection.tables.map(table=>({ ...table, groups:table.groups.flatMap(group=>{
    if(!group.unresolved) return [group];
    const order=decisions.get(`${table.groupNo===null?'all':`group:${table.groupNo}`}:${group.position}`);
    if(!order || order.length!==group.teamIds.length || order.some(id=>!group.teamIds.includes(id))) return [group];
    return order.map((id,index)=>({position:group.position+index,teamIds:[id],unresolved:false}));
  })}))};
}
