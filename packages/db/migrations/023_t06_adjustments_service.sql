-- Decisiones de puntos: cada ajuste o reversión es un asiento deportivo inmutable.
CREATE TABLE standing_adjustments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  points_delta integer NOT NULL CHECK (points_delta BETWEEN -100 AND 100 AND points_delta <> 0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 1000),
  decided_by uuid NOT NULL REFERENCES users(id),
  decided_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id)
);
CREATE INDEX standing_adjustments_category ON standing_adjustments(organization_id,category_id,decided_at,id);
CREATE TRIGGER standing_adjustments_immutable BEFORE UPDATE OR DELETE ON standing_adjustments FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();

-- Evidencia de cada acta aprobada que sirvió una suspensión por partidos.
-- Una rectificación conserva la aprobación anterior; la vigencia usa solo la actual.
CREATE TABLE suspension_service_history (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  match_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  match_date date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,decision_id) REFERENCES discipline_decisions(organization_id,id),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,approval_id) REFERENCES match_acta_snapshots(organization_id,id),
  UNIQUE (organization_id,decision_id,match_id,approval_id)
);
CREATE INDEX suspension_service_decision ON suspension_service_history(organization_id,decision_id,match_date);
CREATE TRIGGER suspension_service_immutable BEFORE UPDATE OR DELETE ON suspension_service_history FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();
