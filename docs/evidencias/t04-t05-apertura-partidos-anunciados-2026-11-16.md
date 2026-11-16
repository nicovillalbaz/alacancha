# Apertura de partidos anunciados — 16/11/2026

## Datos y permisos

No hay migración. El calendario publicado permanece versionado; preparar una jornada crea cinco `draft_matches` sin fecha en una transacción, conserva los identificadores en reintentos y audita la creación. La operación exige organizador de la misma organización, categoría publicada y revisión vigente. Se rechazan cruces ajenos, equipos inactivos y jornadas modificadas.

## API y pantallas

`POST /organizations/:id/categories/:categoryId/fixture/announced/rounds/:ordinal/prepare` devuelve la jornada y el partido elegido. Fixture y Partidos abren ese partido directamente; el detalle permite publicar explícitamente la jornada completa y cargar eventos. El organizador ve si el cruce está preparado, publicado o tiene resultado. El público conserva el resto del anuncio y abre los partidos oficiales sin mostrar fechas inexistentes.

## Verificación

La prueba de integración sintética cubre acceso permitido y dos denegados, cruce inválido, repetición idempotente, publicación sin fecha, inicio de acta y continuidad de los 45 cruces anunciados. Suite local: 102 pruebas aprobadas. TypeScript de API y web aprobado. La comprobación física en teléfono, teclado y red inestable queda pendiente. No se publicó ninguna jornada real.
