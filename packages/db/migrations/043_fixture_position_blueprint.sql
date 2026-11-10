-- Plan privado por posiciones: separado de partidos, actas y publicaciones oficiales.
CREATE TABLE fixture_position_blueprints (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 120),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  opening_first_jornada integer NOT NULL CHECK (opening_first_jornada BETWEEN 1 AND 999),
  opening_second_jornada integer NOT NULL CHECK (opening_second_jornada BETWEEN 1 AND 999),
  opening_first_date date NOT NULL,
  opening_second_date date NOT NULL,
  extra_reserved_date date,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,category_id),
  CHECK (opening_first_jornada <> opening_second_jornada),
  CHECK (opening_first_date < opening_second_date)
);

CREATE TABLE fixture_position_assignments (
  organization_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  slot_code text NOT NULL CHECK (slot_code ~ '^[AB][1-5]$'),
  entry_id uuid,
  PRIMARY KEY (organization_id,blueprint_id,slot_code),
  FOREIGN KEY (organization_id,blueprint_id) REFERENCES fixture_position_blueprints(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,blueprint_id,entry_id)
);

CREATE TABLE fixture_position_games (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^(G[0-9]{2}|MM[1-4]|Q[1-6])$'),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 200),
  stage text NOT NULL CHECK (stage IN ('groups','quarterfinal','quadrangular')),
  sporting_round text NOT NULL CHECK (length(sporting_round) BETWEEN 2 AND 30),
  jornada_no integer CHECK (jornada_no BETWEEN 1 AND 999),
  planned_date date,
  home_ref text NOT NULL CHECK (home_ref ~ '^([AB][1-5]|[1-4][AB]|S[1-4])$'),
  away_ref text NOT NULL CHECK (away_ref ~ '^([AB][1-5]|[1-4][AB]|S[1-4])$'),
  FOREIGN KEY (organization_id,blueprint_id) REFERENCES fixture_position_blueprints(organization_id,id),
  UNIQUE (organization_id,blueprint_id,code),
  UNIQUE (organization_id,blueprint_id,ordinal),
  CHECK (home_ref <> away_ref),
  CHECK ((jornada_no IS NULL) = (planned_date IS NULL))
);
CREATE INDEX fixture_position_games_jornada_idx ON fixture_position_games(organization_id,blueprint_id,jornada_no,ordinal);
