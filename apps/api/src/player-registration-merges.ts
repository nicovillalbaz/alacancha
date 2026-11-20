import type { PoolClient } from 'pg';
import type { DatabasePool } from '@torneos/db';
import type { MatchJournalEvent } from '@torneos/shared';

type Scope = { categoryId: string } | { entryIds: string[] };

export async function registrationMerges(db: DatabasePool | PoolClient, organizationId: string, scope: Scope) {
  const predicate = 'categoryId' in scope
    ? 'AND EXISTS (SELECT 1 FROM team_entries te WHERE te.organization_id=$1 AND te.id=pr.entry_id AND te.category_id=$2)'
    : 'AND pr.entry_id=ANY($2::uuid[])';
  const scopeValue = 'categoryId' in scope ? scope.categoryId : scope.entryIds;
  const { rows } = await db.query<{id:string; merged_into_registration_id:string}>(`
    SELECT pr.id,pr.merged_into_registration_id FROM player_registrations pr
    WHERE pr.organization_id=$1 AND pr.merged_into_registration_id IS NOT NULL ${predicate}
    ORDER BY pr.id`, [organizationId, scopeValue]);
  return new Map(rows.map(row => [row.id, row.merged_into_registration_id]));
}

export function canonicalRegistrationId(merges: ReadonlyMap<string,string>, registrationId: string) {
  if (!merges.has(registrationId)) return registrationId;
  let current = registrationId;
  const seen = new Set<string>();
  while (merges.has(current)) {
    if (seen.has(current)) return registrationId;
    seen.add(current);
    current = merges.get(current)!;
  }
  return current;
}

export function attributeMatchEvents(events: MatchJournalEvent[], merges: ReadonlyMap<string,string>) {
  if (!merges.size) return events;
  return events.map(event => ({
    ...event,
    registrationId: event.registrationId ? canonicalRegistrationId(merges,event.registrationId) : null,
    relatedRegistrationId: event.relatedRegistrationId ? canonicalRegistrationId(merges,event.relatedRegistrationId) : event.relatedRegistrationId,
  }));
}
