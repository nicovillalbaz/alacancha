import type { CategoryStatistics } from './statistics.ts';

export interface ApprovedScore { score: { home: number; away: number }; shootout: { home: number; away: number } }
export type TieResolution='aggregate'|'match_points_penalties'|'match_points_third';
/** El segundo partido invierte la localía. La tercera acta conserva la localía original. */
export function tieWinner(homeId: string, awayId: string, first: ApprovedScore | null, second?: ApprovedScore | null, resolution:TieResolution='aggregate', third?:ApprovedScore|null,pointValues:{win:number;draw:number;loss:number}={win:3,draw:1,loss:0}): string | null {
  if (!first || (second === null)) return null;
  if(second&&resolution!=='aggregate'){
    const points=(home:number,away:number)=>home>away?pointValues.win:home===away?pointValues.draw:pointValues.loss;
    const homePoints=points(first.score.home,first.score.away)+points(second.score.away,second.score.home);
    const awayPoints=points(first.score.away,first.score.home)+points(second.score.home,second.score.away);
    if(homePoints!==awayPoints)return homePoints>awayPoints?homeId:awayId;
    if(resolution==='match_points_third'){
      if(!third)return null;
      if(third.score.home!==third.score.away)return third.score.home>third.score.away?homeId:awayId;
      if(third.shootout.home===third.shootout.away)return null;
      return third.shootout.home>third.shootout.away?homeId:awayId;
    }
    if(second.shootout.home===second.shootout.away)return null;
    return second.shootout.away>second.shootout.home?homeId:awayId;
  }
  const home = first.score.home + (second?.score.away ?? 0);
  const away = first.score.away + (second?.score.home ?? 0);
  if (home !== away) return home > away ? homeId : awayId;
  const shootout = second ? { home: second.shootout.away, away: second.shootout.home } : first.shootout;
  if (shootout.home === shootout.away) return null;
  return shootout.home > shootout.away ? homeId : awayId;
}

type Qualification = { from: 'league'; top: number } | { from: 'groups'; perGroup: number; bestRemaining: number };
function groupRanking(projection:CategoryStatistics,qualification:Extract<Qualification,{from:'groups'}>,tiebreakers:string[]){
  const tables = projection.tables.slice().sort((a,b) => (a.groupNo ?? 0) - (b.groupNo ?? 0));
  if (!tables.length || tables.some((table) => table.groups.some((group) => group.unresolved))) return null;
  const ranked = tables.map((table) => table.groups.flatMap((group) => group.teamIds));
  if (tables.some((table) => table.groupNo === null) || ranked.some((ids) => ids.length < qualification.perGroup)) return null;
  const selected = ranked.flatMap((ids) => ids.slice(0, qualification.perGroup));
  const totals = new Map(tables.flatMap((table) => table.totals.map((row) => [row.teamId,row] as const)));
  const criteria=tiebreakers.filter((criterion)=>!criterion.startsWith('head_to_head_')&&criterion!=='manual_draw');
  const metric=(id:string,criterion:string)=>{const row=totals.get(id)!;switch(criterion){case 'wins':return row.wins;case 'goal_difference':return row.goalDifference;case 'goals_for':return row.goalsFor;case 'goals_against':return -row.goalsAgainst;case 'yellow_cards':return -row.yellowCards;case 'red_cards':return -row.redCards;default:return 0;}};
  const same=(left:string,right:string)=>totals.get(left)!.points===totals.get(right)!.points&&criteria.every((criterion)=>metric(left,criterion)===metric(right,criterion));
  const remaining = ranked.flatMap((ids) => ids.slice(qualification.perGroup)).sort((left,right) => {
    const points=totals.get(right)!.points-totals.get(left)!.points;
    if(points)return points;
    for(const criterion of criteria){const difference=metric(right,criterion)-metric(left,criterion);if(difference)return difference;}
    return left.localeCompare(right);
  });
  if (qualification.bestRemaining > remaining.length) return null;
  let tieCandidates:string[]=[];
  const cut=qualification.bestRemaining;
  if(cut && cut<remaining.length && same(remaining[cut-1],remaining[cut])){
    let start=cut-1,end=cut;
    while(start>0&&same(remaining[start-1],remaining[cut]))start--;
    while(end+1<remaining.length&&same(remaining[end+1],remaining[cut]))end++;
    tieCandidates=remaining.slice(start,end+1);
  }
  return {selected,remaining,tieCandidates};
}
export function bestRemainingTie(projection:CategoryStatistics,qualification:Extract<Qualification,{from:'groups'}>,tiebreakers:string[]):string[]{return groupRanking(projection,qualification,tiebreakers)?.tieCandidates||[];}
export function qualifiedEntries(projection: CategoryStatistics, qualification: Qualification, tiebreakers: string[], manualOrder?:string[]): string[] | null {
  if(qualification.from==='league'){
    const tables=projection.tables;
    if(tables.length!==1||tables[0].groups.some(group=>group.unresolved))return null;
    const ranked=tables[0].groups.flatMap(group=>group.teamIds);
    return ranked.length>=qualification.top?ranked.slice(0,qualification.top):null;
  }
  const ranking=groupRanking(projection,qualification,tiebreakers);if(!ranking)return null;
  if(ranking.tieCandidates.length){
    if(!tiebreakers.includes('manual_draw')||!manualOrder||manualOrder.length!==ranking.tieCandidates.length||new Set(manualOrder).size!==manualOrder.length||manualOrder.some(id=>!ranking.tieCandidates.includes(id)))return null;
    const start=ranking.remaining.indexOf(ranking.tieCandidates[0]);
    ranking.remaining.splice(start,ranking.tieCandidates.length,...manualOrder);
  }else if(manualOrder?.length)return null;
  return [...ranking.selected,...ranking.remaining.slice(0,qualification.bestRemaining)];
}
