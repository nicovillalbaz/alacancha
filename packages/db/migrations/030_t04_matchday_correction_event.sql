-- Distingue una corrección de participantes de una reprogramación horaria.
ALTER TABLE fixture_outbox DROP CONSTRAINT fixture_outbox_event_kind_check;
ALTER TABLE fixture_outbox ADD CONSTRAINT fixture_outbox_event_kind_check
  CHECK (event_kind IN ('matchday.published','matchday.reprogrammed','matchday.corrected'));
