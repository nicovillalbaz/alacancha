# Flyer por grupo y cuadro del organizador — 06/11/2026

- **Datos y migración:** sin cambios de esquema. La fuente de Clasificación usa las tablas oficiales existentes; cada página contiene filas de un único grupo y conserva los escudos.
- **API:** la vista previa entrega cantidad y nombres de páginas. La generación ya recibía el número de página seleccionado. La consulta y la generación mantienen el permiso de organizador y el ámbito de organización del servidor.
- **UI:** botones de grupo en el generador, Fechas/Cuadro dentro de Partidos, llave oficial hacia su acta y llave futura hacia la edición de equipos. La pestaña activa se desplaza sin barra horizontal visible. Un cruce aún sin partido muestra participantes pendientes sin enlace de edición.
- **Vacío y error:** el cuadro sin cruces indica que todavía no hay llaves; la vista previa conserva su mensaje de red y el editor conserva los errores de API. Una página inexistente recibe 404.
- **Pruebas:** `npm run demo:verify` comprobó que la copa de grupos produce Grupo 1 y Grupo 2 con cuatro equipos distintos cada uno. `npm run typecheck`, `npm run build` y `npm test` completaron; 83 pruebas pasan, incluidas lectura propia y denegación entre organizaciones. En el navegador local móvil se vieron el selector de grupos, el Cuadro en Partidos, la lista de Fechas y la ausencia de barra horizontal en Estadísticas.
- **Pendiente:** validación física con dispositivo real y revisión estética del propietario.
