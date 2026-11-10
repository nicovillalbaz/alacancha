# Copa Caacupé — etapas privadas y diseño de flyers (10/11/2026)

## Qué se implementó

- Fixture privado: subpestañas Grupos, Cuartos, Cuadrangular y Tabla general sobre la matriz de 35 cruces por posiciones. La tabla general muestra los diez puestos sin rango ni puntos hasta tener actas oficiales. Fechas, Jornadas y Sorteo siguen separados. Las subpestañas horizontales centran el botón tocado.
- Flyer contextual: al abrir la acción de una fecha, partido o estadística se encola directamente el archivo con los ajustes del torneo. La vista muestra el archivo listo y su descarga; el editor general continúa disponible para comunicados y tareas manuales. El archivo no se publica automáticamente.
- Configuración por torneo: plantilla, colores, tamaño, formato y tres logos (copa, organizador, federación). Emblema del torneo y logo de la organización funcionan como valores iniciales; el tercer logo se carga explícitamente. El servidor valida MIME/firma/2 MB, ámbito de organización y permiso de organizador; cambios de configuración se versionan y auditan. Los nuevos flyers incluyen los tres logos en su snapshot y la carga de recursos. La plantilla v2 usa cancha sutil, franjas diagonales, paleta configurable y tipografía deportiva con alternativas locales.
- Copa local: FPFS.pdf se renderizó y verificó visualmente; su PNG quedó cargado como logo de federación del flyer. Se guardó verde oscuro `#073B2C`, dorado `#E9BC3D` y formato vertical PNG. Los otros dos logos se resuelven desde el emblema de la Copa y la organización FCFS ya cargados.

## Datos, permisos y pruebas

La migración `044_tournament_flyer_settings.sql` agrega ajustes privados con claves foráneas de la misma organización. Respaldo cifrado previo: `.local/backups/torneos-1794313165487-dfb1ac86.backup`. La migración es aditiva y no borra registros; no se ensayó la restauración de ese respaldo particular.

La integración comprobó lectura permitida y denegada entre organizaciones, escritura denegada al administrador de equipo, versión obsoleta, carga de los tres logos, lectura de archivos y colores en SVG. **87/87 pruebas**, tipos y build correctos. En Chrome local, cuatro subpestañas y configuración a 320/390 px no desbordaron; los tres logos aparecieron. Una jornada sintética publicada generó un archivo nuevo con un solo toque y llegó a estado listo con descarga. Las capturas temporales están en `.local/qa-flyers/` y no se versionan.

## Límite deportivo

La Copa Caacupé continúa privada y sin equipos asignados a A1–B5, actas, partidos oficiales ni estadísticas. El portal público no puede mostrar todavía sus grupos, cuartos, cuadrangular ni tabla general reales. Falta completar el motor de interseriales, clasificación, cuartos y cuadrangular y validar los desempates de esta edición. Las pruebas físicas y la aceptación estética del propietario quedan pendientes.
