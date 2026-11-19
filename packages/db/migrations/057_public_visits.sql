CREATE TABLE public_visit_days (
  day date PRIMARY KEY,
  visits bigint NOT NULL CHECK (visits > 0)
);

CREATE TABLE public_tournament_view_days (
  day date NOT NULL,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('copa', 'partidos', 'fixture', 'clasificacion', 'goleadores', 'valla', 'equipos')),
  views bigint NOT NULL CHECK (views > 0),
  PRIMARY KEY (day, tournament_id, section)
);
