ALTER TABLE player_registrations ADD CONSTRAINT player_registrations_entry_identity UNIQUE (organization_id,entry_id,id);

CREATE TABLE player_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 2 AND 80),
  filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 2097152),
  checksum text NOT NULL CHECK (length(checksum)=64),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','approved','rejected')),
  review_reason text,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  FOREIGN KEY (organization_id,entry_id,registration_id) REFERENCES player_registrations(organization_id,entry_id,id),
  UNIQUE (organization_id,id),
  CHECK ((status='uploaded')=(reviewed_at IS NULL)),
  CHECK ((status='uploaded')=(reviewed_by IS NULL)),
  CHECK ((status='uploaded')=(review_reason IS NULL))
);
CREATE INDEX player_documents_registration_idx ON player_documents(organization_id,entry_id,registration_id,label,uploaded_at DESC);

CREATE TABLE player_movements (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('transfer','loan')),
  starts_on date NOT NULL,
  ends_on date,
  status text NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','approved','rejected')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  declared_by uuid NOT NULL REFERENCES users(id),
  declared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  FOREIGN KEY (organization_id,entry_id,registration_id) REFERENCES player_registrations(organization_id,entry_id,id),
  UNIQUE (organization_id,id),
  CHECK (ends_on IS NULL OR ends_on>=starts_on),
  CHECK (kind<>'loan' OR ends_on IS NOT NULL),
  CHECK ((status='declared')=(reviewed_at IS NULL)),
  CHECK ((status='declared')=(reviewed_by IS NULL)),
  CHECK ((status='declared')=(review_reason IS NULL))
);
CREATE INDEX player_movements_registration_idx ON player_movements(organization_id,entry_id,registration_id,declared_at DESC);

CREATE TABLE player_restrictions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid REFERENCES users(id),
  lift_reason text,
  FOREIGN KEY (organization_id,entry_id,registration_id) REFERENCES player_registrations(organization_id,entry_id,id),
  UNIQUE (organization_id,id),
  CHECK (ends_on IS NULL OR ends_on>=starts_on),
  CHECK ((lifted_at IS NULL AND lifted_by IS NULL AND lift_reason IS NULL) OR (lifted_at IS NOT NULL AND lifted_by IS NOT NULL AND length(lift_reason) BETWEEN 3 AND 300))
);
CREATE INDEX player_restrictions_registration_idx ON player_restrictions(organization_id,entry_id,registration_id) WHERE lifted_at IS NULL;
