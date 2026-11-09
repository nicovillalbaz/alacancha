-- El reglamento admite hasta seis períodos; conservar los tres nombres rápidos y admitir los adicionales.
ALTER TABLE match_record_events DROP CONSTRAINT match_record_events_period_check;
ALTER TABLE match_record_events ADD CONSTRAINT match_record_events_period_check
  CHECK (period IN ('PT','ST','TE','P4','P5','P6'));
