-- T05: permisos por partido, actas versionadas y hechos durables.
CREATE TABLE match_capture_assignments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  duty text NOT NULL CHECK (duty IN ('capture','review')),
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  FOREIGN KEY (organization_id,match_id) REFERENCES draft_matches(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES memberships(organization_id,id),
  UNIQUE (organization_id,id)
);
CREATE UNIQUE INDEX match_capture_assignment_active ON match_capture_assignments(organization_id,match_id,membership_id,duty) WHERE revoked_at IS NULL;
CREATE INDEX match_capture_assignment_member ON match_capture_assignments(organization_id,membership_id) WHERE revoked_at IS NULL;

CREATE TABLE match_acta_snapshots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  kind text NOT NULL CHECK (kind IN ('submitted','approved','rejected','reopened')),
  event_revision integer NOT NULL CHECK (event_revision >= 0),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES match_records(organization_id,match_id),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,match_id,version)
);
ALTER TABLE match_records ADD COLUMN submission_id uuid;
ALTER TABLE match_records ADD COLUMN approval_id uuid;
ALTER TABLE match_records ADD CONSTRAINT match_record_submission_fk FOREIGN KEY (organization_id,submission_id) REFERENCES match_acta_snapshots(organization_id,id);
ALTER TABLE match_records ADD CONSTRAINT match_record_approval_fk FOREIGN KEY (organization_id,approval_id) REFERENCES match_acta_snapshots(organization_id,id);

CREATE TABLE match_acta_signoffs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES match_records(organization_id,match_id),
  FOREIGN KEY (organization_id,snapshot_id) REFERENCES match_acta_snapshots(organization_id,id),
  FOREIGN KEY (organization_id,entry_id) REFERENCES team_entries(organization_id,id),
  FOREIGN KEY (organization_id,membership_id) REFERENCES memberships(organization_id,id),
  UNIQUE (organization_id,snapshot_id,entry_id)
);

CREATE TABLE match_record_outbox (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  match_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('match.provisional','match.submitted','match.official','match.corrected')),
  revision integer NOT NULL CHECK (revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,match_id) REFERENCES match_records(organization_id,match_id),
  UNIQUE (organization_id,match_id,kind,revision)
);
CREATE INDEX match_record_outbox_poll ON match_record_outbox(organization_id,match_id,created_at,id);

-- Eventos adicionales conservan el diario único y su orden.
ALTER TABLE match_record_events ADD COLUMN related_registration_id uuid;
ALTER TABLE match_record_events ADD COLUMN incident_note text;
ALTER TABLE match_record_events ADD COLUMN window_no integer;
ALTER TABLE match_record_events ADD CONSTRAINT match_event_related_player_fk FOREIGN KEY (organization_id,team_entry_id,related_registration_id) REFERENCES player_registrations(organization_id,entry_id,id);
ALTER TABLE match_record_events ADD CONSTRAINT match_event_window_range CHECK (window_no IS NULL OR window_no BETWEEN 1 AND 20);
ALTER TABLE match_record_events ADD CONSTRAINT match_event_incident_note CHECK (incident_note IS NULL OR length(incident_note) BETWEEN 3 AND 500);
ALTER TABLE match_record_events DROP CONSTRAINT match_record_events_kind_check;
ALTER TABLE match_record_events ADD CONSTRAINT match_record_events_kind_check CHECK (kind IN ('goal','penalty','own_goal','yellow','second_yellow','red','substitution','incident','shootout_goal','shootout_miss','void'));
ALTER TABLE match_record_events DROP CONSTRAINT match_record_events_check;
ALTER TABLE match_record_events ADD CONSTRAINT match_record_events_check CHECK (
  (kind='void' AND team_entry_id IS NULL AND registration_id IS NULL AND related_registration_id IS NULL AND incident_note IS NULL AND window_no IS NULL AND period IS NULL AND minute IS NULL AND voids_event_id IS NOT NULL AND reason IS NOT NULL)
  OR
  (kind<>'void' AND team_entry_id IS NOT NULL AND voids_event_id IS NULL AND reason IS NULL
    AND (registration_id IS NOT NULL OR kind IN ('goal','penalty','own_goal','incident','shootout_goal','shootout_miss'))
    AND (kind='substitution')=(related_registration_id IS NOT NULL)
    AND (kind='incident')=(incident_note IS NOT NULL)
    AND (window_no IS NULL OR kind='substitution'))
);

CREATE FUNCTION preserve_match_acta_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'match acta snapshots are immutable';
END
$$;
CREATE TRIGGER match_acta_snapshot_immutable BEFORE UPDATE OR DELETE ON match_acta_snapshots
FOR EACH ROW EXECUTE FUNCTION preserve_match_acta_snapshot();
