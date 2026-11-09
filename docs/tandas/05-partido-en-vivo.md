# T05 — Completar resultados, goles, tarjetas y actas

**Objetivo:** el operador o administrador de torneo autorizado carga resultado, goles y tarjetas después del partido desde teléfono con pocos toques. La captura en vivo queda como recorrido secundario. El público ve provisional y una autoridad confirma el resultado oficial.

**Estado al 29/10/2026:** T05-01 a T05-07 implementados y verificados en código local: asignaciones, captura posterior, eventos, acta versionada, conformidad, resultado provisional/oficial, rectificación, SSE y cola IndexedDB. [Cierre técnico, pruebas y límites](../evidencias/t05-cierre-codigo-local.md). La aceptación en teléfonos físicos y por usuarios reales sigue pendiente; T06 calcula las tablas y estadísticas públicas desde las actas aprobadas.

## Dependencias

T03: planillas/elegibilidad; T04: partido y jornada publicada. Sin esas fuentes la pantalla sería solo un prototipo.

## Tickets en orden

1. **T05-01 Datos/estados.** Asignaciones de operador/revisor, log append-only con `client_event_id` y secuencia, acta, conformidades, resultado oficial, historial y outbox. Congelar planillas al inicio. **Hecho en código local.** No se impone reloj para carga posterior.
2. **T05-02 Pantalla móvil.** Prioridad a “Completar partido”: equipos como botones con escudo/nombre y PT/ST/TE como botones visibles según reglamento, sin desplegables. Una vez elegido contexto, tocar jugador agrega gol/tarjeta y mantiene la carga abierta con equipo/período, posición y foco conservados; alternar tipo de evento dentro de la misma vista. Confirmación visible, deshacer y protección de doble toque; conteos por jugador. Marcador y estados de conexión explícitos, sin minuto actual inventado.
3. **T05-03 Eventos.** Gol normal, penal, autogol, amarilla, segunda amarilla, roja, cambio e incidencia; reglas de sustitución, `period_id` opcional y minuto opcional inicialmente vacío. Conservar desconocido como `null`; nunca convertirlo en cero. Reintentos idempotentes.
4. **T05-04 Completar después.** Mismo modelo sin reloj obligatorio; elegir primer tiempo, segundo tiempo o tiempo extra según el reglamento sin cargar minuto, o dejar el momento sin especificar. Minuto manual en una opción secundaria; capturar marcador retrospectivo, desglose opcional controlado por regla, advertencia si faltan autores.
5. **T05-05 Revisión/corrección.** Finalizar, resumen, enviar acta, aprobar, bloqueo, rectificación con motivo/evento vinculado y reconstrucción de proyecciones. Deshacer antes de aprobación también auditado.
6. **T05-06 Difusión/offline.** SSE/WebSocket propio de hechos persistidos; cola IndexedDB limitada a partido asignado, estados local/servidor/fallo y conciliación de conflictos. No cachear documentos sensibles.
7. **T05-07 QA.** Doble clic, red intermitente, dos capturistas, permisos, autogol/penales, acta y rectificación verificados en local. **Prueba real con planillero en móvil: pendiente de aceptación física.**

## Aceptación

- Gol ordinario y tarjeta se registran con pocos toques y marcador/estado correctos; reenvío no duplica.
- Autogol beneficia equipo correcto; tanda no aumenta marcador ordinario ni goleadores.
- Público ve “Provisional” hasta aprobación; una corrección oficial conserva motivo y dato anterior.
- Operador no edita otro partido; cola con permiso revocado no se sincroniza silenciosamente.
- Registrar gol y tarjeta por tiempo sin minuto; acta y público muestran el período y omiten el minuto desconocido. Un evento sin período ni minuto no inventa un momento; un `0` escrito expresamente se distingue de vacío.
- Cargar varios goles de un equipo, tarjetas de ambos y corregir el último registro sin salir de la vista; equipos por escudo/nombre y tiempos visibles PT/ST/TE. Doblar un toque accidental no duplica; un nuevo registro deliberado sí se admite. Los reintentos de red además requieren idempotencia en servidor, no solo protección visual.

## Demostración de salida

Con planillas aprobadas congeladas, operar un partido con corte de API, cargar eventos posteriores, enviar y aprobar acta, rectificar un resultado y comprobar el portal. El recorrido sintético y sus límites constan en el [cierre técnico](../evidencias/t05-cierre-codigo-local.md). **Puerta de código local:** integridad y auditabilidad del evento oficial; **puerta física:** pendiente. El cambio de goleador en tabla estadística se verifica en T06.
