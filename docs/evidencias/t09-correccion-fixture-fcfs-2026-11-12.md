# T09 — Corrección de J6/J7 de Copa Caacupé

Fecha: 12/11/2026. El organizador confirmó que A4–B4 debía jugarse en J6 y detectó que A3 aparecía dos veces esa jornada. La corrección intercambia la programación de A4–B4 y A2–A3; conserva los 25 cruces de grupos y la Fecha 4 de ambos partidos.

## Resguardo y ensayo

- Respaldo de producción `/srv/torneos/backups/initial-20261112T153759Z.dump`; restauración comprobada en base descartable de 69 tablas.
- La inspección de producción encontró revisión publicada 37, G17 (A2–A3) en J6, G20 (A4–B4) en J7 y cero partidos oficiales vinculados al plan.
- Se restauró ese respaldo en `torneos_schedule_rehearsal`, se aplicó la corrección allí y se verificó revisión 38, ambos cruces intercambiados y ningún equipo repetido por jornada. La base temporal se descartó.

## Aplicación y comprobación

- En producción se cambió solo `jornada_no` y `planned_date` de G17 y G20. Se creó la publicación pública 38 con la misma asignación de equipos y el mismo resto del plan; quedó registro de auditoría del superadmin.
- La API pública por HTTPS entregó revisión 38. J6 (01/12): A3–B3, A5–A1, A4–B4. J7 (03/12): A2–A3, B5–B1, B2–B3.
- La inspección posterior confirmó `corrected: true` y `linkedMatches: 0`. API y web respondieron 200; los cuatro servicios siguieron activos.
- El plan fuente, la guía de formato y la fe de erratas de las fuentes reflejan la corrección. Una prueba automática verifica que ningún equipo se repita en las jornadas programadas.

No se cambiaron resultados, actas, jugadores, pagos, sorteo de posiciones ni datos del espejo privado de ensayos. La comprobación física en teléfonos sigue pendiente.

## Pruebas locales

Tipos correctos. Pasaron las pruebas dirigidas de migración repetible, plan por posiciones y unicidad de equipos por jornada. La corrida completa anterior dio 96/100: una expectativa fija de 50 migraciones se corrigió para comprobar repetibilidad sin fijar el total; las tres fallas restantes fueron generación de flyers por tiempo agotado en este Windows y una de ellas se reprodujo aislada. Esas fallas no son una verificación satisfactoria de flyers y quedan para diagnóstico separado; los cuatro flyers del torneo sintético en el espejo del VPS se habían generado correctamente antes de esta corrección.
