-- Una Fecha privada puede contener cruces sorteados pendientes de horario.
ALTER TABLE draft_matches DROP CONSTRAINT match_schedule_complete;
ALTER TABLE draft_matches ADD CONSTRAINT match_schedule_complete CHECK (
  (venue_id IS NULL AND court_label IS NULL AND starts_at IS NULL AND duration_minutes IS NULL AND referee_name IS NULL AND schedule_revision=0)
  OR (matchday_id IS NOT NULL AND venue_id IS NOT NULL AND length(court_label) BETWEEN 1 AND 80 AND starts_at IS NOT NULL AND duration_minutes BETWEEN 15 AND 240 AND schedule_revision > 0)
);
