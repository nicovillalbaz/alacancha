# T08 — Selector compacto y búsqueda pública (09/11/2026)

## Cambio visible

- Cabecera de organización reducida. Selector de torneos con buscador y filas compactas.
- Se eliminó la altura máxima y el scroll interno del selector. La página desplaza toda la lista; no queda una zona vacía por un contenedor truncado.
- La portada busca organizaciones en el directorio y torneos publicados en el servidor. Los resultados de torneos muestran su organización y abren el enlace directo.

## Datos, API y permisos

- Sin migración. `GET /api/v1/public/tournaments?q=...` compara nombres normalizados y mantiene los filtros de torneo, edición, categoría, reglamento y organización publicados. Limita cada búsqueda a 100 coincidencias.
- UI con búsqueda diferida de 180 ms, cancelación de solicitudes anteriores, estado de carga, error y sin resultados. La lista de una organización filtra localmente solo sus torneos.
- No cambian rutas privadas ni permisos. Las pruebas de integración existentes conservan un acceso permitido y uno denegado entre organizaciones; se añadieron búsquedas anónimas con y sin coincidencias.

## Verificación

- `npm run typecheck`, `npm run build`: correctos.
- `npm test`: 83/83.
- Navegador integrado a 390 y 320 px: sin desbordamiento horizontal. El selector tiene `overflow-y: visible` y altura de su contenido; «grupos» filtra dos torneos. En la portada, «eliminacion» encuentra nombres con «eliminación». Tab y Enter abren un resultado directo.
- Pendiente: teléfono físico y simulación de red inestable en el navegador.
