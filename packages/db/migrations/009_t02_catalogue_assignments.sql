ALTER TABLE team_admin_assignments ADD COLUMN revoked_at timestamptz;
ALTER TABLE team_admin_assignments ADD COLUMN revoked_by uuid REFERENCES users(id);
ALTER TABLE team_admin_assignments ADD COLUMN revocation_reason text;
ALTER TABLE team_admin_assignments ADD CONSTRAINT team_admin_revocation_complete CHECK (
  (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(revocation_reason) BETWEEN 3 AND 300)
);
CREATE INDEX team_admin_active_scope_idx ON team_admin_assignments(organization_id,membership_id,entry_id) WHERE revoked_at IS NULL;

CREATE TABLE tournament_venues (
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  venue_id uuid NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (organization_id,tournament_id,venue_id),
  FOREIGN KEY (organization_id,tournament_id) REFERENCES tournaments(organization_id,id),
  FOREIGN KEY (organization_id,venue_id) REFERENCES venues(organization_id,id)
);
CREATE INDEX tournament_venues_scope_idx ON tournament_venues(organization_id,tournament_id) WHERE archived_at IS NULL;

CREATE TABLE tournament_sponsors (
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  sponsor_id uuid NOT NULL,
  public_visible boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  PRIMARY KEY (organization_id,tournament_id,sponsor_id),
  FOREIGN KEY (organization_id,tournament_id) REFERENCES tournaments(organization_id,id),
  FOREIGN KEY (organization_id,sponsor_id) REFERENCES sponsors(organization_id,id)
);
CREATE INDEX tournament_sponsors_scope_idx ON tournament_sponsors(organization_id,tournament_id) WHERE archived_at IS NULL;
