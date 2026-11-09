# T09 — preparación técnica local, 29/10/2026

**Estado:** incremento parcial T09-01/02/03/04. No se autoriza piloto ni despliegue. Sin migraciones nuevas ni datos reales.

## Hallazgos y correcciones

| Área | Hallazgo | Cambio y comprobación |
|---|---|---|
| Respaldo | La huella fija solo cubría nueve tablas T01 y los archivos de `media`; una restauración podía parecer íntegra sin documentos privados ni flyers. | Archivo v2 enumera las tablas públicas y guarda `media`, `player_documents` y `flyer_exports` listos con SHA-256. La restauración compara cada tabla y archivo en un destino nuevo. |
| Captura sin red | `signIn` y `signOut` vaciaban la cola IndexedDB, con posible pérdida tras sesión vencida. | Los eventos nuevos guardan `userId`; la cola persiste y se filtra por capturista, organización y partido. El servidor mantiene el control de sesión y permiso al sincronizar. |
| Rendimiento | No había línea de base reproducible. | `npm run perf:check` ejecuta lecturas locales sin mutar datos y guarda dataset, p50, p95 y máximo. |

## Evidencia ejecutada

- `npm run restore:check`: versión 2, 59 tablas, 301 archivos, filas y checksums iguales; 11.774 ms en este equipo. Incluye imágenes, documentos privados y flyers de pruebas sintéticas. El respaldo inicial del turno, previo a la corrección, solo comparaba nueve tablas y 182 archivos.
- `npm run perf:check` (última ejecución): 583 organizaciones, 3.198 participaciones, 3.535 inscripciones, 2.672 partidos, 406 eventos y 50 flyers sintéticos. Se eligió la organización con más publicaciones de Fecha (6) y la categoría publicada con más participaciones (6). Veinte solicitudes por ruta, concurrencia cuatro: salud p50/p95 1/15 ms, fixture público 6/108 ms, estadísticas públicas 10/66 ms. Es una muestra corta en `torneos_test`, no una prueba de capacidad de producción.
- `npm test`: 63/63. Incluye un acceso permitido y otro denegado entre organizaciones, CSRF/origen, privacidad de documentos, reintentos de eventos, revocación y publicación de flyers. `npm run typecheck` y `npm run build`: aprobados.
- `npm run ops:check`: base local accesible, 0 flyers antiguos/fallidos, 0 publicaciones atrasadas, respaldo local más reciente de 0,06 h y 75,85 GiB libres; resultado `ok` en una ejecución manual. [Runbook local](../runbooks/t09-incidentes-y-recuperacion.md).
- Se añadió comprobación opcional de archivo existente mediante `BACKUP_FILE`; el ensayo de ese modo no concluyó en este entorno porque la conexión local a PostgreSQL devolvió `EACCES` al lanzar el proceso con esa variable (primero en `createdb`, luego en la sonda SQL). El ensayo normal sí terminó correctamente. Debe repetirse con una copia externa real.

## Límites y siguientes puertas

**Revalidación local 29/10/2026 tras migración 029:** restauración aislada de 60 tablas y 371 archivos, filas y huellas iguales en 18,7 s; suite final 68/68 y build aprobados. `perf:check` sobre 631 organizaciones, 3.603 participaciones, 3.920 inscripciones y 3.060 partidos sintéticos: p95 de fixture público 123 ms y estadísticas 83 ms con 20 solicitudes por ruta y concurrencia cuatro. `ops:check`: `ok`, sin trabajos antiguos o fallidos y respaldo local de 0,04 h. Es una muestra corta; no mide carga sostenida ni dispositivos reales.

**Muestra repetida de lectura:** `npm run perf:load` ejecutó 200 lecturas por ruta con concurrencia ocho en `torneos_test` (633 organizaciones, 3.609 participaciones y 3.067 partidos sintéticos). Fixture público p95 16 ms/máximo 286 ms; estadísticas p95 20 ms/máximo 107 ms. El resultado queda en `.local/perf-load.json`. Usa `Fastify.inject` y una categoría de seis equipos: no representa tráfico de red, torneos simultáneos activos ni captura de eventos. No se eligieron índices nuevos sin una consulta problemática medida.

1. T09-01: faltan carga sostenida, torneos activos simultáneos, planteles grandes representativos, capturas concurrentes y benchmark del worker. No hay índice añadido por anticipación.
2. T09-02: la corrección evita el borrado automático; faltan prueba de modo avión, reinicio de PWA, sesión revocada, dos capturistas y resolución de conflictos en teléfonos. Los eventos de cola creados antes de añadir `userId` permanecen en IndexedDB, pero no se sincronizan automáticamente; cualquier instalación anterior requiere revisión manual antes de usarla en piloto.
3. T09-03: hay controles existentes de permisos por recurso, CSRF/origen, CSP en API, archivos privados y autorización de publicación; la batería de integración pasó. Faltan auditoría completa de endpoints, revisión de retención y tratamiento legal de C.I./menores con responsables locales. No usar datos reales mientras esté abierto.
4. T09-04: la restauración fue local y el tiempo medido es de laboratorio. Falta copia cifrada fuera del servidor principal y recuperación desde esa copia, operación de staging, programación de monitoreo/alertas y medición de RPO/RTO bajo condiciones reales. El dump aún tiene límite de 64 MiB en memoria.
5. T09-05/06: faltan dispositivos iPhone/Android, usuarios de cada rol, sol exterior, señal irregular, marca/dominio, revisión legal y piloto acotado. T04 ya incluye avance de cuadro y reasignación auditada de cruces programados/publicados sin planilla ni acta tras rectificación; el QA visual nuevo y el tratamiento humano de cuadros ya iniciados siguen abiertos. T08 conserva su última comprobación visual pendiente.
