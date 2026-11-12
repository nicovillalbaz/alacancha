# T09 — rutas y navegación cotidiana

El inventario anterior contaba 163 rutas porque solo reconocía rutas literales. Omitía las rutas construidas con bases y plantillas, incluidas Pagos, Disciplina, árbitros y tres pares de altas/archivos. El auditor ahora recorre todos los archivos TypeScript de la API, resuelve esas rutas y falla si aparece una que no puede clasificar. Cuenta **189 rutas**: 27 públicas o por token y 162 con control de acceso. Esta clasificación es una ayuda para revisar; no sustituye la comprobación del permiso efectivo.

Las pruebas de solicitudes anónimas y entre organizaciones usan ahora ese inventario completo y comprueban que cada ruta figura en Fastify. Se mantienen los casos de acceso permitido y denegado por recurso. El servidor registra fallos inesperados con ID de solicitud, método, patrón de ruta y tipo de error, sin cuerpo, token ni datos personales.

En la navegación pública, cada carga queda asociada a la ruta que la inició. Si se cambia de organización o torneo antes de que termine una consulta, se descarta su respuesta y sus avisos de resultados/sorteo. Lo mismo ocurre al abrir rápidamente fichas distintas de equipos o partidos. No se alteran datos, permisos ni estados de publicación.

Verificación local: `npm run audit:routes` (189, cero sin clasificar), `npm run typecheck`, `npm run build`, `npm test` (99/99) y `git diff --check`. Las pruebas de interfaz en teléfonos reales y con red móvil siguen pendientes; la auditoría estática y las pruebas de API no demuestran ausencia total de fallos.
