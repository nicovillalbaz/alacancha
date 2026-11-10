-- Vincula el plan por posiciones con partidos y actas oficiales sin duplicar su fuente deportiva.
ALTER TABLE fixture_position_games ADD CONSTRAINT fixture_position_games_org_id_unique UNIQUE (organization_id,id);
ALTER TABLE draft_matches ADD COLUMN position_game_id uuid;
ALTER TABLE draft_matches ADD CONSTRAINT draft_matches_position_game_fk
  FOREIGN KEY (organization_id,position_game_id) REFERENCES fixture_position_games(organization_id,id);
CREATE UNIQUE INDEX draft_matches_position_game_unique ON draft_matches(organization_id,position_game_id)
  WHERE position_game_id IS NOT NULL;
