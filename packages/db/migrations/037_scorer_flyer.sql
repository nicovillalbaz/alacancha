-- Flyer individual de goleador; conserva los archivos anteriores.
ALTER TABLE flyer_exports DROP CONSTRAINT flyer_exports_kind_check;
ALTER TABLE flyer_exports ADD CONSTRAINT flyer_exports_kind_check
  CHECK (kind IN ('match','matchday','result','standings','scorers','scorer','defense','bracket','semifinal','final','champion','notice'));
