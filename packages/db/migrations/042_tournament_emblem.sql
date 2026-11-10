ALTER TABLE tournaments ADD COLUMN emblem_id uuid;
ALTER TABLE tournaments ADD CONSTRAINT tournament_emblem_scope_fk
  FOREIGN KEY (organization_id, emblem_id) REFERENCES media(organization_id, id);
