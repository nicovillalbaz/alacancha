CREATE TABLE teams (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  color text NOT NULL DEFAULT '#165D46' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  request_key uuid UNIQUE,
  creation_fingerprint text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,name)
);

CREATE TABLE team_entries (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  team_id uuid NOT NULL,
  category_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,team_id) REFERENCES teams(organization_id,id),
  FOREIGN KEY (organization_id,category_id) REFERENCES categories(organization_id,id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,team_id,category_id)
);
CREATE INDEX team_entries_category_idx ON team_entries(organization_id,category_id);

CREATE TABLE team_admin_assignments (
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  assigned_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,entry_id,membership_id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES memberships(organization_id,id)
);
CREATE INDEX team_admin_membership_idx ON team_admin_assignments(organization_id,membership_id);

CREATE TABLE commission_members (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed')),
  proposed_by uuid NOT NULL REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id),
  CHECK ((status='confirmed')=(confirmed_at IS NOT NULL))
);

CREATE TABLE team_staff (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  role text NOT NULL CHECK (length(role) BETWEEN 2 AND 80),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed')),
  proposed_by uuid NOT NULL REFERENCES users(id),
  confirmed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  UNIQUE (organization_id,id),
  CHECK ((status='confirmed')=(confirmed_at IS NOT NULL))
);

CREATE TABLE venues (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  city text,
  UNIQUE (organization_id,id)
);

CREATE TABLE sponsors (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  public_visible boolean NOT NULL DEFAULT false,
  UNIQUE (organization_id,id)
);
