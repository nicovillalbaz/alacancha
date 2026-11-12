ALTER TABLE tournaments ADD COLUMN public_preview_at timestamptz;

CREATE INDEX tournaments_public_preview_idx
  ON tournaments (organization_id, public_preview_at)
  WHERE public_preview_at IS NOT NULL;
