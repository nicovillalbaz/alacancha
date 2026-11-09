ALTER TABLE organizations ADD COLUMN creation_key uuid UNIQUE;
ALTER TABLE organizations ADD COLUMN creation_fingerprint text;
