# T09 — Copa Caacupé en producción

Fecha: 11/11/2026. VPS OVH, Ubuntu 24.04, PostgreSQL propio, API y worker como servicios systemd, Caddy HTTPS; sin Docker.

## Resguardo y ensayo

- Antes de importar, `scripts/vps-backup-check.sh` creó `/srv/torneos/backups/initial-20261111T174005Z.dump` y restauró correctamente 68 tablas en una base descartable. Se respaldó también `/srv/torneos/media` en `media-before-fcfs-20261111.tar.gz` y se verificó el archivo.
- Los 13 PNG pasaron validación de tamaño y firma. En `torneos_import_rehearsal`, restaurada desde el respaldo, el importador creó la Copa y comprobó 10 equipos, 10 escudos, 35 cruces, 0 partidos oficiales, puntos 2/1/0 y publicación parcial visible. No tocó `torneos_prod` durante este ensayo.

## Producción

- La importación real creó la organización `85b89c2d-d78a-4a23-81e3-ce0ba9272c40`, el torneo `a5ab953e-dad1-4130-8ec1-87654f035947` y la categoría Primera `6e7bf91a-9d01-488e-a8fd-1b083e8d7a96`.
- Se guardaron el logo FCFS, el emblema de Copa, el logo FPFS de flyer y los diez escudos. El diseño de flyer conserva verde oscuro/dorado, formato vertical PNG. La clave nueva de `usuariofcfs` está fuera del repositorio, en archivo 0600 del VPS; no se registró en esta evidencia.
- Los 35 cruces por posiciones y la vista pública parcial están publicados. A1–B5 siguen vacíos, J1/J2 esperan distribución, y no hay partidos, marcadores ni tabla oficial inventados. El torneo y el reglamento deportivo permanecen borrador.
- `https://alacancha.webs.vc/` devuelve una organización; la búsqueda de Caacupé devuelve la Copa. El enlace directo devuelve 200 con título propio, el emblema público responde 200 (123422 bytes), el sitemap incluye el torneo y `/ready` responde 200. API, worker y Caddy activos.
- El manifiesto entrega `name` y `short_name` «A la cancha»; el icono anterior sigue. Los metadatos por URL se generan en el servidor. Google Analytics está preparado, pero inactivo sin ID `G-...`.

## Calidad y límites

- Código local: `npm run typecheck`, `npm run build` y 95/95 pruebas correctas. Las pruebas incluyen acceso permitido/denegado entre organizaciones, publicación parcial, SEO y la condición de carga de Analytics.
- No se hicieron pruebas físicas de instalación y flyer en Android/iOS ni medición de tráfico real. El servidor quedó accesible, pero esta carga no autoriza el piloto. Falta el sorteo presencial, decidir jerarquía de desempates y publicar el reglamento solo cuando corresponda.
