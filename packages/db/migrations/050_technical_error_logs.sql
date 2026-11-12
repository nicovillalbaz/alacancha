-- Fallos operativos sin cuerpos de petición, contraseñas, tokens ni datos de jugadores.
CREATE TABLE technical_error_logs (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('api','worker')),
  organization_id uuid,
  actor_id uuid,
  request_id text,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 180),
  method text,
  status_code integer CHECK (status_code BETWEEN 400 AND 599),
  error_code text NOT NULL CHECK (length(error_code) BETWEEN 1 AND 80),
  error_type text,
  message text CHECK (message IS NULL OR length(message) <= 500),
  resource_id uuid
);
CREATE INDEX technical_error_logs_recent ON technical_error_logs(occurred_at DESC,id DESC);
CREATE INDEX technical_error_logs_organization ON technical_error_logs(organization_id,occurred_at DESC);
