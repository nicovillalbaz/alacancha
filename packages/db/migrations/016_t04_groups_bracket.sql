-- Amplía fases privadas sin modificar rondas de liga ya generadas.
ALTER TABLE fixture_phases DROP CONSTRAINT fixture_phases_mode_check;
ALTER TABLE fixture_phases ADD CONSTRAINT fixture_phases_mode_check CHECK (mode IN ('league','groups','knockout'));
ALTER TABLE fixture_phases ADD COLUMN group_count integer;
ALTER TABLE fixture_phases ADD CONSTRAINT fixture_group_count_check CHECK ((mode='groups' AND group_count BETWEEN 2 AND 32) OR (mode<>'groups' AND group_count IS NULL));

ALTER TABLE fixture_rounds ADD COLUMN group_no integer NOT NULL DEFAULT 1 CHECK (group_no BETWEEN 1 AND 32);
ALTER TABLE fixture_rounds DROP CONSTRAINT fixture_rounds_organization_id_phase_id_ordinal_key;
ALTER TABLE fixture_rounds ADD CONSTRAINT fixture_round_unique_group_ordinal UNIQUE (organization_id,phase_id,group_no,ordinal);

CREATE TABLE fixture_group_entries (
  organization_id uuid NOT NULL,
  phase_id uuid NOT NULL,
  group_no integer NOT NULL CHECK (group_no BETWEEN 1 AND 32),
  entry_id uuid NOT NULL,
  PRIMARY KEY (organization_id,phase_id,entry_id),
  FOREIGN KEY (organization_id,phase_id) REFERENCES fixture_phases(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id)
);

CREATE TABLE fixture_bracket_slots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  phase_id uuid NOT NULL,
  round_id uuid NOT NULL,
  stage integer NOT NULL CHECK (stage BETWEEN 1 AND 8),
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 128),
  home_entry_id uuid,
  away_entry_id uuid,
  home_source_id uuid,
  away_source_id uuid,
  match_id uuid,
  return_match_id uuid,
  FOREIGN KEY (organization_id,phase_id) REFERENCES fixture_phases(organization_id,id),
  FOREIGN KEY (organization_id,round_id,phase_id) REFERENCES fixture_rounds(organization_id,id,phase_id),
  FOREIGN KEY (organization_id,home_entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,away_entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,home_source_id) REFERENCES fixture_bracket_slots(organization_id,id),
  FOREIGN KEY (organization_id,away_source_id) REFERENCES fixture_bracket_slots(organization_id,id),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,return_match_id) REFERENCES draft_matches(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,phase_id,stage,slot),
  CHECK (NOT (home_entry_id IS NOT NULL AND home_source_id IS NOT NULL)),
  CHECK (NOT (away_entry_id IS NOT NULL AND away_source_id IS NOT NULL)),
  CHECK (home_entry_id IS NOT NULL OR away_entry_id IS NOT NULL OR home_source_id IS NOT NULL OR away_source_id IS NOT NULL)
);
