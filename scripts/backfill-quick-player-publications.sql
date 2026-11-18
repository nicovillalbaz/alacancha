-- Ejecutar solo después de respaldo y ensayo de restauración.
-- El acta oficial y su evento vigente autorizan el nombre del alta rápida.
-- Una decisión previa, incluso de ocultación, nunca se sobrescribe.
BEGIN;
WITH quick AS (
  SELECT a.organization_id, a.resource_id registration_id, a.actor_id,
    a.after_data->>'matchId' match_id
  FROM audit_logs a WHERE a.action='match.quick_player_created'
), eligible AS (
  SELECT DISTINCT ON (q.organization_id,q.registration_id)
    q.organization_id,q.registration_id,q.actor_id
  FROM quick q
  JOIN player_registrations pr ON pr.organization_id=q.organization_id
    AND pr.id=q.registration_id AND pr.reverted_at IS NULL
  JOIN match_records r ON r.organization_id=q.organization_id
    AND r.match_id::text=q.match_id AND r.status='official'
  JOIN match_acta_snapshots s ON s.organization_id=r.organization_id
    AND s.id=r.approval_id AND s.kind='approved'
  CROSS JOIN LATERAL jsonb_array_elements(s.snapshot->'events') e
  WHERE e->>'registrationId'=q.registration_id::text AND e->>'kind'<>'void'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(s.snapshot->'events') v
      WHERE v->>'kind'='void' AND v->>'voidsEventId'=e->>'id'
    )
  ORDER BY q.organization_id,q.registration_id
), inserted AS (
  INSERT INTO player_publications(organization_id,registration_id,visible,reason,decided_by)
  SELECT organization_id,registration_id,true,
    'Nombre publicado con el acta oficial del partido',actor_id
  FROM eligible
  ON CONFLICT (organization_id,registration_id) DO NOTHING
  RETURNING organization_id,registration_id,decided_by
), logged AS (
  INSERT INTO audit_logs(id,actor_id,organization_id,action,resource_id,reason,before_data,after_data)
  SELECT gen_random_uuid(),decided_by,organization_id,
    'match.quick_player_name_backfilled',registration_id,
    'Regularización del nombre en un acta oficial vigente',NULL,
    jsonb_build_object('visible',true)
  FROM inserted
  RETURNING id
)
SELECT (SELECT count(*) FROM eligible) eligible,
  (SELECT count(*) FROM inserted) published,
  (SELECT count(*) FROM logged) audited;
COMMIT;
