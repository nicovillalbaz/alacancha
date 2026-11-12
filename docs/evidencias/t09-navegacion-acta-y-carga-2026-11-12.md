# T09 — Navegación a partidos y carga de Estadísticas (12/11/2026)

## Incidente observado

En producción, un enlace de Fixture o Estadísticas construía `#/partido/<id de partido>` sin el ID de categoría. La ruta privada espera `#/partido/<id de categoría>/<id de partido>`, y la combinación podía enviar `partidos` como UUID al endpoint del acta. El partido reportado `90759edf-5aba-4045-86d3-aa657b95ba46` existe, tiene fecha prevista y equipos asignados, pero su jornada 1 seguía en `draft` y no existía acta. El sorteo, el torneo, la edición y la categoría estaban publicados; las nueve jornadas oficiales seguían en borrador y sus 25 partidos no tenían hora ni sede. Esta consulta fue de solo lectura. No se alteraron las asignaciones ni los datos de producción.

## Corrección

- Fixture y Estadísticas forman ahora la ruta con categoría y partido. La pantalla rechaza un ID inválido antes de llamar a la API.
- Al abrir un partido sin acta se muestran los equipos, escudos, fecha y estado de la jornada. El organizador puede volver a la edición del partido. Si la jornada está en borrador, una acción explícita publica esa jornada y abre la carga; no se inicia un acta automáticamente al visitarla.
- Una jornada de la Copa basada en el plan por posiciones admite publicación con la fecha prevista, aunque aún no tenga hora o sede. Los demás formatos conservan su validación previa. El inicio del acta en servidor sigue exigiendo jornada y reglamento publicados.
- El planillero asignado a una jornada aún no publicada recibe un estado claro, sin llamadas fallidas a `record` y `record/start`.
- Cambiar de partido vacía los eventos locales y el historial visibles del partido anterior antes de cargar los del actual; al iniciar una nueva acta se actualizan las asignaciones disponibles.
- Estadísticas de esta Copa consulta plan, competencia y equipos, omitiendo la carga de todas las jornadas, cuadros y estadísticas privadas que esa vista no usa. El indicador general «Cargando…» se oculta cuando el plan de la categoría ya está representado.

## Permisos, estados y verificación

La API consulta por organización y recurso. La prueba integrada cubre jornada de Copa con fecha sin hora/sede, rechazo de `record/start` antes de publicar, publicación permitida al organizador, lectura pública del partido sin resultado, apertura de acta y rechazo de publicación, apertura y lectura entre organizaciones. La prueba de fixture manual conserva la exigencia de día, hora y sede. La lista de jornadas incluye el estado del acta y los escudos para la vista previa.

`npm run typecheck` y `npm run build` terminaron correctamente. `npm run audit:routes` clasificó las 163 rutas, sin pendientes; `npm test` pasó 99/99. `npm run perf:check` sobre la base sintética registró p95 de 72 ms para estadísticas públicas de varias categorías con cuatro solicitudes concurrentes. No representa una red móvil ni mide la pantalla privada completa. La prueba física en Android/iOS sigue pendiente. La reducción de consultas de Estadísticas es estructural; falta medir latencia real con varios usuarios concurrentes.
