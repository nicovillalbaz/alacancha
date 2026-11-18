-- Regulariza solo altas rápidas de Caacupé presentes en eventos vigentes de actas oficiales.
-- Ejecutar después de respaldo y restauración de ensayo. No altera nombres ocultados manualmente.
BEGIN;
CREATE TEMP TABLE quick_approval_candidates ON COMMIT DROP AS
SELECT DISTINCT a.organization_id,a.resource_id registration_id,pr.entry_id,s.created_by actor_id
FROM audit_logs a
JOIN player_registrations pr ON pr.organization_id=a.organization_id AND pr.id=a.resource_id
JOIN match_records r ON r.organization_id=a.organization_id
  AND r.match_id::text=a.after_data->>'matchId' AND r.status='official'
JOIN match_acta_snapshots s ON s.organization_id=r.organization_id
  AND s.id=r.approval_id AND s.kind='approved'
CROSS JOIN LATERAL jsonb_array_elements(s.snapshot->'events') e
WHERE a.organization_id='85b89c2d-d78a-4a23-81e3-ce0ba9272c40'::uuid
  AND a.action='match.quick_player_created'
  AND pr.reverted_at IS NULL AND pr.status IN ('draft','submitted')
  AND e->>'registrationId'=a.resource_id::text AND e->>'kind'<>'void'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(s.snapshot->'events') v
    WHERE v->>'kind'='void' AND v->>'voidsEventId'=e->>'id'
  );
DO $$ BEGIN
  IF (SELECT count(*) FROM quick_approval_candidates)>20 THEN
    RAISE EXCEPTION 'Más de 20 jugadores elegibles: revisar el alcance antes de continuar';
  END IF;
  IF EXISTS (SELECT 1 FROM good_faith_versions g JOIN quick_approval_candidates c
    ON c.organization_id=g.organization_id AND c.entry_id=g.entry_id
    WHERE g.status='submitted') THEN
    RAISE EXCEPTION 'Hay una lista de buena fe en revisión: resolverla antes de regularizar';
  END IF;
END $$;
SELECT e.id FROM team_entries e JOIN (SELECT DISTINCT organization_id,entry_id FROM quick_approval_candidates) c
  ON c.organization_id=e.organization_id AND c.entry_id=e.id FOR UPDATE OF e;
UPDATE player_registrations pr SET status='approved',revision=revision+1,updated_at=now()
FROM quick_approval_candidates c
WHERE pr.organization_id=c.organization_id AND pr.id=c.registration_id
  AND pr.status IN ('draft','submitted');
INSERT INTO audit_logs(id,actor_id,organization_id,action,resource_id,reason,before_data,after_data)
SELECT gen_random_uuid(),c.actor_id,c.organization_id,'match.quick_player_approved',c.registration_id,
  'Regularización de alta por acta oficial',jsonb_build_object('status','draft'),
  jsonb_build_object('status','approved','entryId',c.entry_id)
FROM quick_approval_candidates c;

CREATE TEMP TABLE quick_approval_versions ON COMMIT DROP AS
SELECT gen_random_uuid() id,c.organization_id,c.entry_id,
  COALESCE((SELECT max(g.version) FROM good_faith_versions g
    WHERE g.organization_id=c.organization_id AND g.entry_id=c.entry_id),0)+1 version,
  (SELECT q.actor_id FROM quick_approval_candidates q WHERE q.organization_id=c.organization_id
    AND q.entry_id=c.entry_id ORDER BY q.registration_id LIMIT 1) actor_id
FROM (SELECT DISTINCT organization_id,entry_id FROM quick_approval_candidates) c
WHERE NOT EXISTS (SELECT 1 FROM good_faith_versions g WHERE g.organization_id=c.organization_id
  AND g.entry_id=c.entry_id AND g.status='approved');
INSERT INTO good_faith_versions(id,organization_id,entry_id,version,status,snapshot,submit_reason,
  submitted_by,review_reason,reviewed_by,reviewed_at)
SELECT v.id,v.organization_id,v.entry_id,v.version,'approved',
  (SELECT jsonb_agg(jsonb_build_object('registrationId',pr.id,'playerId',pr.player_id,
    'givenNames',p.given_names,'familyNames',p.family_names,
    'birthDate',to_char(p.birth_date,'YYYY-MM-DD'),'registrationNumber',pr.registration_number,
    'originKind',pr.origin_kind) ORDER BY pr.created_at,pr.id)
   FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id
   WHERE pr.organization_id=v.organization_id AND pr.entry_id=v.entry_id
     AND pr.status='approved' AND pr.reverted_at IS NULL),
  'Alta por acta oficial',v.actor_id,'Aprobación del acta oficial',v.actor_id,now()
FROM quick_approval_versions v;
INSERT INTO audit_logs(id,actor_id,organization_id,action,resource_id,reason,before_data,after_data)
SELECT gen_random_uuid(),v.actor_id,v.organization_id,'good_faith.approved_by_match',v.id,
  'Regularización de alta por acta oficial',NULL,
  jsonb_build_object('entryId',v.entry_id,'version',v.version)
FROM quick_approval_versions v;
SELECT (SELECT count(*) FROM quick_approval_candidates) approved_players,
  (SELECT count(*) FROM quick_approval_versions) new_team_lists;
COMMIT;
