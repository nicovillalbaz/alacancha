-- T07: la vigencia de la comisión es deportiva/administrativa; el acceso a la cuenta
-- sigue dependiendo exclusivamente de team_admin_assignments.
ALTER TABLE commission_members
  ADD COLUMN valid_from date,
  ADD COLUMN valid_until date,
  ADD COLUMN ended_at timestamptz,
  ADD COLUMN ended_by uuid REFERENCES users(id),
  ADD COLUMN end_reason text;
ALTER TABLE commission_members ADD CONSTRAINT commission_validity_range
  CHECK (valid_until IS NULL OR (valid_from IS NOT NULL AND valid_until >= valid_from));
ALTER TABLE commission_members ADD CONSTRAINT commission_end_complete
  CHECK ((ended_at IS NULL AND ended_by IS NULL AND end_reason IS NULL)
    OR (ended_at IS NOT NULL AND ended_by IS NOT NULL AND length(end_reason) BETWEEN 3 AND 300));
