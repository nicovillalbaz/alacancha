# Ajuste visual de listas públicas

**Estado:** corrección de UI del 11/11/2026; validación física pendiente.

- Las filas pulsables de partidos ya no muestran el borde nativo del botón, que formaba marcos oscuros entre encuentros. Cada encuentro usa un divisor fino; las jornadas conservan una separación discreta.
- La lista de equipos usa dos columnas compactas en escritorio y una columna en móvil, con separación fina y el acceso a cada ficha intacto.
- Sin cambios de datos, API, permisos ni migraciones. El sorteo de prueba sigue retirado.
- `npm run typecheck` y `npm run build` correctos. Revisión visual local de Partidos y Equipos en escritorio y a 390 px; `scrollWidth` no supera `clientWidth` a 390 px y el borde lateral del encuentro mide 0 px.
- Pendiente: aceptación estética del propietario y prueba en teléfonos físicos.
