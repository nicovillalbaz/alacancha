CREATE INDEX IF NOT EXISTS fixture_outbox_public_stream
  ON fixture_outbox (organization_id, created_at, id);
