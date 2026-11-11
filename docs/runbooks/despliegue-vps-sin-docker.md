# Web pública y flyers en un VPS, sin Docker

Preparación para un futuro piloto; no autoriza migrar datos reales ni publicar el servicio.

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
