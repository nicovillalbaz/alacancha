# Vista fan y cuadro — 04/11/2026

**Estado:** incremento local implementado y verificado. Aceptación estética del propietario y dispositivos físicos pendientes.

## Recorrido

- Sin sesión, `#/publico` muestra solo el selector de torneos publicados. `#/acceso` conserva la entrada administrativa por enlace directo; no hay botón de ingreso en el fan.
- Un torneo abre Partidos, Clasificación, Goleadores, Valla menos vencida y Equipos. La copa directa omite Clasificación. Cuadro es subvista de Partidos.
- Una Fecha muestra sus encuentros y el flyer publicado de esa Fecha cuando existe. Un partido abre su marcador y eventos públicos agrupados por tiempo, con flyer de resultado si está publicado.
- Equipo abre los nombres autorizados para publicación, goles y tarjetas. Las tablas, goleadores, valla y cuadro conservan su flyer contextual publicado.
- El cuadro móvil muestra una ronda completa por pestaña; las líneas de conexión se reservan para la vista ancha.

## Datos, API y permisos

Sin migración. La API pública agrega `entry_id` de los equipos visibles, `category_id` de cada partido, `phase_id` y marcador publicable del cuadro, y una lista de jugadores autorizados por categoría. Los goles y tarjetas se derivan de actas oficiales. Nombres sin permiso de publicación, documentos, cédulas, nacimiento, motivos y eventos anulados no salen en el plantel público. La lista de flyers públicos añade `sourceId` para ubicar cada archivo junto a su fuente. El servidor filtra por organización y estado publicado; la UI no usa el `organization_id` enviado por el cliente como autorización.

## Pruebas

- `npm run build`: correcto, incluidos TypeScript y Vue.
- `npm test`: **82/82**. El caso T05 comprueba jugador oculto antes de publicar su nombre, visible con un gol después, y categoría de otra organización denegada. Los casos T08 comprueban flyer vigente y acceso cruzado denegado.
- Chrome móvil local: 320, 390 y 768 px sin desborde horizontal en Partidos; 390 px en las cinco secciones, detalle de equipo, partido, nombres extensos y cuadro. El inicio público no muestra «Ingresar».
- Sin datos publicados se muestran mensajes breves en el contexto elegido; error de carga y espera tienen estado visible.

## Capturas

- [Partidos a 320 px](fan-partidos-320-2026-11-04.png) · [clasificación](fan-clasificacion-2026-11-04.png) · [goleadores](fan-goleadores-2026-11-04.png) · [valla](fan-valla-2026-11-04.png)
- [Equipos](fan-equipos-2026-11-04.png) · [plantel](fan-equipo-detalle-2026-11-04.png) · [partido](fan-partido-detalle-2026-11-04.png) · [nombres largos](fan-partido-nombres-largos-2026-11-04.png)
- [Cuadro](fan-cuadro-2026-11-04.png) · [Final](fan-cuadro-final-2026-11-04.png) · [selector sin sesión](fan-selector-2026-11-04.png)

## Pendiente de aceptación

Probar teléfonos reales, teclado y lector de pantalla completo, texto al 200 %, red inestable y aceptación estética con el propietario. El subdominio de cada cliente requiere una decisión de despliegue y configuración de dominio; la URL de organización ya limita su catálogo.
