# Sanber: calendario anunciado en la vista de organizador

**Problema.** El público veía la publicación sin fechas de nueve jornadas y 45 cruces. La vista de organizador solo consultaba `matchdays` y fases oficiales; como aún no hay fechas programadas, Fixture quedaba en blanco y Partidos indicaba que no había encuentros. El botón «Sortear» podía generar un segundo calendario ajeno al anunciado.

**Datos y migración.** Ninguna. La publicación vigente sigue siendo la revisión 2, con diez equipos y 45 parejas. No se crearon fechas, partidos oficiales, actas ni resultados.

**API y permisos.** El panel lee el mismo endpoint público de la publicación que usa la vista del aficionado, bajo la organización y categoría seleccionadas. No se añade una ruta ni un permiso de escritura. La suite de acceso comprueba lectura permitida y rechazo entre organizaciones para las rutas privadas existentes.

**UI.** Fixture muestra el calendario anunciado por jornada, marcado como publicado y pendiente de fecha. Partidos muestra las parejas anunciadas que aún no tienen un partido programado; los cruces sin acta son de solo lectura. Si existen fechas oficiales, aparecen aparte. «Sortear» se oculta para una categoría con calendario anunciado para evitar un sorteo paralelo.

**Estados.** Se distingue carga, error de red y ausencia real de calendario. Un error de consulta no se presenta como pantalla vacía. Las publicaciones de otras organizaciones o categorías no se mezclan.

**Verificación.** El endpoint público de producción devolvió revisión 2, nueve jornadas, 45 cruces y diez equipos. `vue-tsc` y build web terminaron correctamente; `npm test` pasó 101/101. Pendiente: aceptación visual y funcional en la cuenta del organizador y en teléfono real; la programación de fechas oficiales a partir del calendario anunciado sigue siendo manual.
