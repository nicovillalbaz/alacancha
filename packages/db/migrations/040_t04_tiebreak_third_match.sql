-- Un desempate puede requerir un tercer encuentro vinculado a la misma llave.
ALTER TABLE fixture_rounds DROP CONSTRAINT fixture_rounds_leg_check;
ALTER TABLE fixture_rounds ADD CONSTRAINT fixture_rounds_leg_check CHECK (leg IN (1,2,3));

ALTER TABLE draft_matches DROP CONSTRAINT fixture_match_source_check;
ALTER TABLE draft_matches ADD CONSTRAINT fixture_match_source_check CHECK (
  (fixture_phase_id IS NULL AND fixture_round_id IS NULL AND fixture_leg IS NULL)
  OR (fixture_phase_id IS NOT NULL AND fixture_round_id IS NOT NULL AND fixture_leg IN (1,2,3))
);

ALTER TABLE fixture_bracket_slots ADD COLUMN decider_match_id uuid;
ALTER TABLE fixture_bracket_slots ADD CONSTRAINT fixture_bracket_decider_fk
  FOREIGN KEY (organization_id,decider_match_id) REFERENCES draft_matches(organization_id,id);
ALTER TABLE fixture_bracket_slots ADD CONSTRAINT fixture_bracket_decider_requires_return
  CHECK (decider_match_id IS NULL OR return_match_id IS NOT NULL);
CREATE UNIQUE INDEX fixture_bracket_decider_unique ON fixture_bracket_slots(organization_id,decider_match_id)
  WHERE decider_match_id IS NOT NULL;
