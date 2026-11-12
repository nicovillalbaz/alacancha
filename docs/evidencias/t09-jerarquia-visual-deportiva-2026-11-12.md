# T09 — Jerarquía visual deportiva (12/11/2026)

## Referencias observadas

- [Copa Fácil](https://www1.copafacil.com/es/): se inspeccionaron sus vistas ampliadas de clasificación y partido. Escudos, marcador y puntos son el centro de lectura; la clasificación usa filas densas.
- [TIMBO](https://www.timbo.futbol/) y un [torneo público real](https://timbo.futbol/torneos/futbol-senior-one-group): se observaron la navegación por secciones, el fixture y las tablas. Sus controles y anuncios no se incorporaron a nuestro producto.

## Cambio local

Se reforzó la lectura de partidos, tablas, goleadores y cruces planificados en el portal común, la Copa por posiciones y el panel del organizador. Escudos y marcador tienen mayor jerarquía; los resultados oficiales se distinguen del partido pendiente. El detalle del partido conserva el bloque de marcador y los eventos. No se añadieron secciones, pasos, datos ni llamadas de red. Las pestañas, rutas, permisos y fuentes deportivas siguen iguales. No hay migración.

## Verificación

- `npm run typecheck`, `npm run build` y `npm test`: correctos (101/101). La suite incluye acceso permitido al organizador, rechazo entre organizaciones y consulta pública sin sesión; no se alteraron esos permisos.
- Navegador integrado, datos sintéticos locales: liga terminada a 390 px, partido abierto, clasificación a 390 y 320 px, Copa Caacupé con posiciones vacías a 320 px. Sin desborde horizontal; se comprobó también el ancho a 768 y 1280 px.
- Pendiente: aceptación estética del propietario, teclado y lector de pantalla completos, red inestable, texto al 200 % y teléfonos físicos. El entorno local no sustituye la aceptación real.

Los cambios son de presentación. No alteran decisiones deportivas ni la Copa Caacupé de producción.
