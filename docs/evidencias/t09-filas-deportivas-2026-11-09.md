# Filas deportivas y acceso a la ficha · 09/11/2026

## Alcance

- En el panel del torneo, Fixture muestra escudo o iniciales de cada equipo, hora y marcador oficial si existe. Cada encuentro mantiene el acceso a su Fecha; Flyer y Editar permanecen en el encabezado de esa Fecha.
- Clasificación, Goleadores y Valla muestran el escudo o el color de referencia sin crear secciones ni tarjetas nuevas.
- En Equipo → Jugadores, cada fila abre la ficha. Al volver desde ese recorrido se regresa al equipo; las fichas abiertas desde buena fe conservan su regreso anterior.
- Los nombres completos permanecen en el DOM y pueden partir línea. Las imágenes decorativas tienen texto alternativo vacío cuando el nombre está inmediatamente al lado.

## Capas y comprobación

- Datos/migración: ninguna. Se usan los equipos y actas ya existentes.
- API/permisos: sin cambios. Los escudos usan la ruta ya autorizada por organización. No se publica ningún dato privado nuevo. La suite existente cubre acceso permitido y denegado entre organizaciones.
- Estados vacíos: permanecen los mensajes actuales de cada sección; Fixture sin resultado muestra una raya por equipo.
- `npm run typecheck`, `npm run build` y `npm test`: correctos; 83 pruebas aprobadas.
- Navegador local, organizador de prueba: Fixture a 390 y 320 px sin desborde horizontal; Clasificación y Goleadores a 390 px; Equipo → jugador → Equipo comprobado. La revisión física y con red inestable sigue pendiente.

Se aplicó el criterio de filas deportivas compactas de [la investigación visual](../investigacion-github-2026-11-09.md) sin cambiar el selector de torneos ni las secciones principales.
