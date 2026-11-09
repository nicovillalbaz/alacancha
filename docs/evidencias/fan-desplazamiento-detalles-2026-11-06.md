# Desplazamiento y detalles del fan — 06/11/2026

## Implementado

- El `html` recibe una clase solo mientras el portal público está montado. A menos de 700 px, se oculta el indicador vertical del navegador sin bloquear el desplazamiento.
- `SportTabs` coloca automáticamente la pestaña activa completa dentro de su fila al tocarla, cambiarla por estado o usar flechas; respeta la preferencia de movimiento reducido.
- Partido y equipo se presentan sin cabecera ni selector de torneo. Abren al comienzo de la página y al cerrar se recupera la posición anterior de la lista.

## Comprobación local

- `npm run build`: correcto, incluidos TypeScript y Vue.
- Chrome a 390 px: la pestaña «Valla menos vencida» quedó completa y la fila se desplazó; el documento no tuvo desborde horizontal.
- Chrome en viewport estrecho de escritorio: `scrollbar-width: none`, contenido más alto que el viewport y `window.scrollY` positivo tras desplazarlo.
- Detalles de partido y equipo: la cabecera del torneo no existe mientras están abiertos. El contenido y los nombres extensos conservaron su ancho.
- Sin migración ni cambio de API o permisos. Prueba en teléfono físico y aceptación estética pendientes.

## Capturas

- [Pestaña elegida completa](fan-pestana-desplazada-2026-11-04.png) · [sin barra vertical](fan-sin-barra-vertical-2026-11-04.png) · [partido sin cabecera](fan-partido-detalle-2026-11-04.png) · [equipo sin cabecera](fan-equipo-detalle-2026-11-04.png)
