ALTER TABLE tournament_payment_rates ADD COLUMN custom_card_rates jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(custom_card_rates)='object');

ALTER TABLE draft_matches ADD COLUMN archived_at timestamptz;
ALTER TABLE draft_matches ADD COLUMN archived_by uuid REFERENCES users(id);
ALTER TABLE matchdays ADD COLUMN archived_at timestamptz;
ALTER TABLE matchdays ADD COLUMN archived_by uuid REFERENCES users(id);

-- Un cruce que se retira de una Fecha conserva la revisión y su historial.
ALTER TABLE draft_matches DROP CONSTRAINT match_schedule_complete;
ALTER TABLE draft_matches ADD CONSTRAINT match_schedule_complete CHECK (
  (venue_id IS NULL AND court_label IS NULL AND starts_at IS NULL AND duration_minutes IS NULL AND referee_name IS NULL)
  OR (matchday_id IS NOT NULL AND venue_id IS NOT NULL AND length(court_label) BETWEEN 1 AND 80 AND starts_at IS NOT NULL AND duration_minutes BETWEEN 15 AND 240 AND schedule_revision > 0)
);
