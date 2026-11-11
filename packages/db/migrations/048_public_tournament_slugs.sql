-- Alias corto opcional para enlaces públicos de torneos; los enlaces antiguos siguen resolviendo.
ALTER TABLE tournaments ADD COLUMN public_slug text;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_public_slug_format
  CHECK (public_slug IS NULL OR public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE UNIQUE INDEX tournaments_public_slug_unique ON tournaments(public_slug) WHERE public_slug IS NOT NULL;
