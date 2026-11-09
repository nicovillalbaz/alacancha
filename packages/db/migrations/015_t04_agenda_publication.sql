-- T04: jornadas de edición, agenda e historial sin alterar partidos ni planillas T03.
CREATE TABLE matchdays (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  edition_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 999),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES users(id),
  published_at timestamptz,
  FOREIGN KEY (organization_id,edition_id) REFERENCES editions(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,id,edition_id),
  UNIQUE (organization_id,edition_id,ordinal),
  CHECK ((status='published')=(published_at IS NOT NULL))
);

ALTER TABLE draft_matches ADD COLUMN matchday_id uuid;
ALTER TABLE draft_matches ADD COLUMN venue_id uuid;
ALTER TABLE draft_matches ADD COLUMN court_label text;
ALTER TABLE draft_matches ADD COLUMN starts_at timestamptz;
ALTER TABLE draft_matches ADD COLUMN duration_minutes integer;
ALTER TABLE draft_matches ADD COLUMN referee_name text;
ALTER TABLE draft_matches ADD COLUMN schedule_revision integer NOT NULL DEFAULT 0;
ALTER TABLE draft_matches ADD CONSTRAINT match_schedule_complete CHECK (
  (matchday_id IS NULL AND venue_id IS NULL AND court_label IS NULL AND starts_at IS NULL AND duration_minutes IS NULL AND referee_name IS NULL)
  OR (matchday_id IS NOT NULL AND venue_id IS NOT NULL AND length(court_label) BETWEEN 1 AND 80 AND starts_at IS NOT NULL AND duration_minutes BETWEEN 15 AND 240 AND schedule_revision > 0)
);
ALTER TABLE draft_matches ADD CONSTRAINT match_schedule_matchday_fk FOREIGN KEY (organization_id,matchday_id) REFERENCES matchdays(organization_id,id);
ALTER TABLE draft_matches ADD CONSTRAINT match_schedule_venue_fk FOREIGN KEY (organization_id,venue_id) REFERENCES venues(organization_id,id);
CREATE INDEX draft_matches_agenda_idx ON draft_matches(organization_id,matchday_id,starts_at) WHERE matchday_id IS NOT NULL;

CREATE TABLE match_schedule_history (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  before_data jsonb,
  after_data jsonb NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  changed_by uuid NOT NULL REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  UNIQUE (organization_id,match_id,revision)
);

CREATE TABLE matchday_publications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  matchday_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='array'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,matchday_id) REFERENCES matchdays(organization_id,id),
  UNIQUE (organization_id,matchday_id,revision)
);

CREATE TABLE fixture_outbox (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  publication_id uuid NOT NULL UNIQUE REFERENCES matchday_publications(id),
  event_kind text NOT NULL CHECK (event_kind IN ('matchday.published','matchday.reprogrammed')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
