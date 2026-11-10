# T04 — motor de Copa Caacupé, 10/11/2026

## Datos y migración

- Respaldo cifrado local previo: `.local/backups/torneos-1794320306561-68690bff.backup`. `npm run restore:check`: 67 tablas, mismo número de filas y sumas de verificación; correcto.
- Migración 046: vínculo único entre cruce planificado y partido oficial. Migración 047: decisión y vínculo de eventual partido extra. Ninguna elimina datos.
- El borrador real de FCFS conserva diez equipos, 35 cruces sin clubes sorteados, cero partidos oficiales y reglamento privado. Se ajustó su puntuación a victoria 2, empate 1 y derrota 0. No se fijó un orden de desempates no confirmado.

## API y UI

- `positionCompetitionState` reconstruye los resultados desde actas aprobadas. El interserial suma a los dos grupos y una sola vez a la tabla general. Cuartos se resuelven por goles o tanda; los cuatro ganadores se ordenan con su posición anterior en la general para formar el cuadrangular.
- `POST .../fixture/blueprint/sync` prepara primero 25 partidos de grupos y, cuando hay resultados, cuatro cuartos y seis encuentros del cuadrangular. Es idempotente. Un cambio de adversarios en un partido iniciado o publicado requiere revisión manual.
- El organizador revisa puntos y desempates y confirma el reglamento fijo antes de publicarlo. Fixture, Estadísticas y portal público muestran las etapas, tablas, marcadores y enlaces a partidos disponibles. Los resultados públicos incluyen solo jornadas publicadas.
- Cuando seis actas del cuadrangular dejan empate en puntos arriba, el organizador decide manualmente «Sin extra» o crea J15 para dos equipos empatados. El extra no se crea solo; puede corregirse antes de comenzar o publicarse. El acta aprobada determina ganador por goles o penales.
- En Partidos, los días de esta Copa se rotulan Jornada, Cuartos, Cuadrangular o Partido extra según corresponda; no se presentan como «Fecha 15» deportiva.
- Si A, B o la general conservan un empate exacto después de los criterios configurados, Estadísticas permite ordenar únicamente a los equipos empatados mediante toques. `POST .../fixture/blueprint/tiebreak` exige el conjunto exacto, las 25 actas de grupos y alcance de organizador. Persiste la decisión auditada con una huella de reglamento, posiciones y actas: una rectificación la invalida y obliga a decidir de nuevo. La sincronización posterior prepara cruces solo cuando quedan resueltos, protegiendo partidos iniciados o publicados.
- Permisos comprobados: organizador propio permitido; otra organización y administrador de equipo denegados.

## Verificación

- `npm test`: 91/91. Además del recorrido de 35 partidos, se probaron 25 empates sintéticos, órdenes manuales de A/B/general, creación de cuartos y cuadrangular, orden inválido o duplicado, acceso denegado entre organizaciones y caducidad de la decisión tras rectificar un acta.
- `npm run typecheck` y `npm run build`: correctos.
- API y Vite locales quedaron activos en 4312/4311. En una instancia aislada con `torneos_test`, Chrome mostró la tabla, subpestañas A/B y cinco botones de orden a 320, 390 y 768 px sin desborde horizontal. Se cambió de grupo con toque y teclado; un nombre largo se truncó sin romper la fila. Al detener la API de prueba antes de guardar apareció un mensaje de conexión y el orden elegido permaneció para reintentar. El nombre sintético se restauró y la base real de FCFS no se modificó. Aceptación en teléfono físico pendiente.

## Pendiente

- Aceptación en teléfono físico con el organizador cuando haya resultados reales.
- Confirmar la jerarquía de desempates con FCFS, sortear los diez clubes y repartir J1/J2 antes de activar los partidos reales.
