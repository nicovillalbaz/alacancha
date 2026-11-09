# Recorrido móvil por torneo — 30/10/2026

## Entrega local

- Selector superior para elegir, crear y configurar el torneo. El organizador conserva el último torneo durante la sesión.
- Cinco destinos dentro del torneo: Equipos, Multas, Fixture, Partidos y Estadísticas. Equipos y partidos se recorren en filas con acciones contextuales. Se retiraron la barra inferior del organizador, títulos duplicados, subtítulos repetitivos y paneles de desarrollo visibles en el uso diario.
- Flyers desde Fecha, resultado oficial, clasificación, goleadores y valla menos vencida. Los dos últimos tipos conservan snapshot y versiones en la tabla de flyers; migración aditiva 034. El botón de resultado aparece solo si el acta está oficial en el portal.

| Capa | Comprobación |
|---|---|
| Datos | Migración 034 amplía el `CHECK` de `flyer_exports.kind`; no modifica filas existentes. |
| API | La previa, creación y descarga de `defense` usan el flujo versionado existente; `scorers` usa la misma fuente pública. |
| UI | Selector de torneo, cinco áreas, fuentes contextuales de flyer y retorno al área de origen. |
| Permisos | Organizador autorizado puede exportar; otra organización recibe 403. Los nombres de goleadores siguen la autorización pública. |
| Vacío/error | Sin fixture o resultados se muestra un estado breve; el flyer de resultado requiere acta oficial y el de estadísticas una fuente publicable. La API conserva sus errores 403/409. |

## Verificación

- `npm run typecheck`, `npm run build` y `npm test`: 78/78 pruebas. La prueba nueva crea, procesa y descarga un flyer estadístico; comprueba denegación entre organizaciones y ausencia de documentos privados en la vista previa.
- Respaldo cifrado previo a la migración y restauración aislada: 60 tablas, 512 archivos, filas y huellas iguales. Respaldo posterior: 60 tablas, 534 archivos, filas y huellas iguales.
- Navegador local a 320, 390, 768 y 1280 px sin desplazamiento horizontal. A 390 px se recorrieron Equipos, Partidos, Estadísticas y el selector; la pestaña de partidos muestra vacío breve si no hay fixture. La pestaña de estadísticas no ofrece flyer cuando no hay resultados oficiales.

## Pendiente de aceptación

Prueba física con usuarios, teclado virtual, red inestable, zoom de texto y aprobación visual del propietario. La muestra local no acredita esas condiciones.
