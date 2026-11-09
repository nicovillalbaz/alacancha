export type MatchEventKind = 'goal' | 'penalty' | 'own_goal' | 'yellow' | 'second_yellow' | 'red' | 'custom_card' | 'substitution' | 'incident' | 'shootout_goal' | 'shootout_miss' | 'void';
export interface MatchJournalEvent {
  id: string;
  sequence: number;
  kind: MatchEventKind;
  teamEntryId: string | null;
  registrationId: string | null;
  relatedRegistrationId: string | null;
  period: string | null;
  minute: number | null;
  windowNo: number | null;
  incidentNote: string | null;
  cardCode?: string | null;
  voidsEventId: string | null;
  reason: string | null;
  recordedAt: string;
}
export function projectMatchJournal(events: MatchJournalEvent[], homeEntryId: string, awayEntryId: string) {
  const voided = new Set(events.filter((event) => event.kind === 'void').map((event) => event.voidsEventId));
  const active = events.filter((event) => event.kind !== 'void' && !voided.has(event.id));
  const score = { home: 0, away: 0 }, shootout = { home: 0, away: 0 };
  let unattributedGoals = 0;
  for (const event of active) {
    const beneficiary = event.kind === 'own_goal' ? (event.teamEntryId === homeEntryId ? awayEntryId : homeEntryId) : event.teamEntryId;
    const side = beneficiary === homeEntryId ? 'home' : beneficiary === awayEntryId ? 'away' : null;
    if (!side) continue;
    if (['goal','penalty','own_goal'].includes(event.kind)) {
      score[side]++;
      if (!event.registrationId) unattributedGoals++;
    } else if (event.kind === 'shootout_goal') shootout[side]++;
  }
  return { active, score, shootout, unattributedGoals };
}
