# T09 — incidentes y recuperación (borrador local)

**Estado:** probado solo con datos sintéticos en este equipo. Antes del piloto hay que definir responsable, frecuencia, destino externo, custodia de clave, retención, umbrales y contactos. No ejecutar acciones sobre datos reales con este borrador sin ensayo en staging.

## Comprobación local

`npm run ops:check` lee la base propia y devuelve JSON sin datos personales. Código de salida 0: sin alertas; 2: requiere atención. Comprueba flyers en cola >10 minutos, flyers fallidos, difusión de fixture pendiente >10 minutos, respaldo local >24 horas y espacio de media <2 GiB. No está programado ni envía alertas; una ejecución manual satisfactoria no demuestra monitoreo continuo ni respaldo externo. `/ready` comprueba conexión a PostgreSQL, `/health` solo proceso API.

## Captura sin red o sesión revocada

1. En el teléfono, verificar el contador de eventos pendientes locales. No enviar ni aprobar acta con pendientes.
2. Recuperar red e ingresar con **la misma cuenta capturista**. Abrir el mismo partido y sincronizar. La identidad de cada evento permite reintentar sin duplicarlo.
3. Si el servidor deniega acceso, conservar el dispositivo y los datos locales; el organizador revisa asignación y estado de la cuenta. No prestar otra cuenta para sincronizar eventos ajenos.
4. Comparar el diario del partido y el marcador derivado con la planilla física. Toda corrección se registra con motivo, sin eliminar el evento original.

## Worker o publicación retrasada

1. Ejecutar `npm run ops:check`; anotar hora, cola y alcance. Revisar estado del worker y errores de flyer sin publicar material fallido.
2. Restablecer el proceso local del worker. Los trabajos en `queued` pueden volver a procesarse; no cambiar manualmente estado de actas ni publicaciones.
3. Confirmar que el flyer generado conserva su huella y que el portal expone solo la versión vigente autorizada. Si el archivo falta, mantenerlo fuera del portal y regenerar desde fuente oficial.

## Respaldo/restauración

1. Identificar el último archivo cifrado verificado, su ubicación fuera del servidor y la clave custodiada por responsable distinto del servidor. Registrar instante del último respaldo para medir RPO.
2. Preparar entorno aislado con PostgreSQL y media propios. No restaurar encima de una base existente. Antes de migrar, guardar respaldo y comprobar que se puede abrir.
3. Configurar `BACKUP_FILE` y `BACKUP_KEY`; ejecutar `npm run restore:check` contra la instancia de prueba aislada. El script crea una base `torneos_restore_*` y compara las huellas de tablas y archivos. La restauración de un archivo externo aún no se ensayó en T09.
4. Verificar API privada/pública, permisos entre dos organizaciones, actas oficiales, tablas derivadas, documentos privados y flyers autorizados. Comparar primer evento perdido y tiempo hasta servicio recuperado para RPO/RTO reales.
5. Registrar evidencia, responsable y decisión de reabrir o mantener el sistema fuera de servicio. Nunca borrar el original ni aplicar una migración destructiva como atajo.

## Exposición de datos o acceso cruzado

1. Suspender publicación o acceso afectados desde el control administrativo, preservando auditoría y evidencia. No compartir C.I., fecha de nacimiento, documentos, tokens ni datos de menores en reportes.
2. Reproducir con datos sintéticos y dos organizaciones; identificar recurso, rol, ruta, alcance y primera/última exposición. Revisar sesiones activas y revocarlas si corresponde.
3. Corregir, probar permitido/denegado y revisar portal, flyers, cachés y copias. La evaluación de obligaciones legales y comunicación corresponde a responsables locales antes del piloto.
