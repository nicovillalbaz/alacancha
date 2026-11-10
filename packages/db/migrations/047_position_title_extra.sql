-- La decisión del organizador no se infiere de un empate en puntos.
CREATE TABLE fixture_position_title_decisions (
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('no_extra','extra')),
  match_id uuid,
  decided_by uuid NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,category_id),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  CHECK ((decision='extra')=(match_id IS NOT NULL))
);
CREATE UNIQUE INDEX fixture_position_title_extra_match_unique ON fixture_position_title_decisions(organization_id,match_id) WHERE match_id IS NOT NULL;
