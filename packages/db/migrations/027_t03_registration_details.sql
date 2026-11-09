-- Campos privados opcionales definidos por el reglamento versionado.
ALTER TABLE player_registrations ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(details)='object');
