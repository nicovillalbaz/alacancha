# Entrada directa y selector público — 06/11/2026

## Cambios

- El enlace `#/publico/{organización}/{torneo}` abre ese torneo y `#/publico/{organización}` muestra solo los torneos publicados de su organizador.
- El selector nativo se cambió por filas táctiles bajo la cabecera. La opción elegida se distingue sin añadir texto redundante.
- Al abrir el origen sin fragmento, se recupera el último enlace público válido guardado en ese navegador. En un navegador nuevo, `#/publico` queda como respaldo para elegir un torneo.
- El ingreso administrativo solo se abre por su enlace directo `#/acceso`. Ya no se muestra enlace al catálogo ni texto de desarrollo en esa pantalla. Cerrar sesión vuelve a la última vista pública.
- Las pestañas siguen respondiendo al gesto horizontal y al teclado; no muestran la barra de desplazamiento bajo ellas.

## Datos, permisos y errores

No hay migración ni cambio de API. Se reutiliza el catálogo público filtrado por organización, que solo incluye torneos publicados. El recuerdo local almacena únicamente la ruta pública con IDs válidos; no almacena credenciales ni concede acceso. La autorización administrativa sigue en el servidor. Si no hay torneos publicados, la lista muestra un estado vacío breve; si falla la carga, aparece el error de la vista pública.

## Comprobación

- `npm run build`: correcto, incluidos TypeScript y Vue.
- Prueba de integración del portal T02: publicación permitida solo con autorización explícita y ámbito de otra organización denegado; 4/4 en ejecución filtrada.
- Chrome local: 320, 390 y 768 px sin desborde en Partidos; 390 px en clasificación, goleadores, valla, equipos, partido y cuadro. Selector abierto del organizador sin control nativo y sin barra visible de pestañas.
- Elegir una fila cambió a la URL directa de su torneo. Reabrir el origen en el mismo perfil recuperó esa URL. El enlace de organizador abrió una lista de varios torneos.
- El acceso público no mostró enlace de ingreso. Prueba física y aceptación del propietario pendientes.

## Capturas

- [Selector del organizador](fan-selector-organizador-2026-11-04.png) · [pestañas sin barra](fan-clasificacion-2026-11-04.png) · [torneo recordado](fan-torneo-recordado-2026-11-04.png) · [lista del organizador](fan-organizador-torneos-2026-11-04.png)
