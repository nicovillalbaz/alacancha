import type { RuleConfig } from './index.ts';

export interface RankedMatch {
  homeTeamId: string;
  awayTeamId: string;
  status: 'official' | 'provisional';
  homeGoals: number;
  awayGoals: number;
  homePoints: number;
  awayPoints: number;
  homeYellowCards: number;
  awayYellowCards: number;
  homeRedCards: number;
  awayRedCards: number;
}
export interface StandingTotals {
  teamId: string;
  played: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  yellowCards: number;
  redCards: number;
}
export interface StandingGroup { position: number; teamIds: string[]; unresolved: boolean }
type Breaker = NonNullable<RuleConfig['advanced']>['tiebreakers'][number];

function totals(teamIds: string[], matches: RankedMatch[], includeExternalOpponents = false): Map<string, StandingTotals> {
  const result = new Map(teamIds.map((teamId) => [teamId, { teamId, played: 0, points: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, yellowCards: 0, redCards: 0 }]));
  for (const match of matches) {
    if (match.status !== 'official') continue;
    const home = result.get(match.homeTeamId), away = result.get(match.awayTeamId);
    if ((!home || !away) && !includeExternalOpponents || home === away) continue;
    if (home) {
      home.played++; home.points += match.homePoints;
      if (match.homeGoals > match.awayGoals) home.wins++; else if (match.homeGoals < match.awayGoals) home.losses++; else home.draws++;
      home.goalsFor += match.homeGoals; home.goalsAgainst += match.awayGoals;
      home.goalDifference += match.homeGoals - match.awayGoals;
      home.yellowCards += match.homeYellowCards; home.redCards += match.homeRedCards;
    }
    if (away) {
      away.played++; away.points += match.awayPoints;
      if (match.awayGoals > match.homeGoals) away.wins++; else if (match.awayGoals < match.homeGoals) away.losses++; else away.draws++;
      away.goalsFor += match.awayGoals; away.goalsAgainst += match.homeGoals;
      away.goalDifference += match.awayGoals - match.homeGoals;
      away.yellowCards += match.awayYellowCards; away.redCards += match.awayRedCards;
    }
  }
  return result;
}

/** Un criterio «entre sí» se recalcula para el subconjunto que continúa empatado. */
export function rankStandings(teamIds: string[], matches: RankedMatch[], order: Breaker[], pointAdjustments: ReadonlyMap<string,number> = new Map(), options: { includeExternalOpponents?: boolean } = {}): { totals: StandingTotals[]; groups: StandingGroup[] } {
  if (new Set(teamIds).size !== teamIds.length) throw new Error('No repitas equipos en una tabla.');
  const official = matches.filter((match) => match.status === 'official');
  const full = totals(teamIds, official, options.includeExternalOpponents);
  for (const [teamId, delta] of pointAdjustments) { const row = full.get(teamId); if (row) row.points += delta; }
  const criteria: Breaker[] = ['head_to_head_points', 'head_to_head_wins', 'head_to_head_goal_difference', 'head_to_head_goals_for', 'head_to_head_goals_against', 'wins', 'goal_difference', 'goals_for', 'goals_against', 'yellow_cards', 'red_cards', 'manual_draw'];
  if (!order.length || new Set(order).size !== order.length || order.some((criterion) => !criteria.includes(criterion)) || (order.includes('manual_draw') && order.at(-1) !== 'manual_draw')) throw new Error('La jerarquía de desempates es inválida.');
  const metric = (row: StandingTotals, criterion: Breaker) => {
    switch (criterion) {
      case 'head_to_head_points': return row.points;
      case 'head_to_head_wins': case 'wins': return row.wins;
      case 'head_to_head_goal_difference': case 'goal_difference': return row.goalDifference;
      case 'head_to_head_goals_for': case 'goals_for': return row.goalsFor;
      case 'head_to_head_goals_against': case 'goals_against': return -row.goalsAgainst;
      case 'yellow_cards': return -row.yellowCards;
      case 'red_cards': return -row.redCards;
      case 'manual_draw': return 0;
    }
  };
  const recurse = (ids: string[], index: number, position: number): StandingGroup[] => {
    if (ids.length === 1) return [{ position, teamIds: ids, unresolved: false }];
    const criterion = order[index];
    if (!criterion || criterion === 'manual_draw') return [{ position, teamIds: [...ids].sort(), unresolved: true }];
    const headToHead = criterion.startsWith('head_to_head_');
    const compared = headToHead ? totals(ids, official) : full;
    const buckets = new Map<number, string[]>();
    for (const id of ids) {
      const value = metric(compared.get(id)!, criterion);
      buckets.set(value, [...(buckets.get(value) || []), id]);
    }
    let offset = 0;
    return [...buckets.keys()].sort((a, b) => b - a).flatMap((value) => {
      const bucket = buckets.get(value)!;
      const ranked = recurse(bucket, index + 1, position + offset);
      offset += bucket.length;
      return ranked;
    });
  };
  const byPoints = new Map<number, string[]>();
  for (const teamId of teamIds) {
    const points = full.get(teamId)!.points;
    byPoints.set(points, [...(byPoints.get(points) || []), teamId]);
  }
  let position = 1;
  const groups = [...byPoints.keys()].sort((a, b) => b - a).flatMap((points) => {
    const ids = byPoints.get(points)!;
    const result = recurse(ids, 0, position);
    position += ids.length;
    return result;
  });
  return { totals: [...full.values()], groups };
}
