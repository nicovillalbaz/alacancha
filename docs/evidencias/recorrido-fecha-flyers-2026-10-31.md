# Recorrido de Fecha, partido y flyers — 31/10/2026

## Incremento local

- **Datos:** migración aditiva `036_match_roster_without_lineup.sql`. El acta conserva la lista congelada de jugadores cuando no hay planilla aprobada. Respaldo cifrado previo `.local/backups/torneos-1793447814263-a59fa178.backup`; ensayo aislado de restauración correcto: 62 tablas y 578 archivos, filas y huellas iguales. Solo datos sintéticos en las muestras.
- **API:** creación manual de partidos dentro de una Fecha, programación con conflictos y revisiones auditadas; inicio de acta sin exigir planilla aprobada; estadísticas derivadas del acta oficial con equipos de fixture manual o generado. Flyer de Fecha con escudos de ambos equipos y sello «Generado por NAVZ»; fuentes específicas para previa, resultado, clasificación, goleadores, valla y cuadro publicable.
- **UI:** Fixture muestra Fechas con `Editar` y `Flyer`. Una Fecha se abre en Partidos; cada partido abre la carga directa y ofrece su flyer. Estadísticas tiene un botón `Flyer` junto a cada apartado con datos publicables. El generador recibe esa fuente exacta, sin pedir elegir contenido. Listas compactas con separadores.
- **Permisos y errores:** cada operación privada exige ámbito de organización en el servidor; prueba de creación manual permitida y denegada entre organizaciones. Se conservan errores de cruce fuera de categoría, conflicto de agenda, fuente no publicada y fuente sin datos.
- **Datos de prueba:** `npm run demo:journeys` crea de forma idempotente una liga con resultados oficiales, una copa por grupos y una de eliminación, además de la copa local anterior por iniciar. Son torneos ficticios de la base local exclusiva del proyecto.

## Comprobación

- `npm run typecheck`: correcto.
- `npm test`: **81/81** correctas, incluidos acceso cruzado, Fecha manual, estadísticas antes del primer resultado y escudos/sello de flyer.
- `npm run build`: correcto.
- Navegador local móvil de 390 px: recorrido Fixture → Fecha → Partidos → partido; carga directa de evento y enlace al flyer del partido; Clasificación de grupos desde 0 PJ; liga terminada con Clasificación, Goleadores y Valla y botones de flyer; previa de Goleadores sin selector de fuente.

## Pendiente de aceptación

La revisión física en teléfonos, teclado virtual, red inestable, texto largo y los otros anchos de la guía visual sigue pendiente de ejecución. El selector de Cuadro final se activa cuando exista una llave generada y publicable.
