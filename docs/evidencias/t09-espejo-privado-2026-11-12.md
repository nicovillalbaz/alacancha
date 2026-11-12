# T09 — Espejo privado y barrido de Copa Caacupé, 12/11/2026

## Aislamiento y respaldo

- Fuente: respaldo nuevo `/srv/torneos/backups/mirror-source-20261112T121801Z.dump`, restaurado en `torneos_stage`. La comprobación de restauración encontró 69 tablas; los medios se copiaron a `/srv/torneos/staging-media`.
- Cinco sesiones copiadas fueron revocadas en el espejo; no había invitaciones pendientes. La API escucha solo en `127.0.0.1:4313` y Caddy no contiene una ruta a ese puerto. `staging.env` tiene permiso `0640 root:torneos`, medios `0700 torneos:torneos`.
- `torneos-api`, `torneos-worker`, `torneos-staging-api` y `torneos-staging-worker` estaban activos. `/ready` del espejo respondió `200`.
- Antes de ensayar, la copia contenía una organización, un torneo, diez equipos, 35 cruces del plan y diez asignaciones de la revisión nocturna; no contenía partidos, jornadas, actas ni flyers oficiales.

## Recorridos comprobados

`scripts/vps-private-mirror-smoke.ts` usa una sesión efímera del organizador en `torneos_stage`; la revoca al terminar. Se negó con `403` una organización ajena. Comprobó organización, torneo, categoría, diez equipos, plan, competencia, Pagos con Azul, plantillas, sorteo, fixture y estadísticas públicos.

La sincronización inicial devolvió `blocked: opening`, que corresponde a los dos partidos de apertura aún no elegidos. Solo en el espejo se eligieron dos cruces, se sincronizaron 25 partidos en nueve jornadas y se publicó la primera con dos partidos. El portal del espejo mostró esos dos encuentros.

Se abrió el primer partido, se registró un gol de penal y un penal errado sin minuto, se confirmó el marcador 1–0 y se aprobó el acta. El fixture público del espejo mostró el resultado oficial. Una tarifa de ensayo de Gs. 10.000 para Azul quedó guardada; se cargó la multa manual a un equipo y se registró el cobro, con saldo pendiente cero.

Los flyers se previsualizaron en SVG y el worker generó y sirvió el resultado en PNG, JPG y PDF, además de la jornada en PNG. Los cuatro archivos devolvieron su tipo MIME correcto y contenido no vacío. Logo de organización, emblema de Copa y escudo de equipo respondieron `200 image/png`.

## Barrido y límites

`npm run audit:routes`: 191 rutas clasificadas, cero pendientes. `npm run typecheck`, `npm run build` y `npm test` (99/99) correctos. En la base del espejo, cero errores 5xx nuevos y cero flyers fallidos. En producción, después del ensayo, cero partidos, jornadas, actas, flyers y movimientos de pago de prueba; el espejo tenía 25 partidos, nueve jornadas, un acta, diez exportaciones de flyer acumuladas y dos movimientos.

Este recorrido comprueba rutas y generación real en el VPS, pero no equivale a navegar todas las pantallas en un teléfono físico ni demuestra ausencia absoluta de fallos. El espejo no se actualiza automáticamente y su acceso desde un teléfono requiere un túnel SSH en ese dispositivo o una solución privada adicional. No se hizo una prueba de carga sostenida ni una restauración desde copia externa.
