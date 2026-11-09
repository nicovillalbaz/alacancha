-- T05-01a: captura privada de eventos; acta oficial y publicación llegan en incrementos siguientes.
CREATE TABLE match_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'capturing' CHECK (status IN ('capturing','submitted','official')),
  rule_version integer NOT NULL CHECK (rule_version > 0),
  home_lineup_id uuid NOT NULL,
  away_lineup_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  started_by uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,home_lineup_id) REFERENCES lineup_versions(organization_id,id),
  FOREIGN KEY (organization_id,away_lineup_id) REFERENCES lineup_versions(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,match_id),
  CHECK (home_lineup_id <> away_lineup_id)
);

CREATE TABLE match_record_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  client_event_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('goal','penalty','own_goal','yellow','red','void')),
  team_entry_id uuid,
  registration_id uuid,
  period text CHECK (period IN ('PT','ST','TE')),
  minute integer CHECK (minute BETWEEN 0 AND 200),
  voids_event_id uuid REFERENCES match_record_events(id),
  reason text CHECK (reason IS NULL OR length(reason) BETWEEN 3 AND 300),
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES match_records(organization_id,match_id),
  FOREIGN KEY (organization_id,team_entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,team_entry_id,registration_id) REFERENCES player_registrations(organization_id,entry_id,id),
  UNIQUE (organization_id,match_id,sequence),
  UNIQUE (organization_id,match_id,client_event_id),
  CHECK (
    (kind='void' AND team_entry_id IS NULL AND registration_id IS NULL AND period IS NULL AND minute IS NULL AND voids_event_id IS NOT NULL AND reason IS NOT NULL)
    OR
    (kind<>'void' AND team_entry_id IS NOT NULL AND voids_event_id IS NULL AND reason IS NULL AND (registration_id IS NOT NULL OR kind IN ('goal','penalty','own_goal')))
  )
);
CREATE UNIQUE INDEX match_record_event_void_once ON match_record_events(voids_event_id) WHERE voids_event_id IS NOT NULL;
CREATE INDEX match_record_events_order ON match_record_events(organization_id,match_id,sequence);

CREATE FUNCTION preserve_match_record_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'match event journal is append-only';
END
$$;
CREATE TRIGGER match_record_event_immutable BEFORE UPDATE OR DELETE ON match_record_events
FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();
