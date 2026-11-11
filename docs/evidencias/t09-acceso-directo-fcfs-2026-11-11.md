# T09 — Acceso directo a Copa Caacupé

Fecha: 11/11/2026. URL provisional: `https://alacancha.webs.vc/fcfs-copacaacupe`.

- Código `c8ba24c` desplegado en VPS. Migración `048_public_tournament_slugs.sql` añade alias público opcional, único y sin afectar URLs previas. Cambiarlo exige sesión de organizador y recurso dentro de su organización; la prueba de integración rechaza otra organización.
- Antes de migrar: `/srv/torneos/backups/initial-20261111T181414Z.dump`; restauración verificada de 68 tablas. La migración pasó en la base temporal restaurada y luego en `torneos_prod`; no se borraron torneos, equipos, medios ni resultados.
- Las 96 pruebas locales pasaron; compilación y auditoría de 162 rutas sin rutas sin clasificar. HTTPS devolvió logo FCFS como PNG, HTML de la Copa con ID del torneo, canónico corto, sitemap con alias, redirección 308 desde el enlace largo y `/ready` correcto.
- Las contraseñas de las dos cuentas solicitadas se establecieron mediante las rutas autenticadas de la aplicación y se probó el ingreso. Las sesiones anteriores se revocaron. No se guardaron contraseñas en el repositorio ni en esta acta.
- Analytics permanece inactivo. Quedan pendientes comprobación en teléfono físico, prueba de red móvil y copia externa del respaldo.
