# Auditoría local de extremo a extremo — 11/11/2026

## Alcance y método

Se revisaron la configuración de API y proxy, las 158 rutas registradas, la seguridad por organización, las migraciones vinculadas a publicaciones, la cola y el worker, los builds, dependencias de producción, pruebas de integración y recorridos públicos/administrativos en navegador. Se usó PostgreSQL local exclusivo del proyecto y datos sintéticos. No se ejecutaron migraciones ni se alteraron resultados deportivos. Se respetaron las decisiones y guías de T04, T08 y T09.

## Hallazgos corregidos

| Área | Hallazgo | Corrección y comprobación |
| --- | --- | --- |
| Fixture público | La vista de jornadas ofrecía J1–J14 aunque algunas no existieran; J1/J2 pendiente comprimía la fecha en una columna de 42 px a 320 px. | Jornadas derivadas del plan publicado y bloque único para la apertura pendiente. La fecha ocupa una línea propia. Revisado en navegador a 320 px. |
| Fixture admin | «1 partidos» en el resumen. | Singular/plural según cantidad. |
| PostgreSQL | Una ruta hacía `Promise.all` de consultas sobre el mismo cliente transaccional; `pg` emitía advertencia de deprecación. | Consultas secuenciales dentro de la transacción. Suite repetida sin esa advertencia. |
| Cola de fixture | Había 23 eventos de publicación durables sin consumidor; `ops:check` marcaba atención. | Worker por lotes con `FOR UPDATE SKIP LOCKED`, separado de la generación de flyers. Prueba de consumo e idempotencia; ejecución local procesó 23 y el monitor quedó en cero. Los snapshots públicos no se reescriben. |
| Proxy y acceso | En producción se ignoraba `X-Forwarded-For`, por lo que el límite de intentos por IP podía ver a todos los visitantes como el proxy. | Confianza limitada a conexiones inmediatas desde `127.0.0.1`; runbook exige API privada y Caddy hacia esa dirección. |

## Resultado reproducible

- `npm run typecheck`: correcto.
- `npm run build`: correcto; JS principal 599,87 kB, 158,44 kB gzip; advertencia de tamaño mayor a 500 kB.
- `npm run audit:routes`: 158 rutas, 25 públicas o por token, 133 protegidas, 0 sin clasificar.
- `npm test`: 93/93. Incluye permiso permitido y denegado entre organizaciones, snapshot y publicación, fixture, actas, flyers PNG/JPG/PDF, SEO y PWA.
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilidades informadas.
- `npm audit --audit-level=high`: 0 vulnerabilidades informadas, incluidas dependencias de desarrollo.
- `npm run worker:once`: 23 eventos de fixture procesados, 0 flyers pendientes.
- `npm run ops:check`: `ok`; 0 flyers atrasados/fallidos, 0 eventos de fixture antiguos, copia de seguridad local de unas 20 horas.
- `npm run restore:check`: restauración de ensayo correcta; 68 tablas, 1.481 archivos, mismas filas y sumas de verificación; 48,1 segundos.
- `npm run perf:check` sobre base sintética de 1.249 organizaciones, 11.020 partidos y 721 flyers, 20 solicitudes por objetivo y concurrencia 4: portada p95 230 ms, sitemap p95 225 ms, fixture p95 122 ms y estadísticas p95 146 ms. Usa Fastify `inject`, sin red ni teléfono; no representa capacidad de producción.
- Navegador: directorio, selección de organización/torneo, pestañas y detalle público, clasificaciones de liga/eliminación, equipos, acceso admin, lista de torneos, fixture y partido a 320 px. Fixture de Caacupé sin desbordamiento horizontal a 320, 390, 768 y 1280 px; pestaña de Clasificación activada con Enter. La respuesta HTML de producción se abrió con CSP y sin errores de consola.

## Límites de la conclusión

La inspección no certifica todas las combinaciones posibles de reglas y estados ni el tráfico de una instalación real. Faltan pruebas físicas en Android/iOS, red inestable, teclado virtual, zoom al 200 % y lector de pantalla; generación, apertura y guardado de archivos en esos dispositivos; despliegue con HTTPS y worker persistente; y prueba de carga de SSE con audiencia concurrente. El bundle principal merece partición antes de escalar el uso móvil. Estas tareas permanecen abiertas y no se marcan como realizadas por las pruebas locales.
