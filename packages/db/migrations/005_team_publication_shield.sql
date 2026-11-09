ALTER TABLE team_entries ADD COLUMN public_visible boolean NOT NULL DEFAULT false;
ALTER TABLE teams ADD COLUMN shield_id uuid;
ALTER TABLE teams ADD CONSTRAINT team_shield_scope_fk FOREIGN KEY (organization_id,shield_id) REFERENCES media(organization_id,id);
