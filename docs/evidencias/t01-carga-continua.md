# T01 — Carga continua de goles y tarjetas · 28/10/2026

**Estado:** prototipo revisable, con datos sintéticos en memoria. Se aplica la observación del propietario: equipos por escudo, PT/ST/TE como botones y varios registros consecutivos sin abandonar la vista. La carga posterior es el recorrido prioritario.

## Entrega

- Equipos mediante dos botones con escudo y nombre, selección visible y estado pulsado accesible.
- Tiempo mediante PT/ST/TE, con nombre completo; tocar de nuevo el período seleccionado lo deja sin especificar.
- Gol, Amarilla y Roja se alternan dentro de la misma pantalla. No hay desplegables ni selección de jugador seguida por otro botón para confirmar cada alta.
- Cada fila indica dorsal/nombre y agrega el evento al tocarla. Confirmación visible, marcador derivado y conteos por jugador permiten comprobar lo cargado.
- Equipo/período, posición de desplazamiento, apertura de minuto y foco se conservan en las actualizaciones de la vista. El minuto manual se limpia después de cada evento; puede seguir desconocido.
- Deshacer revierte el último evento agregado en esta carga, sin salir ni aplicar una sanción automática. El historial deportivo oficial aún no existe en el prototipo.
- Filtro de doble toque accidental y ventana breve de 450 ms por jugador/tipo/equipo/período. Un registro deliberado posterior vuelve a admitirse. Esta protección visual no sustituye idempotencia o auditoría de servidor.

## Verificación dirigida

| Caso | Resultado observado |
|---|---|
| Dos goles consecutivos de jugadores del mismo equipo en ST | Marcador 2–1 → 4–1; permaneció la vista de carga y se conservaron equipo/período. |
| Pasar a Amarilla, elegir el otro escudo y TE; luego cambiar a Roja | Se registraron ambos tipos desde la misma vista con el nuevo contexto conservado. |
| Deshacer una roja recién agregada | Se quitó esa roja, la confirmación identificó al jugador y la carga permaneció abierta. |
| Doble clic sobre Bruno Duarte | Agregó un gol, no dos. |
| Registro deliberado posterior con Enter sobre Bruno | Agregó un segundo gol y mantuvo foco en su fila. |
| Minuto manual 0 | Se registró expresamente `0′`, luego el campo volvió a vacío para el siguiente evento. |
| Gol/Amarilla/Roja a 320/390/768/1280 px | Doce combinaciones sin desbordamiento horizontal, cero desplegables y controles de acción medidos de al menos 44 px. |
| Ruta de carga desde perfil público | Vista no disponible; solo comprobación de presentación en cliente. |
| Consola del recorrido | Sin errores ni advertencias observadas. |

[Matriz de anchos y comprobaciones](t01-carga-continua-layout.json) · [Captura móvil](t01-carga-continua-movil.jpg) · [Captura de escritorio](t01-carga-continua-escritorio.jpg).

`node --check prototipos/01-direccion-visual/app.js` aprobado. No se instalaron dependencias ni se modificaron datos reales. Sin migraciones, API de negocio o autenticación; las comprobaciones permitida/denegada entre organizaciones siguen pendientes en servidor. No se afirma operación con red intermitente, cronómetro, instalación PWA, zoom al 200 % o prueba física. T01 y la aceptación visual continúan abiertas; las vistas deportivas siguen siendo exploraciones de tandas posteriores.
