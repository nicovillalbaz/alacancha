# T09 — Marca de organización y navegación pública

Fecha: 11/11/2026. Revisión `eac5668` desplegada en `alacancha.webs.vc`.

- Causa del 403: la vista mostraba edición para superadmin, pero `organizationAccess` rechazaba a ese rol también en las tres rutas específicas de marca. Ahora esas tres rutas aceptan explícitamente al superadmin; las demás rutas del torneo mantienen la prohibición.
- La prueba de integración verifica lectura y carga de logo, cambio de marca por superadmin, rechazo de otro organizador y de administrador de equipo. Las 97 pruebas pasaron; `npm run build` y `npm run audit:routes` también.
- En producción, inicio de sesión de superadmin seguido por lectura del logo FCFS: 200, imagen. Consulta de torneos privados desde la misma sesión: 403. Emblema público de Copa Caacupé: 200, `image/png`, 123422 bytes.
- Vista pública: el logo de la Federación y el emblema de la Copa se observaron en la cabecera. A 390 y 320 px, el botón de regreso y el título permanecen legibles sin desborde. Al tocar regreso se abrió `/`; tocar la única organización volvió directamente a `/fcfs-copacaacupe`.
- [Comparación local del icono candidato](../../prototipos/logo-candidato/index.html): conserva la imagen original recibida y una extracción transparente de la A de césped. El manifiesto y los iconos instalados siguen usando el diseño anterior. Aceptación en Android/iOS físicos pendiente.
