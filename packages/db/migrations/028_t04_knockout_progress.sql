-- Separa la fase inicial de los cruces eliminatorios posteriores en la misma categoría.
ALTER TABLE draft_matches ADD COLUMN competition_stage text NOT NULL DEFAULT 'initial'
  CHECK (competition_stage IN ('initial','knockout'));
DROP INDEX fixture_pair_once_per_leg;
CREATE UNIQUE INDEX fixture_pair_once_per_leg ON draft_matches(
  organization_id,fixture_phase_id,fixture_leg,
  LEAST(home_entry_id,away_entry_id),GREATEST(home_entry_id,away_entry_id)
) WHERE fixture_phase_id IS NOT NULL AND competition_stage='initial';
CREATE UNIQUE INDEX fixture_knockout_pair_per_round ON draft_matches(
  organization_id,fixture_round_id,fixture_leg,
  LEAST(home_entry_id,away_entry_id),GREATEST(home_entry_id,away_entry_id)
) WHERE fixture_phase_id IS NOT NULL AND competition_stage='knockout';
