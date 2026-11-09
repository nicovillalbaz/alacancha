# T02-03 — Cupos de reglamento · 28/10/2026

**Estado:** incremento local verificado; T02 sigue en desarrollo. Sin Docker ni despliegue.

**Actualización posterior:** los [cambios y el reingreso](t02-cambios-reingreso.md) ya se configuran por categoría; su aplicación durante partidos permanece pendiente de T05.

## Cambio observable

- Cada categoría conserva su reglamento versionado. El organizador configura jugadores en cancha, jugadores en banca y cupo de cuerpo técnico en planilla. La interfaz calcula el total de jugadores como cancha + banca; no pide ingresar una tercera cifra susceptible de contradecirlas. El cuerpo técnico no consume cupos de jugadores.
- Avisos en la misma pantalla explican mínimos incompatibles, una planilla superior a 100 y una nómina general menor que la planilla. El servidor rechaza un total de acta diferente de la suma y valida el borrador antes de publicarlo.
- El cupo técnico no limita las propuestas de personas en la ficha de equipo: se aplicará a la selección para un partido cuando exista la planilla de T03. Las versiones ya publicadas conservan su JSON. Una versión anterior sin cupo técnico se lee con valor conservador `0`; para cambiarlo se crea otra versión.

## Datos, API y permisos

No hubo migración: `rules` ya es JSONB versionado. El contrato compartido añade `maxBenchStaff` (0–50) y exige `maxMatchRoster = playersOnField + maxBenchPlayers` en cada escritura. La lectura compatibiliza versiones antiguas sin modificar la fila. Solo el administrador de torneo activo de la organización puede crear, editar o publicar; siguen vigentes las pruebas de permiso permitido y denegado entre organizaciones. La publicación exige motivo y revisión vigente.

## Comprobación

- `npm test`: **28/28**. Casos nuevos: suma incorrecta, cupo técnico fuera de rango, cambio de cupo en v2 mientras el portal mantiene v1, y lectura de regla histórica sin reescribir su snapshot. Incluye permisos entre organizaciones de T02.
- `npm run build`: servidor, tipos Vue y Vite correctos.
- `npm run restore:check`: destino nuevo `torneos_restore_20261028_e789c9e6`, **16 archivos** y filas/huellas/bytes iguales a la fuente sintética, 3.429 ms. No se sobrescribió la base de prueba.
- Navegador local a 390 px: banca de 7 a 9 actualizó el total de 18 a 20; cuerpo técnico de 0 a 4 no alteró ese total; nómina de 19 mostró el aviso y volvió a estado válido al restaurar 31. Cuatro anchos 320/390/768/1280 px sin desplazamiento horizontal, desplegables ni controles visibles bajo 44 px. [Cupos](t02-reglas-cupos-movil.jpg) · [Error](t02-reglas-error-movil.jpg).

## Pendiente

Completar cambios/reingreso, disciplina, edad/documentos, walkover, desempates y fase inicial en T02. La selección efectiva de jugadores y cuerpo técnico pertenece a T03. Pruebas físicas, zoom/texto al 200 %, teclado virtual y red inestable continúan pendientes.
