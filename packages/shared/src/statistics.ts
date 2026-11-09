import { projectMatchJournal, type MatchJournalEvent } from './match.ts';
import { rankStandings, type RankedMatch, type StandingGroup, type StandingTotals } from './standings.ts';
import type { RuleConfig } from './index.ts';

export interface OfficialStatMatch {
  id: string;
  homeEntryId: string;
  awayEntryId: string;
  groupNo: number | null;
  tableEligible: boolean;
  score: { home: number; away: number };
  events: MatchJournalEvent[];
  homeRoster: string[];
  awayRoster: string[];
}
export interface StatEntry { id: string; name: string; groupNo: number | null }
export interface PlayerStat { registrationId: string; entryId: string; goals: number; penalties: number; ownGoals: number; yellowCards: number; redCards: number; appearances: number }
export interface TableStat { groupNo: number | null; totals: StandingTotals[]; groups: StandingGroup[] }

/** Rebuilds from immutable approved actas. A voided event never contributes twice. */
export function deriveOfficialStatistics(entries: StatEntry[], matches: OfficialStatMatch[], rules: RuleConfig, pointAdjustments: ReadonlyMap<string,number> = new Map()): { tables: TableStat[]; players: PlayerStat[]; rankedMatches: RankedMatch[] } {
  const byPlayer = new Map<string, PlayerStat>();
  const ensure = (registrationId: string, entryId: string) => {
    const key = `${entryId}:${registrationId}`;
    let row = byPlayer.get(key);
    if (!row) { row = { registrationId, entryId, goals: 0, penalties: 0, ownGoals: 0, yellowCards: 0, redCards: 0, appearances: 0 }; byPlayer.set(key, row); }
    return row;
  };
  const rankedMatches: RankedMatch[] = [];
  for (const match of matches) {
    const journal = projectMatchJournal(match.events, match.homeEntryId, match.awayEntryId);
    if (journal.score.home !== match.score.home || journal.score.away !== match.score.away) throw new Error(`El acta ${match.id} no coincide con sus eventos.`);
    for (const registrationId of new Set(match.homeRoster)) ensure(registrationId, match.homeEntryId).appearances++;
    for (const registrationId of new Set(match.awayRoster)) ensure(registrationId, match.awayEntryId).appearances++;
    let homeYellow = 0, awayYellow = 0, homeRed = 0, awayRed = 0;
    for (const event of journal.active) {
      if (!event.teamEntryId || ![match.homeEntryId, match.awayEntryId].includes(event.teamEntryId)) continue;
      if (event.registrationId) {
        const row = ensure(event.registrationId, event.teamEntryId);
        if (event.kind === 'goal' || event.kind === 'penalty') { row.goals++; if (event.kind === 'penalty') row.penalties++; }
        if (event.kind === 'own_goal') row.ownGoals++;
        if (event.kind === 'yellow' || event.kind === 'second_yellow') row.yellowCards++;
        if (event.kind === 'red' || event.kind === 'second_yellow') row.redCards++;
      }
      if (event.kind === 'yellow' || event.kind === 'second_yellow') event.teamEntryId === match.homeEntryId ? homeYellow++ : awayYellow++;
      if (event.kind === 'red' || event.kind === 'second_yellow') event.teamEntryId === match.homeEntryId ? homeRed++ : awayRed++;
    }
    const home = match.score.home, away = match.score.away;
    rankedMatches.push({ homeTeamId: match.homeEntryId, awayTeamId: match.awayEntryId, status: 'official', homeGoals: home, awayGoals: away,
      homePoints: home > away ? rules.points.win : home === away ? rules.points.draw : rules.points.loss,
      awayPoints: away > home ? rules.points.win : home === away ? rules.points.draw : rules.points.loss,
      homeYellowCards: homeYellow, awayYellowCards: awayYellow, homeRedCards: homeRed, awayRedCards: awayRed });
  }
  const groupNumbers = [...new Set(entries.map((entry) => entry.groupNo))].sort((a, b) => (a ?? 0) - (b ?? 0));
  const tables = groupNumbers.map((groupNo) => {
    const ids = entries.filter((entry) => entry.groupNo === groupNo).map((entry) => entry.id);
    const groupMatches = matches.flatMap((match, index) => match.tableEligible && match.groupNo === groupNo ? [rankedMatches[index]] : []);
    const result = rankStandings(ids, groupMatches, rules.advanced?.tiebreakers || ['manual_draw'], pointAdjustments);
    return { groupNo, ...result };
  });
  return { tables, players: [...byPlayer.values()].sort((a, b) => b.goals - a.goals || a.registrationId.localeCompare(b.registrationId)), rankedMatches };
}
