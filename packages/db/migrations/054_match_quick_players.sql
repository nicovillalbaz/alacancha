-- Un jugador cargado durante el partido puede quedar con identidad incompleta.
-- No se inventa una fecha de nacimiento para atribuir goles o tarjetas.
ALTER TABLE players ALTER COLUMN birth_date DROP NOT NULL;
