ALTER TABLE tournaments ADD COLUMN match_fee_guaranies integer
  CHECK (match_fee_guaranies BETWEEN 1 AND 1000000000);

ALTER TABLE tournament_money_entries ADD COLUMN match_fee_match_id uuid,
  ADD CONSTRAINT money_match_fee_match_fk FOREIGN KEY (organization_id,match_fee_match_id)
    REFERENCES draft_matches(organization_id,id),
  ADD CONSTRAINT money_match_fee_collection CHECK (
    match_fee_match_id IS NULL OR
    (kind='income' AND category='match_fee' AND entry_id IS NOT NULL AND linked_charge_id IS NULL)
  );
CREATE UNIQUE INDEX money_match_fee_one_collection
  ON tournament_money_entries(organization_id,tournament_id,match_fee_match_id,entry_id)
  WHERE match_fee_match_id IS NOT NULL AND voided_at IS NULL;

ALTER TABLE player_registrations ADD COLUMN shirt_number smallint
  CHECK (shirt_number BETWEEN 0 AND 99);
