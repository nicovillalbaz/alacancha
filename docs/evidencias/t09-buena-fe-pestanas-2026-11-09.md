# Buena fe: jugadores y publicación · 09/11/2026

## Cambio

- La pantalla de buena fe muestra solo dos subpestañas: Jugadores y Publicación. La acción de agregar jugador, el buscador y la vinculación opcional están en Jugadores. Estado, aprobación, exportación e historial de la lista están en Publicación.
- Se quitaron de esta vista los partidos citados y el formulario para crear un partido borrador. Se quitó el contador suelto y el encabezado repetido.
- Equipo incorpora la subpestaña Partidos con accesos a Planilla y Acta. Cuando el equipo participa en una sola categoría, la pantalla evita repetirla sobre el contenido.
- Al entrar en otra participación se abre Jugadores. Las rutas de planilla y acta conservan su carga de partidos correspondiente.

## Capas y comprobación

- Datos/migración: ninguna. API/permisos: sin cambios; se dejó de consultar partidos borrador en buena fe, ficha y alta de jugador. Equipo los consulta para su subpestaña Partidos y la planilla sigue consultándolos.
- Vacío/error: Jugadores muestra «Sin jugadores» y permite agregar; Publicación conserva el botón deshabilitado hasta tener jugadores. Errores de carga y permisos usan el manejo existente.
- `npm run typecheck`, `npm run build`, `npm test`: correctos, 83 pruebas. La suite existente cubre acceso permitido y denegado entre organizaciones.
- Navegador local: Jugadores y Publicación verificados a 390 px; a 320 px no hay desborde y la flecha derecha del teclado selecciona Publicación. No aparece Partidos en buena fe. Equipo → Partidos muestra planillas y actas a 390 px sin desborde. La portada pública `/` se abrió sin pasar por el ingreso. Prueba física y red inestable pendientes.
