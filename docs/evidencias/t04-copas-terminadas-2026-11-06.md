# Tres copas terminadas y desempates — 06/11/2026

## Datos y recorrido

| Torneo sintético local | Fechas | Partidos oficiales | Cierre |
|---|---:|---:|---|
| Copa por grupos · Finalizada 2026 | 5 | 15 | Dos grupos, semifinales y final por penales. |
| Copa eliminación · Finalizada 2026 | 3 | 5 | Semifinales de ida y vuelta por goles globales, una tanda y final. |
| Liguilla y eliminación · Finalizada 2026 | 8 | 13 | Liga, semifinales por puntos con tercer partido, final por puntos y penales. |

`npm run demo:finished` crea o retoma exclusivamente estos ejemplos en `torneos_local` de `127.0.0.1`; no importa datos reales. `npm run demo:verify` lee API públicas sin sesión y exige todas las actas oficiales, las llaves con ganador, tandas y tercer encuentro. La respuesta pública del fixture identifica Ida, Vuelta y Desempate; el cuadro muestra global, penales o tercer resultado como marcador principal, según el caso. El detalle del partido conserva los eventos de penales por separado de los goles ordinarios.

## Incremento vertical

- **Regla y datos:** `competitionPlan.rounds[].resolution` versionado. Migración 040 amplía `leg` a 3 y agrega `decider_match_id` con clave de la misma organización, unicidad y vínculo obligatorio con la vuelta. Los datos existentes quedan intactos.
- **API:** `fixture/advance` toma actas aprobadas, usa puntos configurados cuando corresponde y crea el tercer encuentro privado solo ante igualdad. La consulta pública muestra criterio, resultados por encuentro, puntos o global, tanda y ganador. Rectificación de acta y cambio manual de participantes consideran el tercer partido.
- **UI:** elección directa del criterio en el reglamento; Cuadro público por rondas con ganador resaltado y sin puntos de serie como marcador; Fechas y detalle identifican Ida, Vuelta, Desempate y penales. Clasificación de la liguilla alterna Liguilla y Eliminación dentro de la misma sección, sin cards.
- **Estadísticas:** la tabla de posiciones usa solo la fase inicial; Goleadores y Valla suman todas las actas aprobadas, también eliminatoria y tercer partido. Los tiros de tanda no incrementan goles ni goles recibidos. La Valla del organizador, la vista pública y el flyer leen los mismos totales de toda la competición.
- **Permisos y vacíos:** el avance y las correcciones requieren organizador en su organización; las rutas públicas solo leen torneos, equipos y fechas publicados. Sin acta decisiva, el cuadro conserva ganador pendiente. Los casos permitidos y denegados de organización se mantienen en `tests/integration/access.test.ts`.
- **Pruebas:** `npm run build`, `npm run test`, `npm run typecheck`, `npm run demo:verify`; caso unitario compara global, puntos con penales, puntos con tercero y un puntaje distinto de 3/1/0. La verificación pública contrasta goleadores y goles recibidos con todos los partidos oficiales, y exige que el marcador del cuadro refleje penal o tercer partido. La vista se revisó en navegador a 320 y 413 CSS px; `scrollWidth` no superó el ancho de 320 px.

## Resguardo y límites

Antes de migrar se creó un respaldo cifrado y `npm run restore:check` restauró una base aislada: 62 tablas y 871 archivos con filas y sumas de verificación iguales. La migración 040 fue aplicada sin borrar tablas ni registros. Pruebas físicas, teclado virtual, red inestable, lector de pantalla y aceptación del propietario siguen pendientes; no se marcan como realizadas.
