ALTER TABLE undated_fixture_plans ADD COLUMN playoff_dates jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(playoff_dates)='object');

ALTER TABLE draft_matches ADD COLUMN announced_order smallint CHECK (announced_order BETWEEN 1 AND 128);
