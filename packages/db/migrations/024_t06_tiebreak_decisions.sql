-- Sorteo/orden manual documentado, vinculado a la versión exacta de la tabla.
CREATE TABLE standing_tiebreak_decisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  source_key text NOT NULL CHECK (length(source_key)=64),
  group_key text NOT NULL CHECK (length(group_key) BETWEEN 3 AND 30),
  position integer NOT NULL CHECK (position>0),
  entry_order uuid[] NOT NULL CHECK (cardinality(entry_order)>=2),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  decided_by uuid NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE (organization_id,id)
);
CREATE INDEX standing_tiebreak_current ON standing_tiebreak_decisions(organization_id,category_id,source_key,group_key,position,decided_at DESC);
CREATE TRIGGER standing_tiebreak_immutable BEFORE UPDATE OR DELETE ON standing_tiebreak_decisions FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();
