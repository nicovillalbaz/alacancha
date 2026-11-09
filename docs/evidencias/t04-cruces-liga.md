# T04-01 — primer incremento de cruces de liga

**Fecha:** 28/10/2026. **Estado:** implementado y probado en código local con datos sintéticos. T04 sigue abierta: agenda, reprogramación, cuadros, publicación y portal no están implementados. Sin Docker ni aceptación física.

## Alcance verificable

| Ticket | Datos y migración | API y permisos | UI, errores y vacío | Pruebas |
|---|---|---|---|---|
| T04-01, liga | Migración aditiva `014_t04_league_pairings.sql`: `fixture_phases`, `fixture_rounds`, `fixture_byes`; `draft_matches` recibe fase, ronda, vuelta y fecha opcional. Se conserva la identidad del partido T03. | Crear fase desde reglamento publicado de liga y generar cruces una sola vez. El servidor obtiene la organización del contexto autenticado y comprueba categoría/recurso. Solo el organizador genera; la lectura es privada. Reintentos y solicitudes concurrentes devuelven la fase existente. | Ruta móvil `#/fixture/:categoryId` desde categoría; lista de equipos, fase privada, rondas, descansos y partidos. Estado sin fase, regla sin publicar, formato aún no soportado y generación completada con mensaje explícito. No ofrece publicación. | Motor puro para equipos pares/impares, una rueda e ida/vuelta; integración de permisos permitidos/denegados entre organizaciones, idempotencia, concurrencia, descansos y reutilización T03. |

La generación reutiliza un encuentro borrador T03 si coincide la pareja y localía; en una rueda admite la pareja inversa. Conserva fecha y planilla. Rechaza borradores incompatibles o ambiguos en lugar de duplicarlos. Después de generar, no se permite crear un partido suelto en esa categoría. Los cruces nuevos quedan sin fecha, hora, sede ni jornada oficial. No se incluyen en el portal anónimo.

## Comprobaciones y operación

- Antes de migrar: respaldo cifrado `.local/backups/torneos-1793212411367-874bc695.backup` y `npm run restore:check` en `torneos_restore_20261028_86eefb83`: 68 archivos, filas y huellas iguales.
- Migración 014 aplicada en la instancia PostgreSQL nativa local. `npm test`: **46/46** pruebas aprobadas después del ajuste de reutilización; `npm run build`: aprobado.
- Tras la reparación y las pruebas finales, `npm run restore:check` volvió a restaurar la base sintética en `torneos_restore_20261028_89ea2595`: 76 archivos, filas y huellas iguales.
- QA con categoría y equipos sintéticos: creación de fase, generación y lectura de un cruce con la fecha previa `2026-10-28`. El servidor de desarrollo anterior había ejecutado una versión previa del generador y produjo un duplicado sintético. Antes de reparar se tomó `.local/backups/torneos-1793213177916-1a529653.backup` y se ensayó restauración en `torneos_restore_20261028_efbdab47` (74 archivos y huellas iguales). Se eliminó únicamente el encuentro vacío duplicado, se vinculó el encuentro original a la ronda y se auditó la reparación. El servidor se reinició con el código nuevo y la pantalla muestra un solo encuentro fechado.
- Navegador a 320, 390, 768 y 1280 px: un `h1`, sin desbordamiento horizontal ni controles visibles menores de 44 px. [Captura de cruces a 390 px](t04-cruces-390.png). Pruebas físicas con teclado virtual, red inestable, texto largo y lector de pantalla pendientes.

## Próximo incremento

T04-02 debe introducir jornadas de edición compartibles entre categorías, sede/cancha, fecha, hora y duración, orden cronológico y conflictos. La agrupación V02 se debe concretar al diseñar esa agenda sin alterar las rondas ni las planillas existentes. Grupos y eliminación de T04-01 también siguen pendientes; la API los rechaza explícitamente. Después vienen reprogramación, cuadros y publicación única.
