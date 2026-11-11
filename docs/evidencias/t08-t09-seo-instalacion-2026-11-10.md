# T08/T09 — SEO, instalación y compatibilidad de flyers

Estado: código local y pruebas automáticas; aceptación física y despliegue pendientes.

- Datos/migración: ninguna. No se modificaron torneos ni archivos reales.
- API: Fastify sirve la compilación web en el mismo origen, rutas públicas con metadatos por organización/torneo, `robots.txt` y `sitemap.xml`. Las imágenes públicas del portal se permiten a rastreadores; acceso y rutas desconocidas llevan `noindex`.
- UI: botón «Instalar» en móvil y también en escritorio cuando el navegador ofrece el aviso, instrucciones manuales en iOS y otros navegadores móviles; firma pública «Desarrollado por NAVZ +595972995557».
- Permisos: el mapa del sitio consulta solo organizaciones activas y torneos oficiales publicados o sorteos cuya instantánea se publicó. La prueba de integración comprueba que un torneo borrador no entra al mapa; las rutas privadas siguen bajo sus permisos del servidor.
- Estados: si falta la compilación, la web devuelve 503; un archivo estático ausente o una ruta desconocida devuelve 404. El botón de instalación cae a guía manual si el navegador no ofrece el aviso. El worker marca como fallida una conversión inválida y la interfaz conserva su error.
- Flyer: la previsualización SVG llega por API; el archivo final se convierte en el worker con Chromium, y JPG con FFmpeg. Se sirve como PNG/JPG/PDF con verificación de tamaño y checksum. Esta arquitectura no depende del motor de dibujo del teléfono, pero su descarga y guardado requieren aceptación por navegador y dispositivo.
- Operación: para Linux, el worker busca `chromium` en `PATH` o usa `CHROME_PATH`. La API debe recibir todas las rutas mediante un proxy HTTPS. [Runbook](../runbooks/despliegue-vps-sin-docker.md).
- Pruebas automáticas: `npm run build`, `npm run audit:routes` y `npm test` (resultado registrado en `docs/avances.md`). Incluyen HTML/canónico/mapa del sitio y generación real PNG, JPG y PDF en el worker local.
- Visual: inspección del catálogo y torneo público en navegador móvil simulado a unos 390 px, sin desborde horizontal observado. Pendiente verificar el botón en Android/iOS reales, los flujos de guardado de flyer, teclado, red inestable y anchos restantes.
