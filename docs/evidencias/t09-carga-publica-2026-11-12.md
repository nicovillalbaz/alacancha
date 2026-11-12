# T09 — Esperas del portal público

Fecha: 12/11/2026. Entorno de medición: API del espejo con Copa completa, consultada desde el propio VPS. Esta medición no representa latencia móvil ni renderizado en un teléfono.

## Antes del ajuste

| Solicitud | Tiempo cálido en el VPS | Tamaño |
| --- | ---: | ---: |
| Organizaciones | 36 ms | 332 B |
| Torneo por alias | 11 ms | 275 B |
| Torneos de la organización | 44 ms | 3,9 KB |
| Sorteos públicos | 83 ms | 8,7 KB |
| Competición por posiciones | 67 ms | 27,5 KB |
| Fixture público | 80 ms | 44,3 KB |

El alias público esperaba primero la lista de organizaciones y después consultaba el torneo. Cada toque de un partido descargaba el fixture completo. Al volver a la Copa, la competición se vaciaba hasta recibir una respuesta nueva.

## Cambio

- `/api/v1/public/resolve/:slug` resuelve el alias de organización o torneo en una petición, conservando la comprobación de visibilidad pública. No cambia los enlaces existentes ni expone torneos en borrador.
- La Copa precarga el fixture una vez al entrar en Partidos. Los toques reutilizan la petición en curso o la respuesta durante un máximo de 15 segundos. Un evento de resultado usa una revisión nueva; un fallo elimina la entrada y permite reintentar.
- La competición pública conserva su último dato mientras revalida la misma categoría y reutiliza una copia breve al volver a ella. Un cambio de categoría o de revisión del sorteo no muestra datos de la anterior.
- Si se toca un cruce antes de que llegue su identificador, la ficha de planificación se abre de inmediato y completa el detalle cuando llega.

No se modificaron tablas, datos deportivos ni permisos privados. La caché es solo de lectura y en memoria del navegador.

## Verificación

`npm run typecheck` y `npm run build`: correctos. Prueba de integración del plan parcial: alias de torneo, alias de organización, alias inexistente y denegaciones entre organizaciones correctos. Auditoría de rutas: 192/192 clasificadas. Falta medir la mejora de navegación en red móvil y la aceptación física en Android/iOS; no se promete carga instantánea en cualquier conexión.
