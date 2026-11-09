# T08 — Entrada pública por torneo · 04/11/2026

- **Datos:** sin migración. Catálogo derivado de torneos, ediciones, categorías y reglas publicadas en organizaciones activas.
- **API/permisos:** `GET /api/v1/public/tournaments` funciona anónimamente y omite borradores. Fixture y cuadros incluyen identificador de torneo; la galería pública vincula cada flyer con su torneo. Las rutas privadas conservaron pruebas de acceso permitido y denegado entre organizaciones.
- **UI:** `/` y `#/publico` abren el catálogo. `#/publico/:organizacion/:torneo` filtra fechas, cuadros, estadísticas, equipos, patrocinadores y flyers. `#/acceso` ofrece volver sin cuenta. El enlace público anterior por organización permanece navegable.
- **Error/vacío:** catálogo vacío indica que aún no hay torneos publicados; una ruta de torneo no publicado muestra error y no presenta datos de otra competencia. Partidos/estadísticas vacíos conservan sus mensajes existentes.
- **Verificación:** `npm test` 82/82, `npm run build` correcto. Catálogo anónimo visto en [390 px](portal-publico-inicio-2026-11-04.png). Torneo finalizado visto en [320 px](portal-publico-torneo-320-2026-11-04.png), [390 px](portal-publico-torneo-390-2026-11-04.png) y [768 px](portal-publico-torneo-768-2026-11-04.png): tres fechas, una categoría estadística, sin desborde horizontal. Prueba física y red inestable pendientes.
