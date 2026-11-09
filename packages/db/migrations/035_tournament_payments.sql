-- Libro privado del torneo. Los cargos no son ingresos hasta registrar su cobro.
CREATE TABLE tournament_payment_rates (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  yellow_guaranies integer NOT NULL CHECK (yellow_guaranies BETWEEN 0 AND 1000000000),
  red_guaranies integer NOT NULL CHECK (red_guaranies BETWEEN 0 AND 1000000000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,tournament_id) REFERENCES tournaments(organization_id,id),
  UNIQUE (organization_id,tournament_id,version)
);
CREATE TRIGGER tournament_payment_rates_immutable BEFORE UPDATE OR DELETE ON tournament_payment_rates
  FOR EACH ROW EXECUTE FUNCTION preserve_match_record_event();

CREATE TABLE tournament_money_entries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('charge','income','expense')),
  category text NOT NULL CHECK (category IN ('fine_yellow','fine_red','fine_other','fine_payment','tickets','registration','match_fee','referee','other')),
  entry_id uuid,
  linked_charge_id uuid,
  amount_guaranies integer NOT NULL CHECK (amount_guaranies BETWEEN 1 AND 1000000000),
  description text NOT NULL CHECK (length(description) BETWEEN 2 AND 160),
  occurred_on date NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid REFERENCES users(id),
  voided_at timestamptz,
  void_reason text,
  FOREIGN KEY (organization_id,tournament_id) REFERENCES tournaments(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,tournament_id,linked_charge_id) REFERENCES tournament_money_entries(organization_id,tournament_id,id),
  UNIQUE (organization_id,tournament_id,id),
  CHECK ((kind='charge' AND category IN ('fine_yellow','fine_red','fine_other') AND entry_id IS NOT NULL AND linked_charge_id IS NULL)
    OR (kind='income' AND category IN ('fine_payment','tickets','registration','match_fee','other'))
    OR (kind='expense' AND category IN ('referee','other') AND linked_charge_id IS NULL)),
  CHECK ((linked_charge_id IS NULL) OR (kind='income' AND category='fine_payment' AND entry_id IS NOT NULL)),
  CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(void_reason) BETWEEN 3 AND 300))
);
CREATE INDEX tournament_money_entries_scope_idx ON tournament_money_entries(organization_id,tournament_id,occurred_on DESC,created_at DESC);
CREATE INDEX tournament_money_entries_team_idx ON tournament_money_entries(organization_id,entry_id,occurred_on DESC) WHERE entry_id IS NOT NULL;
CREATE INDEX tournament_money_entries_charge_idx ON tournament_money_entries(organization_id,tournament_id,linked_charge_id) WHERE linked_charge_id IS NOT NULL AND voided_at IS NULL;
