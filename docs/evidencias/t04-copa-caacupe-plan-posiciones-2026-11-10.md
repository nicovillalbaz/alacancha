# T04 — Plan privado por posiciones de Copa Caacupé (10/11/2026)

## Alcance y datos

La migración `043_fixture_position_blueprint.sql` agrega una matriz privada por categoría: diez posiciones A1–B5, 35 cruces y revisión del plan. Cada cruce guarda etapa, fecha deportiva, jornada programada, día previsto y referencias de local/visitante. Son 25 encuentros de grupos (incluidos cinco interseriales), cuatro cuartos y seis del cuadrangular. J4 contiene F2/F3 y J6 contiene F3/F4. Los cinco cruces de F1 esperan el reparto J1/J2; la fecha del posible partido extra del 22/12 queda como reserva, sin crear un cruce.

El cargador `scripts/load-fcfs-draft.ts` incorporó el plan a la Copa local existente. Verificó 35 cruces, diez posiciones, cinco partidos de F1 aún sin jornada, cero `draft_matches` y ninguna presencia pública. No asignó los diez clubes a A1–B5, no cargó horarios/sedes por partido y no publicó reglamento, fixture ni resultados. Los equipos ya cargados se conservan; la carga es repetible y reutiliza el plan existente.

## API, UI y permisos

La API permite leer el plan con acceso a la organización, crearlo solo como organizador, asignar/quitar/reemplazar/intercambiar clubes en posiciones y dividir F1 en dos partidos J1 y tres J2. El servidor valida que el club esté activo en la misma categoría y organización, rechaza dos códigos iguales en la apertura, impide cambios de sorteo después de generar un fixture oficial y audita cada mutación. Un equipo ocupado puede intercambiarse con otro o ser reemplazado directamente. La identidad del club se resuelve por posición en la vista, de modo que asignar A1 actualiza todas las filas que usan A1 sin duplicar ni reescribir partidos.

Fixture muestra pestañas **Fechas**, **Jornadas** y **Sorteo**. Cada fecha o jornada se consulta por separado; Sorteo ofrece **Equipos** y **Apertura**. La selección de club se hace con botones táctiles y los nombres largos se acomodan en la lista. Los estados pendientes muestran códigos por posición; la apertura indica los dos días aún sin reparto. El plan sigue privado.

## Comprobación

- Respaldo cifrado previo a la migración: `.local/backups/torneos-1794310689403-2a0080a9.backup`. La migración es aditiva; no se borraron datos ni se hizo importación masiva. La restauración aislada de respaldos locales se había ensayado en el incremento anterior; este archivo concreto no se restauró.
- Migración 043 aplicada localmente y cargador FCFS ejecutado. Salida: `plannedPositionGames:35`, `fixtureMatches:0`, `publicVisible:false`.
- Integración: lectura y mutación permitidas al organizador; acceso cruzado y escritura de administrador de equipo denegados; movimiento, intercambio, reemplazo, reparto 2/3 y duplicado inválido. `npm test`: **86/86**.
- `npm run typecheck` y `npm run build`: correctos.
- Chrome local a **320 y 390 px**: Fechas, J4, Sorteo y selección de los diez clubes sin desborde horizontal. Se comprobó el nombre largo de Asociación de Jóvenes del Barrio Loma. Las capturas locales están en `.local/qa-fixture/` y no se versionan.

## Pendiente

Implementar el motor que convierta este plan en partidos oficiales editables: interserial puntuable en ambas tablas, clasificación de cuatro por grupo, cuartos con suplementario/penales, siembra del cuadrangular a partir de la tabla general de primera etapa y resolución manual del eventual partido extra. Confirmar jerarquía de desempates y empate múltiple con el organizador. La publicación y la aceptación en teléfono físico siguen pendientes.
