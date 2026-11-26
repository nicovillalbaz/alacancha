export type AnnouncedPair = { homeEntryId: string; awayEntryId: string };
export type AnnouncedRound = { ordinal: number; date?: string; matches: AnnouncedPair[]; legacyHomeOrder?: string[] };
export const playoffStages = [
  { key: 'quarterfinal', size: 8, label: 'Cuartos' },
  { key: 'semifinal', size: 4, label: 'Semifinales' },
  { key: 'final', size: 2, label: 'Final' },
] as const;
type PlayoffDates = Partial<Record<(typeof playoffStages)[number]['key'], string>>;
export type AnnouncedFixture = {
  revision: number;
  rounds: AnnouncedRound[];
  playoffDates?: PlayoffDates;
  qualificationCount: number;
  quarterPairing: 'in_person_draw';
  semifinalPairing: 'pending' | 'in_person_draw' | 'bracket';
  finalPairing: 'winners';
  teams: Array<{ entry_id: string; team_id: string; name: string; color: string; has_shield: boolean }>;
};

export function announcedDate(date: string) {
  const [year,month,day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function playoffDatesBySize(dates?: PlayoffDates) {
  return Object.fromEntries(playoffStages.flatMap(({key,size})=>dates?.[key]?[[size,dates[key]]]:[]));
}

export function resolveAnnouncedPair(rounds: AnnouncedRound[], id: string) {
  const [ordinal,home] = id.split('.');
  if (home) {
    const number = Number(ordinal);
    const pair = rounds.find(round=>round.ordinal===number)?.matches.find(match=>match.homeEntryId===home);
    return pair ? { ordinal:number,pair } : undefined;
  }
  const [number,index] = id.split('-').map(Number);
  const round=rounds.find(item=>item.ordinal===number);
  const legacy=round?.legacyHomeOrder?.[index-1];
  const pair=legacy?round?.matches.find(match=>match.homeEntryId===legacy):round?.matches[index-1];
  return pair ? { ordinal:number,pair } : undefined;
}
