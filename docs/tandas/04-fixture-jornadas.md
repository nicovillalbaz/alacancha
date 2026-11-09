# T04 — Fixture, horarios, canchas y jornadas

**Objetivo:** programar partidos en fases/jornadas, ordenar encuentros por horarios y canchas, detectar conflictos y publicar fixture/cuadros sin duplicados.

**Estado al 29/10/2026:** liga, grupos y cuadro eliminatorio, jornadas compartidas, agenda, conflictos, reprogramación, publicación y portal están en código local. El plan de copa se versiona; la progresión usa actas y tabla oficial, y los sorteos posteriores quedan auditados. Los mejores restantes empatados entre grupos pueden ordenarse con motivo y huella vigente si el reglamento admite decisión manual. La agenda usa catálogo privado de árbitros por organización. Una rectificación reasigna cruces posteriores sin planilla ni acta, incluso programados o publicados, después de comprobar conflictos de agenda; la Fecha pública recibe una nueva versión. Los cruces con planilla o acta se detienen para revisión humana. [Primer incremento](../evidencias/t04-cruces-liga.md) · [agenda](../evidencias/t04-agenda-publicacion.md) · [plan](../evidencias/t04-plan-copa.md) · [progresión y árbitros](../evidencias/t03-t04-cierre-local-2026-10-29.md). Quedan abiertas la aceptación visual/física/humana y la resolución operativa de cruces ya iniciados.

**Incremento del 06/11/2026:** cada ronda de ida/vuelta admite global, puntos con penales o puntos con tercer partido; el último se crea al avanzar cuando las dos actas dejan igualdad. Tres copas sintéticas terminadas prueban el recorrido de principio a campeón. [Acta y datos](../evidencias/t04-copas-terminadas-2026-11-06.md). La aceptación física y humana sigue pendiente.

**Navegación de rondas del 06/11/2026:** Fixture y Partidos muestran el nombre deportivo de una jornada eliminatoria, con Ida/Vuelta/Desempate si corresponde. El cuadro público enlaza cada partido publicado de su llave y mantiene inertes los cruces futuros. [Evidencia](../evidencias/t04-navegacion-rondas-2026-11-06.md).

## Dependencias

T02: edición/categoría/equipos/reglas; T01: transacción, auditoría y permisos. V02 se resolvió con jornadas por edición, compartidas entre categorías y días. El avance del cuadro depende de actas T05 y clasificación T06.

## Tickets en orden

1. **T04-01 Competición.** Fases liga/grupo/eliminatoria, grupo y participante; round robin pares/impares, descanso e ida/vuelta; cruces revisables y programación manual.
2. **T04-02 Agenda móvil.** Jornadas compartibles entre categorías; partidos con local/visitante, sede, cancha, fecha, hora y duración. Lista cronológica con reordenamiento accesible por controles de hora/posición; detectar solapes de equipo/cancha/árbitro y descanso insuficiente.
3. **T04-03 Reprogramación.** Cambiar horario/sede con motivo e historial; conservar `round_id` y no crear nueva jornada.
4. **T04-04 Cuadros.** Llaves eliminatorias, ganador pendiente, ida/vuelta y clasificación desde fase previa; no inventar rival cuando aún no se conoce.
5. **T04-05 Publicación.** Comando transaccional e idempotente: permiso, versión, estado, primera publicación, outbox y auditoría. Reintento/concurrencia devuelve la misma publicación, sin duplicar partidos/avisos.
6. **T04-06 Portal y QA.** Fixture público, calendario/cuadro, tests de pares/impares, conflictos, agrupación multicategoría, orden por horario y publicación concurrente.
7. **T04-07 Plan completo de copa.** Al crear/editar categoría: liga, grupos o copa directa; plazas por posición, mejores restantes, tamaño del cuadro, descansos y sorteo/posiciones más ida/vuelta en cada ronda. Previsualizar octavos, cuartos, semis y final sin inventar clasificados. Ejecutar sorteo inicial de copa directa una vez; la progresión desde resultados oficiales se conecta en T05/T06.

## Aceptación

- Diez jornadas pueden publicarse con horarios distintos; reprogramar conserva `round_id` y deja rastro.
- Una jornada agrupa tres categorías y varios días naturales sin duplicar partidos; torneo distinto tiene su propia Fecha 1.
- Round robin impar genera descansos y no repite cruces indebidamente.
- Admin de equipo no publica ni cambia jornada sin permiso del organizador; el resumen de cambios se muestra antes de confirmar.

## Demostración de salida

Generar torneo impar, ordenar partidos por hora/cancha en móvil, revisar conflictos, publicar Fecha 1 multicategoría, enviar dos publicaciones simultáneas y reprogramar uno. **Puerta:** fixture/cuadros correctos, publicación única y horario legible.

**Evidencia local:** la integración ejecutó Fecha 1 con dos categorías y tres partidos, conflictos, publicación concurrente, reprogramación y cuadro público tras publicar cruces iniciales. También se probó avance de liga y copa desde actas sintéticas, con ámbito de organización. El navegador verificó agenda, programación y vacío público en un incremento anterior. Falta el recorrido visual nuevo y la demostración completa en teléfono físico.
