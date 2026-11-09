-- Catálogo privado de árbitros por organización; conserva nombres libres anteriores.
CREATE TABLE fixture_referees (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  archived_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX fixture_referees_active_name_idx ON fixture_referees(organization_id,lower(trim(name))) WHERE archived_at IS NULL;
ALTER TABLE draft_matches ADD COLUMN referee_id uuid;
ALTER TABLE draft_matches ADD CONSTRAINT draft_match_referee_fk FOREIGN KEY (organization_id,referee_id) REFERENCES fixture_referees(organization_id,id);
CREATE INDEX draft_matches_referee_time_idx ON draft_matches(organization_id,referee_id,starts_at) WHERE referee_id IS NOT NULL AND starts_at IS NOT NULL;
