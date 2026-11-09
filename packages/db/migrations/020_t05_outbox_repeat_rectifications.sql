-- Una nueva versión del acta puede conservar la revisión de eventos.
-- Cada transición crea un hecho propio; la identidad HTTP evita reintentos duplicados.
ALTER TABLE match_record_outbox DROP CONSTRAINT match_record_outbox_organization_id_match_id_kind_revision_key;
