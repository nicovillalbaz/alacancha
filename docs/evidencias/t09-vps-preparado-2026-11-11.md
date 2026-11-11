# T09 — VPS preparado sin dominio (11/11/2026)

**Estado:** infraestructura instalada y probada en el VPS OVH; servicio público y piloto pendientes. No se importaron los datos locales de Copa Caacupé ni se ejecutó `db:seed`.

- Código `151bba0` clonado en `/srv/torneos/app`; `npm ci` y `npm run build` correctos con Node 24.19.0. PostgreSQL 16 exclusivo del proyecto, Google Chrome y FFmpeg instalados sin Docker.
- Base `torneos_prod` nueva con 68 tablas tras migraciones aditivas. API y worker como servicios systemd `torneos-api` y `torneos-worker`, activos después de reiniciar el VPS.
- `/ready` respondió 200 y el catálogo público `[]`: no hay organizaciones ni torneos publicados. El ingreso de `superadmin` se verificó por la API local; su contraseña temporal se consulta solo en el VPS y no está en este repositorio.
- API `127.0.0.1:4312` y PostgreSQL `127.0.0.1:5432`; el firewall permite solo SSH. SSH acepta la clave dedicada y tiene contraseña desactivada. No hay proxy HTTP/HTTPS ni dominio configurado.
- Se creó un respaldo inicial de PostgreSQL y se restauró en una base descartable: 68 tablas en ambos lados. La copia local no sustituye la copia externa de DB y medios exigida para el piloto. OVH tiene su respaldo automático contratado, pero su restauración completa de aplicación no se ensayó aquí.
- `WEB_ORIGIN=http://127.0.0.1:4312` es un valor interno provisional. Antes de abrir 80/443, instalar proxy TLS, fijar el dominio definitivo, actualizar `WEB_ORIGIN`, reiniciar servicios y verificar SEO, PWA, sesión, flyer y restauración externa.

**Datos y permisos:** ninguna cuenta de torneo, organización, equipo o jugador creada en producción; solo superadmin. Sin migración destructiva. La prueba de acceso fue permitida para superadmin; el aislamiento entre organizaciones sigue cubierto por la suite local y debe repetirse al crear dos organizaciones reales o sintéticas de ensayo en un entorno separado.

**UX/dispositivos:** no hay sitio HTTPS público; por eso no se declara aceptada la instalación móvil, la descarga de flyers ni el recorrido en Android/iOS. Pendientes teclado, red inestable y anchos de la guía en el dominio final.
