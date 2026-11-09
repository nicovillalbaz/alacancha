CREATE TABLE draft_matches (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  home_entry_id uuid NOT NULL,
  away_entry_id uuid NOT NULL,
  match_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status='draft'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  FOREIGN KEY (organization_id,home_entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,away_entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id),
  CHECK (home_entry_id<>away_entry_id)
);
CREATE INDEX draft_matches_category_idx ON draft_matches(organization_id,category_id,match_date);

CREATE TABLE lineup_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','observed','rejected')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  rule_version integer NOT NULL CHECK (rule_version>0),
  good_faith_version integer NOT NULL CHECK (good_faith_version>0),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES users(id),
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_reason text,
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,match_id,entry_id,version),
  CHECK ((status IN ('submitted','approved','observed','rejected'))=(submitted_at IS NOT NULL)),
  CHECK ((status IN ('approved','observed','rejected'))=(reviewed_at IS NOT NULL)),
  CHECK ((status IN ('approved','observed','rejected'))=(reviewed_by IS NOT NULL)),
  CHECK ((status IN ('approved','observed','rejected'))=(review_reason IS NOT NULL))
);
CREATE UNIQUE INDEX lineup_one_submitted_idx ON lineup_versions(organization_id,match_id,entry_id) WHERE status='submitted';
CREATE INDEX lineup_versions_match_idx ON lineup_versions(organization_id,match_id,entry_id,version DESC);

CREATE FUNCTION preserve_lineup_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.status<>'draft' AND OLD.status<>'submitted' THEN
    RAISE EXCEPTION 'reviewed lineup versions are immutable';
  END IF;
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.match_id<>OLD.match_id
    OR NEW.entry_id<>OLD.entry_id OR NEW.version<>OLD.version OR NEW.snapshot<>OLD.snapshot
    OR NEW.rule_version<>OLD.rule_version OR NEW.good_faith_version<>OLD.good_faith_version
    OR NEW.reason<>OLD.reason OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
    OR (OLD.status='submitted' AND NEW.status NOT IN ('approved','observed','rejected'))
    OR (OLD.status='draft' AND NEW.status<>'submitted') THEN
    RAISE EXCEPTION 'lineup snapshot cannot be changed';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER lineup_version_immutable BEFORE UPDATE OR DELETE ON lineup_versions
FOR EACH ROW EXECUTE FUNCTION preserve_lineup_version();

CREATE TABLE lineup_exceptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  authorized_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,entry_id,registration_id) REFERENCES player_registrations(organization_id,entry_id,id),
  UNIQUE (organization_id,match_id,entry_id,registration_id)
);
