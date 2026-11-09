-- T06: propuestas y decisiones deportivas. Ninguna tarjeta suspende por sí sola.
ALTER TABLE match_record_events ADD CONSTRAINT match_record_event_org_id UNIQUE (organization_id,id);

CREATE TABLE discipline_cases (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  registration_id uuid,
  match_id uuid,
  event_id uuid,
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 5 AND 160),
  source_kind text NOT NULL CHECK (source_kind IN ('red','second_yellow','yellow_accumulation','incident','manual')),
  source_valid boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','review','decided','appealed','revoked')),
  summary text NOT NULL CHECK (length(summary) BETWEEN 3 AND 500),
  evidence_note text CHECK (evidence_note IS NULL OR length(evidence_note) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,entry_id,registration_id) REFERENCES player_registrations(organization_id,entry_id,id),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,event_id) REFERENCES match_record_events(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,source_key),
  CHECK ((source_kind='manual' AND match_id IS NULL AND event_id IS NULL) OR (source_kind<>'manual' AND match_id IS NOT NULL)),
  CHECK (source_kind<>'yellow_accumulation' OR registration_id IS NOT NULL)
);
CREATE INDEX discipline_cases_entry_idx ON discipline_cases(organization_id,entry_id,status,created_at DESC);

CREATE TABLE discipline_case_actions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('proposed','reviewed','decided','appealed','appeal_confirmed','revoked','notified')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail)='object'),
  actor_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,case_id) REFERENCES discipline_cases(organization_id,id)
);
CREATE INDEX discipline_case_actions_order ON discipline_case_actions(organization_id,case_id,created_at,id);
CREATE TRIGGER discipline_actions_immutable BEFORE UPDATE OR DELETE ON discipline_case_actions FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();

CREATE TABLE discipline_fine_catalog (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,30}$'),
  version integer NOT NULL CHECK (version > 0),
  label text NOT NULL CHECK (length(label) BETWEEN 3 AND 120),
  amount_guaranies integer NOT NULL CHECK (amount_guaranies BETWEEN 0 AND 1000000000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,category_id,code,version)
);
CREATE TRIGGER discipline_catalog_immutable BEFORE UPDATE OR DELETE ON discipline_fine_catalog FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();

CREATE TABLE discipline_decisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL,
  suspension_unit text CHECK (suspension_unit IN ('matches','date_range')),
  suspension_matches integer CHECK (suspension_matches BETWEEN 1 AND 100),
  starts_on date,
  ends_on date,
  fine_catalog_id uuid,
  fine_amount_guaranies integer CHECK (fine_amount_guaranies BETWEEN 0 AND 1000000000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  decided_by uuid NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revoke_reason text,
  FOREIGN KEY (organization_id,case_id) REFERENCES discipline_cases(organization_id,id),
  FOREIGN KEY (organization_id,fine_catalog_id) REFERENCES discipline_fine_catalog(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,case_id),
  CHECK ((suspension_unit IS NULL AND suspension_matches IS NULL AND starts_on IS NULL AND ends_on IS NULL)
    OR (suspension_unit='matches' AND suspension_matches IS NOT NULL AND starts_on IS NOT NULL AND ends_on IS NULL)
    OR (suspension_unit='date_range' AND suspension_matches IS NULL AND starts_on IS NOT NULL AND ends_on IS NOT NULL AND ends_on>=starts_on)),
  CHECK ((fine_catalog_id IS NULL)=(fine_amount_guaranies IS NULL)),
  CHECK ((status='active' AND revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL))
);

CREATE TABLE discipline_notices (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  case_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('decision','appeal','revocation')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_by uuid REFERENCES users(id),
  read_at timestamptz,
  FOREIGN KEY (organization_id,case_id) REFERENCES discipline_cases(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id)
);
CREATE INDEX discipline_notices_entry ON discipline_notices(organization_id,entry_id,created_at DESC);
