# Copa Sanber: carga inicial y publicación de presentación — 12/11/2026

## Fuente y alcance

[Manifiesto de escudos](../fuentes-fsbfs-2026.md). Se creó la Federación San Bernardinense, usuario organizador `usuariofsbfs`, Copa Sanber 2026 en categoría Primera y diez equipos con sus escudos. El formato y el fixture siguen pendientes; no se crearon fechas, jornadas, partidos, planillas, actas ni resultados. La presentación pública expone identidad y equipos, sin publicar el reglamento inicial en borrador.

## Respaldo y ensayo

- Respaldo previo `/srv/torneos/backups/initial-20261112T182211Z.dump`, restaurado y comparado: 69 tablas. Medios previos archivados en `/srv/torneos/backups/media-before-sanber-20261112.tar.gz` y lista TAR comprobada.
- Se restauró la base en `torneos_fsbfs_rehearsal`, se copiaron medios a `/srv/torneos/fsbfs-rehearsal-media`, se aplicó la migración 052 y se importaron diez equipos y diez escudos. La lectura anónima del ensayo confirmó una Copa presentada y ningún partido.
- La clave temporal de ensayo y la de producción son distintas y se guardan en `/srv/torneos/private`, fuera de Git, con permisos `0600`.

## Código, permisos y pruebas

- Migración 052 aditiva: `tournaments.public_preview_at`. La API comprueba la membresía y la organización antes de activar u ocultar la presentación. El portal filtra el reglamento no publicado y ofrece solo Equipos cuando no hay formato aprobado.
- `npm run typecheck`, `npm run build` y `npm run audit:routes`: 193 rutas clasificadas. Suite completa: 101/101. Caso permitido y denegado entre organizaciones para presentación; SEO y enlace directo verificados.
- En navegador integrado a 390 px: `innerWidth=scrollWidth=390`, diez escudos visibles y detalle de 3 de Febrero abre con su lista vacía. La cabecera de torneo se oculta en ese detalle. La aceptación física en Android/iOS y con red inestable sigue pendiente.

## Producción

- Git `0a1cb4f` instalado; migración 052 aplicada a producción y espejo; compilación terminada. La carga real devolvió organización `7a8be048-ffce-4e14-9213-cb0d902e326d`, torneo `5edc2433-5833-4eb4-9c6b-53971f6454aa` y categoría `198ee7f1-a932-4fce-9165-33dd23d89ed8`.
- Cuatro servicios `active`. Tras el reinicio, `/ready` de producción y espejo, `/copa-sanber` y `/fcfs-copacaacupe` devolvieron 200. El script de instalación terminó con código 1 porque consultó `/ready` antes de que el proceso escuchara; la comprobación posterior respondió 200. Se añadió espera con reintentos al script.
- El catálogo público muestra dos organizaciones con un torneo cada una. Logo de la FSBFS y emblema de la Copa respondieron 200; la API pública devuelve diez equipos `has_shield=true`, `presentation_only=true`, reglas nulas y categoría Primera. Producción tiene 20 equipos en total, cero `draft_matches` y cero `matchdays`. El sorteo público de Caacupé conserva la revisión 38.
- Los registros técnicos recientes muestran un `LOGIN_FAILED` 401 esperado por el primer intento de entrada antes de aceptar la invitación nueva; no se observó error 5xx en este proceso.
