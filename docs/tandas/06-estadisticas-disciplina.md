# T06 — Clasificación, estadísticas, disciplina y multas

**Objetivo:** resultados oficiales producen tablas y estadísticas reconstruibles; sanciones/multas requieren decisión autorizada.

**Estado al 29/10/2026:** T06-01 a T06-06 cerrados en código local con datos, API, UI, pruebas y revisión de Chrome. La aceptación en teléfonos físicos y con usuarios reales se registra pendiente hasta ejecutarse. [Cierre técnico y evidencia](../evidencias/t06-cierre-codigo-local.md).

## Dependencias

T05: acta oficial, eventos y correcciones. T02: reglas versionadas. T03: elegibilidad temporal.

## Tickets en orden

1. **T06-01 Proyecciones.** Calcular partidos jugados, victorias, empates, derrotas, GF, GC, diferencia y puntos por grupo/fase desde partidos oficiales. Aplicar la jerarquía elegida por el dueño: puntos totales primero; luego criterios globales o mini tablas de **todos** los que aún tengan iguales puntos, recalculadas para cada subempate. Goles en contra y tarjetas ordenan ascendentemente; victorias y goles a favor, descendentemente. Un sorteo no resuelto requiere decisión documentada. El [motor puro T02](../evidencias/t02-desempates-y-criterios.md) alimenta la proyección pública. Ajustes administrativos con decisión inmutable y reversión por nuevo asiento. **Código local: hecho.**
2. **T06-02 Estadísticas.** Goleadores, tarjetas y participaciones desde actas válidas; separar autogol y tanda. Reconstrucción total idempotente y actualización puntual por rectificación mediante huella de aprobaciones. **Código local: hecho.**
3. **T06-03 Casos.** Propuestas por acumulación, roja, segunda amarilla o incidencia; expediente, evidencia, revisión, decisión, notificación interna, apelación y revocación. Apelar no suspende efecto automáticamente. La reconstrucción de propuestas es acción visible del organizador. **Código local: hecho.**
4. **T06-04 Elegibilidad/suspensión.** Vigencia por partidos/fechas desde decisión; servir suspensión en encuentros oficiales publicados sin el jugador, persistir historial por aprobación de acta y recalcular solo con decisión explícita. **Código local: hecho.**
5. **T06-05 Multas.** Catálogo versionado y resolución deportiva a equipo/persona autorizada, una sola vez por decisión/regla. Registrar importe si el reglamento lo usa, sin saldo, pago ni contabilidad. **Código local: hecho.**
6. **T06-06 UI/QA.** Tabla/ranking/cuadros públicos, panel disciplinario privado, resolución/PDF básico; pruebas de desempates, segunda amarilla, rectificación, sanción y acceso de admin de equipo. **Código local, pruebas automatizadas, Chrome a cuatro anchos, teclado/red inestable y PDF renderizado: hechos.** Aceptación física/humana: pendiente.

## Aceptación

- Acta 2–1 alimenta tabla y goleadores; cambiar autor de un gol mantiene 2–1 y mueve un gol al autor correcto una vez.
- Amarillas se acumulan solo en ámbito configurado; una apelación no levanta sanción vigente sin decisión.
- Multa confirmada se crea una vez; administrador de equipo ve solo casos/resoluciones de su equipo.
- Reconstrucción desde fuentes oficiales coincide con proyección almacenada.

## Demostración de salida

Jugar dos encuentros ficticios, aprobar actas, generar tabla, sancionar tarjeta, aplicar multa, apelar sin suspender automáticamente, rectificar gol y reconstruir. **Puerta:** proyecciones y elegibilidad consistentes.
