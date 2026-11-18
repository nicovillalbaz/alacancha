-- Cada cargo de tarjeta conserva el evento de acta que lo originó.
-- Las tarjetas sin importe se muestran desde el acta oficial, sin crear un asiento de Gs. 0.
ALTER TABLE match_record_events ADD CONSTRAINT match_record_events_organization_id_unique UNIQUE (organization_id,id);

ALTER TABLE tournament_money_entries ADD COLUMN card_event_id uuid;
ALTER TABLE tournament_money_entries ADD CONSTRAINT tournament_money_card_event_fk
  FOREIGN KEY (organization_id,card_event_id) REFERENCES match_record_events(organization_id,id);
ALTER TABLE tournament_money_entries ADD CONSTRAINT tournament_money_card_charge_kind
  CHECK (card_event_id IS NULL OR (kind='charge' AND category IN ('fine_yellow','fine_red','fine_other')));
CREATE UNIQUE INDEX tournament_money_active_card_event_idx
  ON tournament_money_entries(organization_id,card_event_id)
  WHERE card_event_id IS NOT NULL AND voided_at IS NULL;
