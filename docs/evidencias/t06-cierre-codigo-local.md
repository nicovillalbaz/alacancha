# T06 — cierre de código local (29/10/2026)

## Alcance entregado

- **Datos y migración:** 021–024 agregan caché reconstruible de estadísticas, autorización de nombre público, expedientes y decisiones disciplinarias, catálogo versionado de multas, notificaciones, ajustes de puntos, historial de cumplimiento y órdenes de desempate documentados. No se ejecutó una migración destructiva.
- **API y permisos:** clasificación por fase/grupo desde la última acta aprobada; estadísticas de jugador desde eventos válidos y planillas congeladas; reconstrucción idempotente; autorización por organización y recurso. El portal no devuelve identificadores de inscripciones ni datos civiles. El organizador decide ajustes, desempates, sanciones y multas; el administrador de equipo consulta y apela solo sus expedientes. Casos permitidos y denegados entre organizaciones figuran en integración.
- **UI móvil:** clasificación y goleadores públicos; panel privado de equipo y organizador con expedientes, revisión, resolución, PDF, apelación, notificaciones, catálogo, publicación de nombre, ajustes y desempate por orden visible. Estados vacíos y errores de API son visibles. El historial de servicio se muestra en la resolución.
- **Reglas:** autogol y tanda no aumentan goleadores; segunda amarilla cuenta en amarillas y rojas; una propuesta no suspende automáticamente; apelación no levanta sanción. Ajustes y órdenes manuales requieren motivo. Una rectificación cambia la huella de fuente y vuelve a calcular tabla y goleadores. La decisión manual de desempate solo se aplica a esa huella.

## Pruebas y respaldo

`npm run test`: **57/57**. Incluye dos encuentros ficticios con actas oficiales, 2–1 con corrección de autor, segunda amarilla, tablas públicas y privadas, caché, ajuste y reversión de puntos, desempate manual, propuestas idempotentes, multa única, apelación y revocación, cumplimiento de suspensión con rectificación, PDF privado y acceso cruzado denegado. `npm run typecheck` y `npm run build`: aprobados.

Antes de las migraciones 021, 022, 023 y 024 se ejecutó `npm run restore:check` con datos sintéticos; destinos de restauración nuevos: `torneos_restore_20261029_74fe366b` (118 archivos), `torneos_restore_20261029_51241402` (122), `torneos_restore_20261029_3a12e61a` (130) y `torneos_restore_20261029_16989401` (136). En los cuatro ensayos coincidieron filas y huellas. Los respaldos quedan en `.local/backups/`.

## Revisión visual y límites

Chrome local completó **27/27 comprobaciones** con datos sintéticos: portal y organizador a 320, 390, 768 y 1280 px sin desborde; botones visibles de al menos 44 px; foco, escritura y reordenamiento del desempate con teclado; texto largo; corte de red y recuperación. El desempate pendiente se simuló solo en la respuesta del navegador, sin alterar la base. [Resultados reproducibles](t06-qa-navegador.json), [portal móvil](t06-portal-publico-390.png), [ajustes móviles](t06-organizador-ajustes-390.png), [desempate móvil](t06-organizador-desempate-390.png) y [vista de equipo](t06-disciplina-movil.png).

La [resolución PDF sintética](t06-resolucion-ejemplo.pdf) se renderizó e inspeccionó en A4: indica expresamente cuando una decisión está revocada, conserva los términos originales como historial y omite datos civiles. Se probó además el máximo de nombres/motivos con revocación: **dos páginas** sin texto cortado, ambas renderizadas e inspeccionadas. [Render de la resolución](t06-resolucion-render.png). La aceptación en teléfonos físicos y con usuarios reales sigue pendiente hasta poder ejecutarse; Chrome no sustituye esa prueba.

Las propuestas disciplinarias se actualizan mediante la acción visible del organizador «Actualizar propuestas desde actas oficiales». Los expedientes conservan el aviso de origen rectificado hasta esa reconstrucción; no se revoca una decisión automáticamente. El avance de ganadores/clasificados en el cuadro continúa en T04.
