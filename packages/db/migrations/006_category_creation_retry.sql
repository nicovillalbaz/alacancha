ALTER TABLE categories ADD COLUMN request_key uuid UNIQUE;
ALTER TABLE categories ADD COLUMN creation_fingerprint text;
