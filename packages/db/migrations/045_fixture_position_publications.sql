-- Instantáneas públicas del sorteo. Las ediciones privadas posteriores no alteran lo ya publicado.
CREATE TABLE fixture_position_publications (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  blueprint_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  snapshot jsonb NOT NULL,
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,blueprint_id) REFERENCES fixture_position_blueprints(organization_id,id),
  UNIQUE (organization_id,blueprint_id,revision)
);
CREATE INDEX fixture_position_publications_latest_idx ON fixture_position_publications(organization_id,blueprint_id,published_at DESC);
