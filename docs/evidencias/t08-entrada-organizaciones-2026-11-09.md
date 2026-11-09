# T08 — Entrada pública por organizaciones (09/11/2026)

## Recorrido

- `/` lista organizaciones activas que tienen torneos, ediciones, categorías y reglamentos publicados; búsqueda por nombre y filas móviles.
- `/{public_slug}` abre el selector de torneos de esa organización. `/{public_slug}/{id del torneo}` abre directamente el torneo. Recargar conserva la vista.
- `/acceso` abre el ingreso de gestión; `/panel` elige el destino según el rol autenticado. Los enlaces antiguos `#/publico/...` y `#/acceso` siguen siendo válidos.
- El login se enlaza de modo discreto desde la portada, fuera de la vista deportiva. La salida de sesión vuelve a `/`.

## Datos, API y permisos

- Migración 041 aditiva: `organizations.public_slug` estable, único y ajeno al nombre editable; se genera también en altas nuevas. El nuevo directorio `/api/v1/public/organizations` devuelve nombre, identificador y cantidad de torneos publicados, separado del catálogo anterior de 100 torneos. Este catálogo añade `organization_slug` y la consulta de organización añade `public_slug`. Solo se obtienen organizaciones con contenido publicado; no se añade información privada.
- La API deportiva y sus permisos permanecen bajo los IDs y ámbitos existentes. La ruta pública no autoriza llamadas privadas; las pruebas de integración cubren acceso correcto y rechazo entre organizaciones.
- Organización o torneo inexistente/no publicado: mensaje de no encontrado. Catálogo vacío y búsqueda sin resultado: estados separados. Error de carga: aviso visible.

## Verificación local

- `npm run typecheck` y `npm run build`: correctos.
- `npm test`: 83/83, con PostgreSQL local de pruebas. Incluye una organización activa sin torneo publicado que no aparece en el directorio. El primer intento sin servidor falló por conexión y el segundo desde sandbox restringido falló por `EACCES`; la ejecución autorizada contra `127.0.0.1:55461` pasó.
- Respaldo cifrado antes de migrar `torneos_local`; `npm run restore:check`: 62 tablas, 1002 archivos, filas y checksums iguales. `npm run db:migrate`: al día.
- Navegador integrado: portada, organización, torneo y recarga directa. A 320 y 390 px no hubo desborde horizontal. El enlace discreto abrió `/acceso`.

## Pendiente de aceptación

- Probar teclado, red inestable y nombres largos en un teléfono físico. La aceptación física sigue abierta.
- El identificador generado incluye UUID para evitar colisiones; un alias corto editable requerirá conservar enlaces anteriores. Configurar fallback hacia `index.html` en el alojamiento final para servir rutas limpias.
