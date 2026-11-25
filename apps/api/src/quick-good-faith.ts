import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { audit } from '@torneos/db';

type Member = {
  registrationId: string;
  playerId: string;
  givenNames: string;
  familyNames: string;
  birthDate: string | null;
  registrationNumber: string | null;
  originKind: string;
};
type Version = {
  id: string;
  version: number;
  status: string;
  snapshot: Member[];
  submit_reason: string;
  submitted_by: string;
  submitted_at: Date;
};

export async function includeQuickPlayers(
  client: PoolClient, organizationId: string, entryId: string, registrationIds: string[], actorId: string, reason: string,
) {
  await client.query('SELECT id FROM team_entries WHERE organization_id=$1 AND id=$2 FOR UPDATE', [organizationId, entryId]);
  const { rows: [latest] } = await client.query<Version>(`SELECT * FROM good_faith_versions
    WHERE organization_id=$1 AND entry_id=$2 ORDER BY version DESC LIMIT 1`, [organizationId, entryId]);
  const { rows: [approved] } = await client.query<Version>(`SELECT * FROM good_faith_versions
    WHERE organization_id=$1 AND entry_id=$2 AND status='approved' ORDER BY version DESC LIMIT 1`, [organizationId, entryId]);
  const approvedMembers = approved?.snapshot ?? [];
  const missingIds = registrationIds.filter(id => !approvedMembers.some(member => member.registrationId === id));
  if (!missingIds.length) return false;

  const { rows: additions } = await client.query<Member>(`SELECT pr.id "registrationId",pr.player_id "playerId",p.given_names "givenNames",
    p.family_names "familyNames",to_char(p.birth_date,'YYYY-MM-DD') "birthDate",pr.registration_number "registrationNumber",pr.origin_kind "originKind"
    FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
    WHERE pr.organization_id=$1 AND pr.entry_id=$2 AND pr.id=ANY($3::uuid[]) AND pr.status='approved' AND pr.reverted_at IS NULL
    ORDER BY pr.created_at,pr.id`, [organizationId, entryId, missingIds]);
  if (!additions.length) return false;

  const versionId = randomUUID(), version = (latest?.version ?? 0) + 1;
  const approvedSnapshot = [...approvedMembers, ...additions];
  await client.query(`INSERT INTO good_faith_versions(id,organization_id,entry_id,version,status,snapshot,submit_reason,submitted_by,review_reason,reviewed_by,reviewed_at)
    VALUES($1,$2,$3,$4,'approved',$5,$6,$7,$6,$7,now())`, [versionId, organizationId, entryId, version, JSON.stringify(approvedSnapshot), reason, actorId]);
  await audit(client, actorId, organizationId, 'good_faith.approved_by_match', versionId, reason, null,
    { entryId, version, registrationIds: additions.map(member => member.registrationId) });

  if (latest?.status === 'submitted') {
    const pendingId = randomUUID();
    const pendingSnapshot = [...latest.snapshot, ...additions.filter(member => !latest.snapshot.some(pending => pending.registrationId === member.registrationId))];
    const superseded = 'La misma revisión continúa en una versión que incluye el alta por partido.';
    await client.query(`UPDATE good_faith_versions SET status='observed',review_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1`,
      [latest.id, superseded, actorId]);
    await client.query(`INSERT INTO good_faith_versions(id,organization_id,entry_id,version,snapshot,submit_reason,submitted_by,submitted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [pendingId, organizationId, entryId, version + 1, JSON.stringify(pendingSnapshot), latest.submit_reason, latest.submitted_by, latest.submitted_at]);
    await audit(client, actorId, organizationId, 'good_faith.review_carried_forward', latest.id, superseded, { version: latest.version },
      { entryId, version: version + 1, id: pendingId });
  }
  return true;
}
