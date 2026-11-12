# Ensayo integral privado de Copa Caacupé — 12/11/2026

El ensayo se ejecutó exclusivamente en `torneos_stage`, con API en `127.0.0.1:4313`, medios y worker separados. El script [vps-private-mirror-tournament.ts](../../scripts/vps-private-mirror-tournament.ts) rechaza cualquier otro nombre de base, host, puerto u origen. Antes de comenzar se guardó `/srv/torneos/backups/stage-before-full-20261112.dump` (323127 bytes, 69 tablas con datos). El ensayo no se sincroniza hacia producción.

## Recorrido completado

- Diez equipos; 20 jugadores sintéticos sin documento, diez listas de buena fe aprobadas y solo un jugador visible públicamente por equipo. Se ensayó procedencia externa.
- 25 partidos oficiales de grupos en J1–J9, incluyendo los cinco interseriales. Se registraron gol de penal, penal errado, tarjeta Azul, amarilla y una corrección individual de evento. Se resolvieron tres grupos de empates mediante decisiones manuales auditadas.
- Cuatro cuartos oficiales en J10–J11; dos llegaron a tanda. Los cuatro ganadores se sembraron según la tabla general de la primera etapa.
- Seis partidos de Finales en J12–J14. Dos equipos empataron en puntos por el título. Se ensayaron las decisiones «sin extra» y «con extra»; J15 se programó con una sede sintética y terminó 1–1, penales 3–2. El campeón sintético fue Mercury.
- Resultado: 36 partidos y actas oficiales, 15 jornadas publicadas y 15 penales convertidos en tandas. La API pública sin sesión devolvió los 36 encuentros, ambos grupos con cinco puestos, tabla general, cuatro sembrados, tabla de Finales, diez goleadores, diez registros de valla y el ganador del extra. Las fichas públicas mostraron un jugador por equipo y ningún documento ni fecha de nacimiento.
- Se generaron y descargaron PNG de resultado del extra, clasificación, goleadores y valla. El barrido previo del mismo espejo había verificado además resultado JPG/PDF y jornada PNG.

## Hallazgos

La tanda admite periodo vacío cuando el reglamento solo configura PT y ST; etiquetarla como TE devuelve `PERIOD_NOT_ALLOWED`, que es coherente con la configuración actual. El partido extra se crea sin hora ni sede y exige programación antes de publicar J15, como cualquier partido no vinculado al plan por posiciones. El portal público mostraba resultado y penales del extra, pero no el nombre del campeón; se añadió ese rótulo en la vista Finales.

El motor mantiene `final_tiebreak` para la tabla del todos contra todos cuando sus dos líderes empatan en puntos. El ganador del partido extra se conserva por separado en `titleExtra.winnerEntryId`; no se altera artificialmente la puntuación de esa tabla.

## Aislamiento comprobado

Al finalizar, `torneos_stage` tenía 20 jugadores, 36 partidos y actas oficiales, 15 jornadas publicadas, tres desempates manuales, diez publicaciones de nombres y un evento Azul. `torneos_prod` seguía con **cero** jugadores, partidos, actas, jornadas, desempates y partidos extra. La Copa real y su sorteo permanecen intactos.

El escenario cubre el recorrido completo y varias ramas importantes, pero no todas las combinaciones posibles ni la aceptación física en móviles. Los datos de este espejo son de prueba; no deben publicarse ni restaurarse en producción.
