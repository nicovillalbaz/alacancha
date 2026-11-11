# Sorteo público de Caacupé: actualización de páginas abiertas

**Estado:** desplegado en el VPS el 11/11/2026; aceptación física pendiente.

## Cambio

- `publish-draw` conserva su transacción, control de revisión e instantánea pública versionada. La consulta pública ordena por revisión.
- El flujo SSE público anuncia una revisión nueva del sorteo. La web vuelve a consultar la instantánea al recibir el aviso y al reconectarse; la vista por etapas vuelve a cargar sus datos derivados cuando cambia la revisión.
- Fastify termina las conexiones SSE activas en `preClose`. El navegador puede reconectarse tras el reinicio, sin esperar el límite de 90 segundos del servicio anterior.
- Una edición privada posterior no cambia la última instantánea pública hasta una nueva publicación explícita.

## Comprobación

- `npm run typecheck` y `npm run build`: correctos.
- `npm test`: 98/98. La prueba nueva mantiene una conexión SSE abierta, publica un sorteo sintético, recibe el aviso y exige cierre rápido del servidor. La suite también cubre rechazo entre organizaciones, publicación parcial y publicación completa por versión.
- Producción en `1e7e1bf`: `torneos-api` y `torneos-worker` activos; `/ready` responde. El enlace `/fcfs-copacaacupe` devuelve 200; el SSE público entrega `event: ready`; la API pública devuelve la revisión 1 de la Copa con 0/10 posiciones asignadas. No se asignaron puestos ni se publicó otra revisión real durante esta comprobación.
- Sin migración ni modificación de datos reales. No se realizó ensayo de restauración adicional para este cambio de código.

## Límite operativo

La pestaña conectada se actualiza al siguiente sondeo del servidor, normalmente dentro de tres segundos más la latencia de red. Una conexión interrumpida se reconecta y vuelve a consultar; si el servicio o la red no están disponibles, la actualización espera su recuperación. No se ha ensayado aún el sorteo presencial completo con varios teléfonos físicos y tráfico simultáneo. El primer reinicio de la versión anterior tardó hasta su límite de cierre; la corrección de `preClose` se verificó en la suite local y quedó instalada para los reinicios futuros.
