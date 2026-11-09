-- T06: cache reconstruible; la fuente sigue siendo el acta aprobada inmutable.
CREATE TABLE category_statistics (
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  source_key text NOT NULL CHECK (length(source_key)=64),
  projection jsonb NOT NULL CHECK (jsonb_typeof(projection)='object'),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,category_id),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id)
);

-- Publicar el nombre deportivo requiere una decisión explícita por inscripción.
CREATE TABLE player_publications (
  organization_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  visible boolean NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  decided_by uuid NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,registration_id),
  FOREIGN KEY (organization_id,registration_id) REFERENCES player_registrations(organization_id,id)
);
