# Escudos de Sanber sobre blanco — 12/11/2026

Se conservaron los doce JPG/JPEG originales en `img/FSBFS` y se prepararon PNG de 512 × 512 en `img/FSBFS/logos-blanco`: federación, Copa y diez equipos. Se quitó el fondo del afiche, fotografía o color exterior cuando correspondía; el dibujo y los nombres de cada escudo no se rediseñaron. El script de extracción está en `scripts/prepare-fsbfs-logos.py`.

Antes de cambiar las referencias de medios se generó y restauró el respaldo `/srv/torneos/backups/initial-20261112T193724Z.dump` (69 tablas). También se archivaron y comprobaron los medios en `/srv/torneos/backups/media-before-sanber-logo-refresh-20261112.tar.gz`. Se restauró la Copa en la base aislada `torneos_fsbfs_logo_rehearsal` y un directorio de medios separado. Allí, la API sustituyó los doce logos y devolvió 200 con los mismos bytes PNG en cada lectura pública. La cuenta de Sanber recibió 403 al intentar modificar el logo de otra organización.

Después se aplicó el mismo script a producción: doce medios actualizados, sin borrar los previos. `npm run typecheck` correcto. Las cuatro unidades siguieron activas; `/ready`, `/copa-sanber` y el logo público respondieron 200, este último con `image/png`. En el navegador integrado a 390 px se comprobaron la cabecera de Copa Sanber y los diez escudos en Equipos. La aceptación física en teléfonos sigue pendiente.
