# T09 — Rendimiento, seguridad, operación y piloto

**Objetivo:** dejar el producto preparado para pilotos reales, con recuperación, privacidad y captura usable en cancha. Esta tanda no presupone publicación si las puertas siguen abiertas.

**Estado 30/10/2026:** los pendientes priorizados de código local tienen [evidencia y límites](../evidencias/t09-codigo-local-2026-10-30.md): PWA instalable, medición sintética ampliada, cola durable, auditoría de rutas y respaldo v3 por streaming. Se conserva la [preparación anterior](../evidencias/t09-preparacion-piloto.md). Las pruebas físicas, carga sostenida de producción, copia externa, revisión legal, piloto y su autorización siguen pendientes.

**Avance visual 04/11/2026:** [pestañas deportivas](../evidencias/pestanas-deportivas-2026-11-04.md) separan estadísticas, partido, equipo y portal público sin sumar una tanda. Se verificaron cuatro anchos y teclado básico; la aceptación física y del propietario sigue pendiente para T09-05.

## Dependencias

T01–T08 con evidencia de salida; decisiones V01–V06 resueltas donde afecten publicación/datos. Usuarios piloto y dispositivos disponibles.

## Tickets en orden

1. **T09-01 Rendimiento.** Medir API/DB/worker con torneos concurrentes, planteles grandes, lectura pública y captura simultánea; optimizar consultas/índices con medición, no particionar por anticipación.
2. **T09-02 Conectividad.** Ensayar modo avión, reinicio de PWA, cola local, sesión revocada, dos capturistas y conflicto. Mantener evidencia y evitar pérdida/duplicación.
3. **T09-03 Seguridad/privacidad.** Auditoría de endpoints, RLS o equivalente, C.I., medios, menores, soporte, CSP/CSRF, retención y autorización de publicación. Cerrar hallazgos críticos.
4. **T09-04 Operación.** Backup cifrado fuera del servidor principal, restauración completa probada, migraciones staging, monitoreo, alertas, runbooks de incidentes, recuperación y soporte. Medir RPO/RTO reales.
5. **T09-05 UX real.** Pruebas con superadmin, organizadores, administradores de equipo, planilleros y aficionados en teléfonos iPhone/Android de gama media, con sol exterior y señal irregular; medir alta de jugador/origen, fixture y eventos.
6. **T09-06 Piloto operativo.** Confirmar marca/dominio, protección de datos y reglas locales; piloto acotado con criterios de éxito/retirada, capacitación y registro de incidencias.

## Puertas de salida

- Ningún fallo crítico de aislamiento, bloqueo de acceso, evento perdido o exposición privada abierto.
- Restauración de DB + media desde backup externo ensayada y documentada; tiempos medidos.
- Flujos de convocatoria y evento funcionan en dispositivos reales; pendientes de navegador/dispositivo se declaran sin ocultarlos.
- Fixture, actas y proyecciones se reconcilian después de fallo/reinicio.
- Tratamiento de C.I. y datos de menores revisado antes de usar información real.

## Demostración de salida

Simular torneo completo de 8–15 fechas con datos sintéticos, registrar equipos y orígenes externos, ordenar horarios, perder/reponer red durante partido, corregir acta, generar flyers 1v1/jornada/resultado, restaurar entorno aislado y repetir consulta pública/privada. Registrar métricas y decisión `piloto autorizado` o `corregir`.
