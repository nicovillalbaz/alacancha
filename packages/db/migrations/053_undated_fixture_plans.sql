-- Calendario anunciado: independiente de partidos y actas oficiales.
CREATE TABLE undated_fixture_plans (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  rounds jsonb NOT NULL CHECK (jsonb_typeof(rounds) = 'array'),
  qualification_count integer NOT NULL CHECK (qualification_count BETWEEN 2 AND 128),
  quarter_pairing text NOT NULL DEFAULT 'in_person_draw' CHECK (quarter_pairing = 'in_person_draw'),
  semifinal_pairing text NOT NULL DEFAULT 'pending' CHECK (semifinal_pairing IN ('pending','in_person_draw','bracket')),
  final_pairing text NOT NULL DEFAULT 'winners' CHECK (final_pairing = 'winners'),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,category_id)
);

CREATE TABLE undated_fixture_publications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,plan_id) REFERENCES undated_fixture_plans(organization_id,id),
  UNIQUE (organization_id,plan_id,revision)
);
CREATE INDEX undated_fixture_publications_latest_idx ON undated_fixture_publications(organization_id,plan_id,revision DESC);
