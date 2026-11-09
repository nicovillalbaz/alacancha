-- La ficha y el documento son datos opcionales de registro. NULL no representa
-- una identidad inventada ni participa en los índices de duplicados.
ALTER TABLE players ALTER COLUMN document_kind DROP NOT NULL;
ALTER TABLE players ALTER COLUMN document_ciphertext DROP NOT NULL;
ALTER TABLE players ALTER COLUMN document_fingerprint DROP NOT NULL;
ALTER TABLE players ALTER COLUMN document_last_four DROP NOT NULL;
ALTER TABLE players ADD CONSTRAINT player_document_pair_check CHECK (
  (document_kind IS NULL AND document_ciphertext IS NULL AND document_fingerprint IS NULL AND document_last_four IS NULL)
  OR (document_kind IS NOT NULL AND document_ciphertext IS NOT NULL AND document_fingerprint IS NOT NULL AND document_last_four IS NOT NULL)
);
ALTER TABLE player_registrations ALTER COLUMN registration_number DROP NOT NULL;
ALTER TABLE player_registrations DROP CONSTRAINT player_registrations_registration_number_check;
ALTER TABLE player_registrations ADD CONSTRAINT player_registrations_registration_number_check CHECK (registration_number IS NULL OR length(registration_number) BETWEEN 1 AND 40);
