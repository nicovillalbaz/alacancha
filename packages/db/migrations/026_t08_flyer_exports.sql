-- T08: cada flyer es una versión inmutable de datos deportivos y plantilla local.
CREATE TABLE flyer_exports (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  kind text NOT NULL CHECK (kind IN ('match','matchday','result','standings','bracket','semifinal','final','champion','notice')),
  source_id uuid NOT NULL,
  page_no integer NOT NULL DEFAULT 1 CHECK (page_no BETWEEN 1 AND 100),
  version integer NOT NULL CHECK (version > 0),
  template_key text NOT NULL CHECK (length(template_key) BETWEEN 2 AND 40),
  template_version integer NOT NULL CHECK (template_version > 0),
  format text NOT NULL CHECK (format IN ('png','jpg','pdf')),
  size_code text NOT NULL CHECK (size_code IN ('square','portrait','story','print')),
  source_key text NOT NULL CHECK (length(source_key)=64),
  request_key uuid NOT NULL,
  input_fingerprint text NOT NULL CHECK (length(input_fingerprint)=64),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  note text CHECK (note IS NULL OR length(note) BETWEEN 3 AND 160),
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 300),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed')),
  filename text,
  checksum text,
  byte_length integer CHECK (byte_length IS NULL OR byte_length BETWEEN 1 AND 12582912),
  generated_at timestamptz,
  error_message text,
  public_visible boolean NOT NULL DEFAULT false,
  published_by uuid REFERENCES users(id),
  published_at timestamptz,
  publication_reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,request_key),
  UNIQUE (organization_id,kind,source_id,page_no,format,size_code,version),
  CHECK ((status='ready')=(filename IS NOT NULL AND checksum IS NOT NULL AND byte_length IS NOT NULL AND generated_at IS NOT NULL)),
  CHECK (NOT public_visible OR (status='ready' AND published_by IS NOT NULL AND published_at IS NOT NULL AND publication_reason IS NOT NULL))
);
CREATE INDEX flyer_exports_source_idx ON flyer_exports(organization_id,kind,source_id,created_at DESC);
CREATE INDEX flyer_exports_queue_idx ON flyer_exports(created_at,id) WHERE status='queued';
CREATE INDEX flyer_exports_public_idx ON flyer_exports(organization_id,published_at DESC) WHERE public_visible;

CREATE FUNCTION preserve_flyer_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'flyer export history is immutable'; END IF;
  IF (OLD.organization_id,OLD.kind,OLD.source_id,OLD.page_no,OLD.version,OLD.template_key,OLD.template_version,
      OLD.format,OLD.size_code,OLD.source_key,OLD.request_key,OLD.input_fingerprint,OLD.snapshot,OLD.note,OLD.reason,OLD.created_by,OLD.created_at)
     IS DISTINCT FROM
     (NEW.organization_id,NEW.kind,NEW.source_id,NEW.page_no,NEW.version,NEW.template_key,NEW.template_version,
      NEW.format,NEW.size_code,NEW.source_key,NEW.request_key,NEW.input_fingerprint,NEW.snapshot,NEW.note,NEW.reason,NEW.created_by,NEW.created_at)
  THEN RAISE EXCEPTION 'flyer export source is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER flyer_snapshot_immutable BEFORE UPDATE OR DELETE ON flyer_exports
  FOR EACH ROW EXECUTE FUNCTION preserve_flyer_snapshot();
