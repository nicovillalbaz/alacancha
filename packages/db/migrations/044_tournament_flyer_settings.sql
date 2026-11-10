-- T08: configuración privada del diseño de flyers por torneo.
CREATE TABLE tournament_flyer_settings (
  organization_id uuid NOT NULL,
  tournament_id uuid NOT NULL,
  template_key text NOT NULL DEFAULT 'forest' CHECK (template_key IN ('forest','paper')),
  size_code text NOT NULL DEFAULT 'square' CHECK (size_code IN ('square','portrait','story','print')),
  format text NOT NULL DEFAULT 'png' CHECK (format IN ('png','jpg','pdf')),
  primary_color text NOT NULL DEFAULT '#102B2B' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text NOT NULL DEFAULT '#A9E1B9' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  cup_logo_id uuid,
  organizer_logo_id uuid,
  federation_logo_id uuid,
  revision integer NOT NULL DEFAULT 1,
  PRIMARY KEY (organization_id,tournament_id),
  FOREIGN KEY (organization_id,tournament_id) REFERENCES tournaments(organization_id,id),
  FOREIGN KEY (organization_id,cup_logo_id) REFERENCES media(organization_id,id),
  FOREIGN KEY (organization_id,organizer_logo_id) REFERENCES media(organization_id,id),
  FOREIGN KEY (organization_id,federation_logo_id) REFERENCES media(organization_id,id)
);
