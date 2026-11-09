# T02 — Torneos, categorías y equipos · corte 28/10/2026

**Estado:** incremento funcional local en desarrollo. T01 conserva pendiente la aceptación visual y física del propietario; T02 se inició por su indicación expresa de continuar al terminar la base técnica. No hay despliegue ni avance a T03. Sin Docker.

**Actualización posterior del mismo día:** el [incremento T02-03 de cupos](t02-cupos-reglamento.md) sustituyó el máximo de planilla editable por la suma cancha + banca y añadió el límite independiente de cuerpo técnico. Los resultados de 27 pruebas y 24 combinaciones de esta acta corresponden al corte inicial; la evidencia posterior registra 28 pruebas y su revisión visual.

## Funciona en la web local

- Organizador activo crea torneo, edición y primera categoría en dos pasos. F5/F6/F7/F8/F9/F11/futsal/personalizado cargan **valores sugeridos editables**, sin fijar reglas universales. Zona horaria y límite de equipos son configurables. También puede agregar otra categoría en la misma edición o crear otra edición.
- Reglamento en borrador con jugadores en cancha, mínimos para iniciar/continuar, acta, banco, inscriptos, períodos/duraciones y puntos. El servidor valida relaciones; publicar registra motivo, fecha y versión. Una edición posterior crea v2 y deja v1 inmutable, incluso en PostgreSQL. El portal sigue mostrando v1 hasta publicar v2.
- Equipo con nombre, color y escudo privado. Una identidad de equipo puede tener participaciones separadas en varias categorías/ediciones. El límite de equipos se valida bajo bloqueo transaccional.
- Organizador asigna administradores a una participación. La cuenta nueva o pendiente recibe enlace de un uso; al aceptarlo se habilita solo el rol de equipo, mientras el administrador de torneo sigue sujeto al control manual del superadmin. Una cuenta de equipo activa ya existente puede recibir otra participación. Comisión y cuerpo técnico proponen integrantes; solo el organizador los confirma con motivo. El cargo de comisión por sí solo no da acceso.
- El organizador decide por participación si el equipo aparece en el portal; el escudo público solo se sirve si esa participación y su categoría están publicadas. El portal anónimo muestra nombre, categoría, reglas y equipos aprobados; no devuelve administradores, comisión ni otros datos privados.
- Formularios de pantalla completa móvil, categorías y modalidades como botones visibles, elección automática cuando hay una sola categoría, borradores conservados, acceso directo a tareas en la ficha de equipo y reintentos de creación sin duplicar torneo/categoría/equipo.

## Datos y permisos

Migraciones aditivas `003`–`006`: torneo, edición, categoría, versiones de reglamento, equipo, participación, asignación, comisión, cuerpo técnico, sedes y patrocinadores básicos, publicación explícita y escudo. Referencias compuestas impiden combinar organización A con recursos B. Las sedes/patrocinadores tienen tabla, pero todavía no flujo de administración. Las reglas publicadas no se actualizan ni eliminan. No se borra información deportiva existente.

Todas las rutas privadas comprueban sesión, organización activa y rol en servidor. Un administrador de equipo ve solo participaciones asignadas y no puede crear torneo/equipo, confirmar comisión ni publicar. El API no usa `organization_id` del cuerpo como autorización. El portal aplica filtros de publicación en la consulta y no acepta rutas privadas ajenas.

## Verificación ejecutada

- `npm test`: **27/27**. Incluye F5/F11, reglas inválidas, zona horaria, reintentos, versiones publicadas, lectura y escritura permitida/denegada entre organizaciones, equipo en dos categorías/ediciones, límite de equipos, invitación de administrador de equipo, comisión sin autoconfirmación y portal oculto/visible con escudo.
- `npm run build`: TypeScript del servidor y Vue, más build de Vite, correctos.
- `npm run restore:check`: destino nuevo `torneos_restore_20261028_564f53ce`, **12 archivos**, filas/huellas/bytes iguales a la fuente sintética, 2.624 ms. [Resumen sin secretos](t02-restauracion-resumen.json). No se sobrescribió la base de prueba.
- Navegador: creación sintética F11, publicación v1, segunda categoría F5, equipo en ambas, propuesta de comisión y autorización pública. El portal mostró únicamente la categoría y el equipo publicados. Se corrigió un campo interno enviado por error al proponer comisión y se volvió a probar la operación.
- [Matriz móvil/escritorio](t02-layout.json): 24 combinaciones de seis pantallas × 320/390/768/1280 px; un H1 por pantalla, sin desbordamiento horizontal, sin `select` y sin controles visibles medidos bajo 44 px. Se inspeccionaron [categorías](t02-categorias-movil.jpg), [ficha de equipo](t02-equipo-movil.jpg), [reglamento](t02-reglamento-movil.jpg) y [portal](t02-portal-publico-movil.jpg) a 390 px.

## Pendiente para cerrar T02

- Completar el editor versionado: cambios/reingreso, tarjetas, edad, documentos, walkover, desempates y fase inicial. El cupo de cuerpo técnico ya se configura, pero su aplicación a una planilla de partido pertenece a T03. Definir validaciones y controles móviles con los reglamentos de cada torneo, sin asumir reglas universales.
- Administración útil de sedes y patrocinadores, y decisiones sobre club agrupador opcional. Revisar si hace falta editar/revocar asignaciones de administradores de equipo conservando historial.
- Revisar con usuarios reales los recorridos F5/F11, lector de pantalla, zoom/texto al 200 %, teclado virtual, red inestable y teléfonos físicos. La aceptación estética del propietario y la prueba física no se sustituyen con esta matriz.
- Antes de operación real: endurecimiento de imágenes, custodia/backup externo y HTTPS; el alcance probado es local con datos sintéticos.
