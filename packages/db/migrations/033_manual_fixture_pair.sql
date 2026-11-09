-- Las correcciones explícitas del organizador pueden repetir un enfrentamiento.
ALTER TABLE draft_matches ADD COLUMN manual_participants boolean NOT NULL DEFAULT false;
DROP INDEX fixture_pair_once_per_leg;
CREATE UNIQUE INDEX fixture_pair_once_per_leg ON draft_matches(
  organization_id,fixture_phase_id,fixture_leg,
  LEAST(home_entry_id,away_entry_id),GREATEST(home_entry_id,away_entry_id)
) WHERE fixture_phase_id IS NOT NULL AND competition_stage='initial' AND NOT manual_participants;
DROP INDEX fixture_knockout_pair_per_round;
CREATE UNIQUE INDEX fixture_knockout_pair_per_round ON draft_matches(
  organization_id,fixture_round_id,fixture_leg,
  LEAST(home_entry_id,away_entry_id),GREATEST(home_entry_id,away_entry_id)
) WHERE fixture_phase_id IS NOT NULL AND competition_stage='knockout' AND NOT manual_participants;
