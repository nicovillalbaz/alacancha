ALTER TABLE players ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0);

CREATE TABLE player_identity_changes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  player_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision>1),
  before_ciphertext text NOT NULL,
  after_ciphertext text NOT NULL,
  changed_fields text[] NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,player_id) REFERENCES players(organization_id,id),
  UNIQUE (organization_id,player_id,revision)
);
CREATE INDEX player_identity_changes_player_idx ON player_identity_changes(organization_id,player_id,revision DESC);
