CREATE TABLE player_import_batches (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported','reverted')),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 100),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reverted_by uuid REFERENCES users(id),
  reverted_at timestamptz,
  revert_reason text,
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id),
  CHECK ((status='reverted')=(reverted_at IS NOT NULL)),
  CHECK ((status='reverted')=(reverted_by IS NOT NULL)),
  CHECK ((status='reverted')=(revert_reason IS NOT NULL))
);
ALTER TABLE player_registrations ADD COLUMN import_batch_id uuid;
ALTER TABLE player_registrations ADD COLUMN reverted_at timestamptz;
ALTER TABLE player_registrations ADD CONSTRAINT player_registration_import_batch_fk FOREIGN KEY (organization_id,import_batch_id) REFERENCES player_import_batches(organization_id,id);
DROP INDEX player_registrations_card_idx;
CREATE UNIQUE INDEX player_registrations_card_idx ON player_registrations(organization_id,entry_id,lower(registration_number)) WHERE reverted_at IS NULL;
CREATE INDEX player_registrations_import_idx ON player_registrations(organization_id,import_batch_id) WHERE import_batch_id IS NOT NULL;
