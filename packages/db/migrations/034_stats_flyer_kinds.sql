-- Los flyers de estadísticas comparten el historial versionado de T08.
ALTER TABLE flyer_exports DROP CONSTRAINT flyer_exports_kind_check;
ALTER TABLE flyer_exports ADD CONSTRAINT flyer_exports_kind_check
  CHECK (kind IN ('match','matchday','result','standings','scorers','defense','bracket','semifinal','final','champion','notice'));
