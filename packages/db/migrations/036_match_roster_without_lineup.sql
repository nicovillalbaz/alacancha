-- La carga posterior puede congelar jugadores registrados sin exigir planillas aprobadas.
ALTER TABLE match_records ALTER COLUMN home_lineup_id DROP NOT NULL;
ALTER TABLE match_records ALTER COLUMN away_lineup_id DROP NOT NULL;
ALTER TABLE match_records ADD COLUMN roster_snapshot jsonb NOT NULL DEFAULT '{"home":[],"away":[]}'::jsonb;
