CREATE TABLE players (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  given_names text NOT NULL CHECK (length(given_names) BETWEEN 2 AND 120),
  family_names text NOT NULL CHECK (length(family_names) BETWEEN 2 AND 120),
  document_kind text NOT NULL CHECK (document_kind IN ('ci','passport','other')),
  document_ciphertext text NOT NULL,
  document_fingerprint text NOT NULL CHECK (length(document_fingerprint)=64),
  document_last_four text NOT NULL CHECK (length(document_last_four) BETWEEN 1 AND 4),
  birth_date date NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,document_kind,document_fingerprint)
);

CREATE TABLE player_registrations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  player_id uuid NOT NULL,
  registration_number text NOT NULL CHECK (length(registration_number) BETWEEN 1 AND 40),
  origin_kind text NOT NULL CHECK (origin_kind IN ('internal','external','none','unknown')),
  origin_team_id uuid,
  origin_team_name text,
  origin_city text,
  origin_league text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','observed','rejected')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,player_id) REFERENCES players(organization_id,id),
  FOREIGN KEY (organization_id,origin_team_id) REFERENCES teams(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,entry_id,player_id),
  CHECK (
    (origin_kind='internal' AND origin_team_id IS NOT NULL AND origin_team_name IS NULL AND origin_city IS NOT NULL)
    OR (origin_kind='external' AND origin_team_id IS NULL AND origin_team_name IS NOT NULL AND origin_city IS NOT NULL)
    OR (origin_kind IN ('none','unknown') AND origin_team_id IS NULL AND origin_team_name IS NULL AND origin_city IS NULL AND origin_league IS NULL)
  )
);
CREATE UNIQUE INDEX player_registrations_card_idx ON player_registrations(organization_id,entry_id,lower(registration_number));
CREATE INDEX player_registrations_entry_idx ON player_registrations(organization_id,entry_id,created_at DESC);
