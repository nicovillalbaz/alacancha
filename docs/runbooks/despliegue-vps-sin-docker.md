# Web pública y flyers en un VPS, sin Docker

El acceso HTTPS provisional está activo; esto no autoriza importar datos reales ni iniciar el piloto.

**Instalación del 11/11/2026:** [preparación del VPS](../evidencias/t09-vps-preparado-2026-11-11.md) y [publicación HTTPS provisional](../evidencias/t09-vps-https-2026-11-11.md). `alacancha.webs.vc` apunta al VPS; Caddy escucha en 80/443 y redirige HTTP a HTTPS. La API y PostgreSQL permanecen en loopback. La URL es provisional y no fija la marca.

## Archivos operativos del VPS

- `scripts/vps-bootstrap.sh`: crea una sola vez la base y `/srv/torneos/production.env` con secretos aleatorios; cancela si ya existe el entorno.
- `scripts/vps-bootstrap-superadmin.ts`: crea el primer superadmin únicamente si la base está vacía; deja una clave temporal fuerte en `/srv/torneos/first-login.txt` (solo root). Consultarla por SSH y retirarla después de guardarla de forma segura. No enviar claves por chat ni subir ese archivo al repositorio.
- `scripts/vps-backup-check.sh`: respalda PostgreSQL y ensaya restauración en `torneos_restore_check`; no reemplaza la copia externa de base y medios.
- `deploy/systemd/torneos-api.service` y `deploy/systemd/torneos-worker.service`: procesos persistentes sin contenedores, con escritura limitada al directorio de medios. Verificar `systemctl status torneos-api torneos-worker` y `curl http://127.0.0.1:4312/ready`.

La base nueva no incluye datos de muestra. `npm run db:seed` y los cargadores `demo:*`/`fcfs:*` no se ejecutan en producción. Una actualización debe conservar `/srv/torneos/production.env`, `/srv/torneos/media` y los respaldos fuera del checkout; respaldar y ensayar restauración antes de migraciones con riesgo.

La primera carga real de Caacupé utiliza exclusivamente `scripts/import-fcfs-production.ts`. El comando exige `NODE_ENV=production`, el origen HTTPS esperado, `FCFS_PRODUCTION_IMPORT=production`, la base `torneos_prod` en loopback y los 13 PNG revisados en `/srv/torneos/import-assets` (tres logos y diez escudos en `escudos/`). Primero ejecutar `scripts/vps-backup-check.sh`, respaldar también `/srv/torneos/media`, restaurar la base en `torneos_import_rehearsal` y correr `sudo -u torneos bash /srv/torneos/app/scripts/vps-import-fcfs.sh rehearsal` sobre esa copia. Verificar los conteos y la vista pública; entonces correr el mismo wrapper con `production`. El importador no lee el acceso de muestra local ni imprime contraseñas; deja la clave nueva de `usuariofcfs` con permiso 0600 en `/srv/torneos/private/fcfs-access-production.txt`. No ejecutarlo para cargar torneos de muestra.

## Procesos

Instalar Node.js 24, PostgreSQL exclusivo del proyecto, Chromium y FFmpeg. Configurar `DATABASE_URL`, `APP_SECRET`, `WEB_ORIGIN=https://dominio-elegido`, `MEDIA_DIR`, `NODE_ENV=production`, `API_HOST=127.0.0.1` y `API_PORT=4312` en el entorno de los procesos. Si Chromium no está disponible como `chromium` en `PATH`, definir `CHROME_PATH` con su ruta absoluta. El mismo `MEDIA_DIR` debe ser legible y escribible por API y worker.

En una copia del código: `npm ci`, `npm run build`. Con el respaldo y ensayo de restauración exigidos por el proyecto, aplicar únicamente las migraciones pendientes. Iniciar dos servicios persistentes:

```sh
node --import tsx apps/api/src/server.ts
node --import tsx apps/worker/src/loop.ts
```

El worker procesa y guarda los flyers en PNG, JPG y PDF. Si no corre, la solicitud queda en cola y ningún teléfono puede descargar un archivo nuevo. Comprobar que `chromium --version` y `ffmpeg -version` funcionen con el usuario del worker.

Un proxy HTTPS debe dirigir **todas** las rutas al proceso API: `/`, las rutas de organización y torneo, `/index.html`, `/sw.js`, `/manifest.webmanifest`, `/icons/`, `/assets/` y `/api/`. No servir otro `index.html` desde el proxy: Fastify aporta los metadatos específicos y el `sitemap.xml`. Ejemplo de host en Caddy, reemplazando el dominio al decidirlo:

El servidor confía en `X-Forwarded-For` únicamente cuando la conexión inmediata viene de `127.0.0.1`; mantener `API_HOST=127.0.0.1` y el proxy apuntando exactamente a esa dirección. Así los límites por IP distinguen visitantes y nadie desde Internet puede enviar directamente cabeceras de proxy falsas.

```caddyfile
dominio-elegido.example {
    reverse_proxy 127.0.0.1:4312
}
```

El certificado HTTPS y `WEB_ORIGIN` deben coincidir. En local, `localhost` es un contexto seguro admitido para probar la PWA. La web servida por Vite en 4311 sirve para desarrollo visual; la respuesta HTML de producción se comprueba en el proceso API.

## Comprobación antes del piloto

- Abrir `/`, `/organizacion-publica` y `/organizacion-publica/uuid-de-torneo` sin sesión; verificar título, OG, canónico y navegación.
- Verificar que `/sitemap.xml` contenga solo torneos o sorteos publicados y que `/acceso` tenga `noindex`.
- Probar `/index.html`, `/manifest.webmanifest`, `/sw.js` y ambos iconos: todos deben responder correctamente para que el service worker se instale.
- Generar un flyer PNG, JPG y PDF desde una cuenta autorizada; esperar estado `ready` y descargar los tres archivos en Android Chrome, iOS Safari y navegador de escritorio. Verificar apertura/guardado, no solo respuesta 200.
- Probar «Instalar» en Android Chrome con HTTPS: usa el aviso del navegador si este lo ofrece. En iPhone Safari, el botón guía a Compartir → Agregar a Inicio; iOS no expone el aviso programático. En otro navegador, seguir la guía manual disponible.
- Repetir el recorrido con red interrumpida, teclado, texto largo y los anchos de `docs/10-guia-visual.md`. Registrar evidencia por dispositivo real; las pruebas automáticas de archivos no sustituyen esa aceptación.

Los archivos oficiales se conservan en `MEDIA_DIR`; incluir ese directorio y PostgreSQL en el respaldo y ensayo de restauración del piloto.
