# T03-02 — Presentación y revisión de buena fe · 28/10/2026

**Estado:** segundo incremento funcional de T03, probado en local con datos sintéticos. La tanda sigue abierta: faltan archivos privados, elegibilidad completa y planilla de partido.

## Datos y API

La migración aditiva `008_good_faith_versions.sql` guarda versiones por participación de equipo con selección y snapshot privados. Solo puede haber una presentación pendiente. Una versión revisada conserva contenido, decisión, motivo, actor y fecha; una nueva presentación crea otra versión. La API usa `GET/POST .../entries/:entryId/good-faith` y `POST .../good-faith/review`, con comprobación del alcance de organización y equipo en servidor. La presentación compara la versión esperada y la selección actual para evitar sobrescrituras concurrentes. El snapshot no incluye el número de documento.

El administrador asignado presenta. El organizador aprueba, observa o rechaza con motivo. La aprobación requiere reglamento publicado, cupo válido y edad conforme a la fecha de corte fija cuando esté configurada. Si el reglamento exige documentos, se bloquea con `DOCUMENTS_PENDING`: todavía no hay carga ni revisión de archivos. Los estados de inscripción aprobados se actualizan en la aprobación. Una observación o rechazo permite presentar una versión nueva sin alterar la anterior.

## UI y verificación

La pantalla móvil muestra versión, estado, motivo e historial junto a la lista. El equipo puede presentar de nuevo tras una revisión; el organizador dispone de acciones directas para aprobar, observar o rechazar. Se verificó en navegador la presentación de v1 sintética, el bloqueo de aprobación con reglamento aún en borrador y la observación con motivo. [Captura de revisión a 390 px](t03-buena-fe-revision-movil.jpg) y [matriz de anchos](t03-revision-layout.json). A 320, 390, 768 y 1280 px hubo un H1, ningún desbordamiento horizontal y ningún control visible menor de 44 px.

- Respaldo previo a migración: `torneos-1793205141019-35972314.backup`, base sintética.
- `npm test`: **37/37**. Incluye presentación autorizada y denegada entre organizaciones/equipos, selección obsoleta, duplicado pendiente, permisos de revisión, bloqueo por regla no publicada, bloqueo por documentos requeridos, aprobación con regla válida, snapshot inmutable y v2 observada.
- `npm run build`: API, Vue/TypeScript y Vite correctos.
- `npm run restore:check`: `torneos_restore_20261028_83b3a257`, **40 archivos**, mismas filas y checksums, 2.778 ms.

## Pendientes de aceptación

Carga y revisión de documentos privados; cálculo por fecha de partido y movimientos/transferencias; edición auditada de identidad; importación CSV con vista previa, PDF privado y planilla versionada. La revisión con teclado virtual, red inestable, texto/zoom al 200 %, lector de pantalla y teléfonos físicos aún no se hizo. No hay aceptación estética del propietario.
