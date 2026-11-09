CREATE TABLE tournaments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 120),
  timezone text NOT NULL CHECK (length(timezone) BETWEEN 3 AND 80),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  request_key uuid UNIQUE,
  creation_fingerprint text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (organization_id,id)
);
CREATE INDEX tournaments_scope_idx ON tournaments(organization_id,created_at DESC);

CREATE TABLE editions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,tournament_id) REFERENCES tournaments(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,tournament_id,name)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  edition_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
  preset text NOT NULL CHECK (preset IN ('F5','F6','F7','F8','F9','F11','futsal','personalizado')),
  team_limit integer CHECK (team_limit BETWEEN 2 AND 256),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,edition_id) REFERENCES editions(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,edition_id,name)
);
CREATE INDEX categories_edition_idx ON categories(organization_id,edition_id);

CREATE TABLE rule_versions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules)='object'),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz,
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,category_id,version),
  CHECK ((status='published')=(effective_at IS NOT NULL))
);
CREATE UNIQUE INDEX rule_versions_one_draft ON rule_versions(organization_id,category_id) WHERE status='draft';

CREATE FUNCTION preserve_published_rule_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='published' THEN
    RAISE EXCEPTION 'published rule versions are immutable';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER rule_versions_immutable BEFORE UPDATE OR DELETE ON rule_versions
FOR EACH ROW EXECUTE FUNCTION preserve_published_rule_version();
