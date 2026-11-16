-- El mismo formato por posiciones admite grupos de 4 a 8 equipos.
-- Las copas existentes conservan cinco por grupo sin reescribir sus sorteos.
ALTER TABLE fixture_position_blueprints
  ADD COLUMN group_size integer NOT NULL DEFAULT 5 CHECK (group_size BETWEEN 4 AND 8);

ALTER TABLE fixture_position_assignments
  DROP CONSTRAINT fixture_position_assignments_slot_code_check,
  ADD CONSTRAINT fixture_position_assignments_slot_code_check CHECK (slot_code ~ '^[AB][1-8]$');

ALTER TABLE fixture_position_games
  DROP CONSTRAINT fixture_position_games_home_ref_check,
  DROP CONSTRAINT fixture_position_games_away_ref_check,
  ADD CONSTRAINT fixture_position_games_home_ref_check CHECK (home_ref ~ '^([AB][1-8]|[1-4][AB]|S[1-4])$'),
  ADD CONSTRAINT fixture_position_games_away_ref_check CHECK (away_ref ~ '^([AB][1-8]|[1-4][AB]|S[1-4])$');
