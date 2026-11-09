# T03 — cierre técnico local y pendientes de aceptación

**Fecha:** 28/10/2026. **Ámbito:** aplicación principal Vue/Fastify/PostgreSQL nativo, datos sintéticos, sin Docker. Esta acta describe código local; no es aceptación física ni aprobación del propietario.

## Incrementos y trazabilidad

| Ticket | Datos y migración | API y permisos | UI, errores y vacío | Prueba / evidencia |
|---|---|---|---|---|
| T03-01 Identidad | 007: `players` y `player_registrations`; 013: revisión cifrada e historial de identidad | Alta, búsqueda enmascarada, reutilización y corrección; ámbito de organización y equipo en servidor | Alta móvil en dos pasos, guardar y agregar otro, búsqueda y ficha privada; cupo, duplicado, versión obsoleta y sin jugadores | Integración T03 de alta, identidad compartida y cruce entre organizaciones; [captura de detalle a 390 px](t03-jugador-390.png) y [320 px](t03-jugador-320.png) |
| T03-02 Buena fe | 008: versiones y snapshot; 012: lotes CSV reversibles | Presentar/revisar con motivo, cupos y edad de corte, vista previa firmada y confirmación atómica, reversión lógica | Búsqueda, cupo, estado de revisión, CSV con vista previa y confirmación, lotes; PDF privado de versión aprobada | Integración de versiones, CSV, reversión y acceso cruzado; [buena fe a 320 px](t03-buena-fe-320.png) |
| T03-03 Procedencia | 007/010: origen interno o externo y movimientos con fechas | Declaración y decisión de transferencia/préstamo; equipo externo queda solo declarado, revisión por organizador | Origen por botones, movimiento y vigencia en ficha; vacío y motivo de revisión | Integración de origen externo e interno, préstamo vencido y revisión |
| T03-04 Elegibilidad | 010: documentos privados y restricciones manuales | Evaluación por fecha con permitido/advertencia/bloqueo, documentos exigidos, edad, movimiento y restricción; acceso al archivo solo en ámbito propio | Ficha privada con resultado y causas, carga/revisión de archivo, levantamiento con motivo | Integración de documento aprobado, edad, restricción, levantamiento, reversión de inscripción y denegación cruzada |
| T03-05 Planilla | 011: partido privado en borrador, versiones y excepciones; roles requeridos en JSON de reglamento versionado | Límites N/B/R y staff, buena fe aprobada, elegibilidad, arquero/capitán si el reglamento los exige, versión optimista, revisión y excepción auditada; dorsal de planilla opcional sin sustituir ficha ni identidad | Un toque titular/banco/no convocado, arquero/capitán, staff, copia previa con nueva validación; búsqueda por apellido, ficha o dorsal, estado de guardado y bloqueo en contexto | Integración F7 con 30 jugadores, 7+8, exceso de cupos, dorsales duplicados, roles exigidos, copia, excepción, snapshot y cruce entre organizaciones |
| T03-06 QA | Migraciones 010–013 aditivas; respaldos previos | Respaldo/restauración, compilación y suite integral | Cuatro anchos de buena fe; alta y ficha en 320/390 px | Ver resultados y límites abajo |

La planilla de T03 usa **partidos privados en borrador**. T04 programará y publicará fixture y jornadas; el borrador no produce acta ni estadísticas oficiales. Las restricciones manuales de T03 ensayan el bloqueo; expedientes y cálculo automático corresponden a T06.

## Comprobaciones ejecutadas

- `npm run build`: aprobado.
- `npm test`: 46 pruebas integrales aprobadas al iniciar T04, incluidas las pruebas T03 permitidas y denegadas entre organizaciones y el nuevo caso de dorsal duplicado. La suite comprueba CSRF, cuotas, versiones concurrentes, documento privado y snapshot histórico.
- `npm run restore:check`: restauración final en base nueva (`torneos_restore_20261028_49fda230`), 64 archivos, filas y huellas coincidentes. Migraciones 010–013 se aplicaron luego de respaldos cifrados separados en `.local/backups/`; también se ensayó restauración antes de 012.
- Navegador de desarrollo a 320, 390, 768 y 1280 px: buena fe y planilla con un `h1`, sin scroll horizontal y sin controles visibles menores de 44 px. Ficha privada revisada a 320/390 px con las mismas condiciones. [Buena fe a 390 px](t03-buena-fe-390.png), [buena fe a 1280 px](t03-buena-fe-1280.png) y [planilla a 320 px tras tocar Titular](t03-planilla-seleccion-320.png). Ese toque conserva la vista, muestra elegibilidad y actualiza el cupo. Después de presentar la lista ya no aparece el mensaje de estado vacío. El encuentro de esta revisión es sintético y privado.
- Exportación PDF sintética de 30 jugadores en dos páginas A4; nombres y fichas largas se envuelven sin cortar el dato. [PDF de muestra](t03-pdf-muestra.pdf) y [render de primera página](t03-pdf-render-1.png). No contiene números de identidad.

## Límites pendientes

- Falta la prueba en teléfonos físicos con teclado virtual, red inestable, zoom y lector de pantalla; la matriz visual de navegador no sustituye esa aceptación.
- La configuración por torneo de campos adicionales, ventana de inscripción y política obligatoria de comprobante de pase todavía no existe. El reglamento sí permite exigir arquero y capitán al presentar la planilla. No se inventó una regla federativa universal. El organizador puede declarar movimientos, revisar documentos y autorizar excepciones con motivo; estas opciones no equivalen a una política de torneo completa.
- El PDF es una exportación privada de consulta. No hay firma, sello, constancia legal ni publicación pública.
- La demostración presencial completa con 30 jugadores en un teléfono, incluidas cargas con red intermitente y doble administrador humano, sigue pendiente aunque el escenario de servidor esté cubierto por integración.

**Decisión de avance:** cerrar el núcleo técnico local de T03 y comenzar T04 por instrucción posterior del propietario. T03 sigue abierta para las políticas configurables indicadas y la aceptación física/humana; esas partes no se marcan como hechas. [Primer incremento T04](t04-cruces-liga.md).
