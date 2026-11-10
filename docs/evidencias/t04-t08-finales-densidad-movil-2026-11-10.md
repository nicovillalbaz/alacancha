# T04/T08 — Finales y densidad en móvil

Fecha: 10/11/2026. Estado: verificado en navegador local; teléfono físico pendiente.

- **Dato y API:** sin cambios. La tercera etapa continúa siendo un todos contra todos de cuatro clasificados, con tres fechas y seis partidos. Persisten `quadrangular` y los nombres de la instantánea publicada.
- **UI admin y pública:** «Finales» identifica la etapa; «Final 1–3» identifica sus fechas. El nombre corto deja de partirse en dos líneas en Jornada 12. La ficha del formato aclara «todos contra todos».
- **Jornadas:** J12 ofrece J13 y J14 con sus dos cruces y fecha, en filas compactas que abren la jornada tocada. No hay tarjetas, formulario ni datos duplicados en el modelo.
- **Permisos:** los accesos de admin y público siguen sus rutas previas. El cambio no amplía datos expuestos ni acepta organización enviada por el cliente. La integración existente cubre un organizador permitido y otro denegado.
- **Vacío y error:** si una jornada no tiene partidos conserva su estado previo; una fecha aún sin resultado presenta guion. Red inestable: este cambio es de presentación sobre la respuesta ya cargada; prueba física pendiente.
- **Verificación:** `npm run typecheck` correcto. Navegador a 390 px: J12 con dos partidos, J13/J14 visibles debajo. A 320 px, admin y público sin desborde horizontal; clasificación pública muestra «Finales».
