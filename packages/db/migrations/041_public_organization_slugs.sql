-- Identificador público estable, independiente del nombre visible de la organización.
ALTER TABLE organizations ADD COLUMN public_slug text;

UPDATE organizations SET public_slug =
  coalesce(nullif(trim(both '-' from left(trim(both '-' from regexp_replace(translate(lower(name), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g')), 60)), ''), 'organizacion')
  || '-' || replace(id::text, '-', '');

ALTER TABLE organizations ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE organizations ADD CONSTRAINT organizations_public_slug_format
  CHECK (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
CREATE UNIQUE INDEX organizations_public_slug_unique ON organizations(public_slug);

CREATE FUNCTION assign_public_organization_slug() RETURNS trigger AS $$
BEGIN
  IF NEW.public_slug IS NULL THEN
    NEW.public_slug :=
      coalesce(nullif(trim(both '-' from left(trim(both '-' from regexp_replace(translate(lower(NEW.name), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g')), 60)), ''), 'organizacion')
      || '-' || replace(NEW.id::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER organizations_public_slug_insert BEFORE INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION assign_public_organization_slug();
