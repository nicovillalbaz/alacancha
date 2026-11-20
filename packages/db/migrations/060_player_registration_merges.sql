ALTER TABLE player_registrations ADD COLUMN merged_into_registration_id uuid;

ALTER TABLE player_registrations
  ADD CONSTRAINT player_registration_merge_same_entry
    FOREIGN KEY (organization_id,entry_id,merged_into_registration_id)
    REFERENCES player_registrations(organization_id,entry_id,id),
  ADD CONSTRAINT player_registration_merge_requires_retirement
    CHECK (merged_into_registration_id IS NULL OR (reverted_at IS NOT NULL AND merged_into_registration_id<>id));

CREATE INDEX player_registration_merge_scope_idx ON player_registrations(organization_id,entry_id,id)
  INCLUDE (merged_into_registration_id) WHERE merged_into_registration_id IS NOT NULL;
