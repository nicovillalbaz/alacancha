-- T04-01: cruces privados de liga. Fechas y jornadas oficiales se agregan en T04-02.
CREATE TABLE fixture_phases (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  rule_version integer NOT NULL CHECK (rule_version>0),
  mode text NOT NULL CHECK (mode='league'),
  legs integer NOT NULL CHECK (legs IN (1,2)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  FOREIGN KEY (organization_id,category_id,rule_version) REFERENCES rule_versions(organization_id,category_id,version),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,id,category_id),
  UNIQUE (organization_id,category_id),
  CHECK ((status='generated')=(generated_at IS NOT NULL))
);

CREATE TABLE fixture_rounds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  phase_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  leg integer NOT NULL CHECK (leg IN (1,2)),
  FOREIGN KEY (organization_id,phase_id) REFERENCES fixture_phases(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,id,phase_id),
  UNIQUE (organization_id,phase_id,ordinal)
);

CREATE TABLE fixture_byes (
  organization_id uuid NOT NULL,
  round_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  PRIMARY KEY (organization_id,round_id,entry_id),
  FOREIGN KEY (organization_id,round_id) REFERENCES fixture_rounds(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id)
);

ALTER TABLE draft_matches ALTER COLUMN match_date DROP NOT NULL;
ALTER TABLE draft_matches ADD COLUMN fixture_phase_id uuid;
ALTER TABLE draft_matches ADD COLUMN fixture_round_id uuid;
ALTER TABLE draft_matches ADD COLUMN fixture_leg integer;
ALTER TABLE draft_matches ADD CONSTRAINT fixture_match_source_check CHECK (
  (fixture_phase_id IS NULL AND fixture_round_id IS NULL AND fixture_leg IS NULL)
  OR (fixture_phase_id IS NOT NULL AND fixture_round_id IS NOT NULL AND fixture_leg IN (1,2))
);
ALTER TABLE draft_matches ADD CONSTRAINT fixture_match_phase_fk FOREIGN KEY (organization_id,fixture_phase_id,category_id) REFERENCES fixture_phases(organization_id,id,category_id);
ALTER TABLE draft_matches ADD CONSTRAINT fixture_match_round_fk FOREIGN KEY (organization_id,fixture_round_id,fixture_phase_id) REFERENCES fixture_rounds(organization_id,id,phase_id);
CREATE UNIQUE INDEX fixture_pair_once_per_leg ON draft_matches(organization_id,fixture_phase_id,fixture_leg,LEAST(home_entry_id,away_entry_id),GREATEST(home_entry_id,away_entry_id)) WHERE fixture_phase_id IS NOT NULL;
