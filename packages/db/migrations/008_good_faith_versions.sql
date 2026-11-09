CREATE TABLE good_faith_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','observed','rejected')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='array'),
  submit_reason text NOT NULL CHECK (length(submit_reason) BETWEEN 3 AND 300),
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_reason text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,entry_id,version),
  CHECK ((status='submitted')=(reviewed_at IS NULL)),
  CHECK ((status='submitted')=(reviewed_by IS NULL)),
  CHECK ((status='submitted')=(review_reason IS NULL))
);
CREATE UNIQUE INDEX good_faith_one_pending_idx ON good_faith_versions(organization_id,entry_id) WHERE status='submitted';
CREATE INDEX good_faith_entry_idx ON good_faith_versions(organization_id,entry_id,version DESC);

CREATE FUNCTION preserve_good_faith_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.status<>'submitted' THEN
    RAISE EXCEPTION 'reviewed good-faith versions are immutable';
  END IF;
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.entry_id<>OLD.entry_id
    OR NEW.version<>OLD.version OR NEW.snapshot<>OLD.snapshot OR NEW.submit_reason<>OLD.submit_reason
    OR NEW.submitted_by<>OLD.submitted_by OR NEW.submitted_at<>OLD.submitted_at OR NEW.status='submitted' THEN
    RAISE EXCEPTION 'good-faith snapshot cannot be changed';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER good_faith_version_immutable BEFORE UPDATE OR DELETE ON good_faith_versions
FOR EACH ROW EXECUTE FUNCTION preserve_good_faith_version();
