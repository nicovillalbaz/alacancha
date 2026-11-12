-- El penal errado durante el partido es distinto del fallo en una tanda.
ALTER TABLE match_record_events DROP CONSTRAINT match_record_events_kind_check;
ALTER TABLE match_record_events ADD CONSTRAINT match_record_events_kind_check CHECK
  (kind IN ('goal','penalty','penalty_miss','own_goal','yellow','second_yellow','red','custom_card','substitution','incident','shootout_goal','shootout_miss','void'));
ALTER TABLE match_record_events DROP CONSTRAINT match_record_events_check;
ALTER TABLE match_record_events ADD CONSTRAINT match_record_events_check CHECK (
  (kind='void' AND team_entry_id IS NULL AND registration_id IS NULL AND related_registration_id IS NULL AND incident_note IS NULL AND card_code IS NULL AND window_no IS NULL AND period IS NULL AND minute IS NULL AND voids_event_id IS NOT NULL AND reason IS NOT NULL)
  OR
  (kind<>'void' AND team_entry_id IS NOT NULL AND voids_event_id IS NULL AND reason IS NULL
    AND (registration_id IS NOT NULL OR kind IN ('goal','penalty','penalty_miss','own_goal','incident','shootout_goal','shootout_miss'))
    AND (kind='substitution')=(related_registration_id IS NOT NULL)
    AND (kind='incident')=(incident_note IS NOT NULL)
    AND (kind='custom_card')=(card_code IS NOT NULL)
    AND (window_no IS NULL OR kind='substitution'))
);
