# Incorporación por acta y detalle público — 18/11/2026

## Cambio

- **Dato:** sin migración de esquema. El acta aprobada actualiza a `approved` únicamente inscripciones creadas en ese partido y presentes en eventos vigentes, con auditoría por jugador. No cambia inscripciones rechazadas u observadas. Si el equipo no tiene buena fe aprobada, crea una primera versión aprobada solo con inscripciones ya aprobadas. Versiones existentes permanecen intactas; las nuevas altas por acta se admiten como suplemento auditable al preparar otra planilla.
- **API/permisos:** conserva el control de aprobación del acta y el ámbito de organización/partido. La transacción revierte nombres, estado y lista si falla. La visibilidad manual `false` del nombre prevalece. Edad, documentos, restricciones y sanciones conservan sus verificaciones.
- **UI:** la lista privada muestra «Aprobado» después del acta oficial. El detalle público de partidos muestra escudos, marcador y filtros Completo, Goles y Tarjetas; las filas siguen PT/ST y lado de cada equipo sin repetir su nombre bajo cada período. Un filtro vacío informa que no hay eventos de ese tipo.
- **Producción anterior:** `scripts/backfill-quick-player-approvals.sql` limita la regularización a Caacupé y a altas auditadas con eventos vigentes en actas oficiales, tras respaldo y restauración de ensayo. No altera decisiones de nombre.

## Verificación

La prueba sintética cubre permiso denegado entre organizaciones, idempotencia de alta, aprobación de dos jugadores (uno con nombre público oculto), creación de primera lista aprobada, una rectificación con nuevo jugador sin cambiar la versión de esa lista y su selección en una planilla posterior. La clasificación y los goleadores se comprueban desde el portal público. El diseño se compila con Vue; revisión física a 320/390 px, teclado, texto largo y red inestable pendiente.

## Producción y revisión visual

- Commit `b273753` compilado en el VPS. Respaldo `initial-20261118T112435Z.dump` restaurado con 71 tablas. En la copia descartable la regularización aprobó 4 fichas y creó 2 primeras listas; una segunda ejecución hizo 0 cambios. Producción dio los mismos 4/2. Las 9 altas rápidas de Caacupé figuran aprobadas.
- API y web responden; dos partidos oficiales conservan 16 eventos con nombre, 10 goles atribuidos, cuatro participaciones en clasificación y 10 goles en goleadores. No se observaron errores en el journal de API en los diez minutos de la verificación.
- Capturas del detalle público: [390 px](t05-match-mobile-20261118.png) y [320 px](t05-match-320-20261118.png). Un navegador sin sesión en el VPS cargó el partido; ancho de documento igual al viewport en ambos tamaños, dos escudos visibles. A 320 px los filtros dieron 9 eventos completos, 5 goles y 4 tarjetas. Los nombres largos se recortan, conservando el dato completo en la respuesta pública. La aceptación en teléfono físico, con teclado y red inestable sigue pendiente.
