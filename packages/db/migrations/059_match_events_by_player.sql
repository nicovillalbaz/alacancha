CREATE INDEX match_record_events_player_idx
  ON match_record_events(organization_id,registration_id) WHERE registration_id IS NOT NULL;
