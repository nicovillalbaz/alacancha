CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL CHECK (length(username) BETWEEN 3 AND 160),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 120),
  password_hash text,
  platform_admin boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 3 AND 120),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','blocked')),
  accent text NOT NULL DEFAULT '#165D46' CHECK (accent ~ '^#[0-9a-fA-F]{6}$'),
  logo_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('tournament_admin','team_admin','operator')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','blocked')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, id)
);
CREATE INDEX memberships_user_idx ON memberships(user_id);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  organization_id uuid REFERENCES organizations(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_scope_idx ON sessions(user_id, organization_id) WHERE revoked_at IS NULL;
CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES organizations(id),
  user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('invite','recovery')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_user_idx ON invitations(user_id, purpose);
CREATE TABLE access_grants (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('team','tournament','match')),
  resource_id uuid NOT NULL,
  FOREIGN KEY (organization_id, membership_id) REFERENCES memberships(organization_id,id),
  UNIQUE (membership_id, resource_type, resource_id)
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  action text NOT NULL,
  resource_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) > 0),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_scope_idx ON audit_logs(organization_id, created_at DESC);
CREATE TABLE media (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  filename text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  byte_length integer NOT NULL CHECK (byte_length > 0 AND byte_length <= 2097152),
  checksum text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
ALTER TABLE organizations ADD CONSTRAINT organization_logo_scope_fk FOREIGN KEY (id,logo_id) REFERENCES media(organization_id,id);
