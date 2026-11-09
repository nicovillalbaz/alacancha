# T02-03 — Desempates, tarjetas y walkover · 28/10/2026

**Estado:** incremento local verificado. T02 sigue en desarrollo; clasificación visible y actas oficiales aún pendientes.

## Datos, API y permisos

- El administrador de torneo define una jerarquía ordenada de criterios por categoría. Los puntos totales se comparan primero; después puede elegir y ordenar victorias, diferencia de goles, goles a favor y en contra, amarillas y rojas de toda la fase, o puntos, victorias, diferencia y goles a favor/en contra solo entre los equipos aún empatados. Menos goles en contra o tarjetas favorecen al equipo. El sorteo documentado, si se selecciona, debe quedar último.
- En empate múltiple, el motor puro de `packages/shared/src/standings.ts` arma una mini tabla con los partidos oficiales de todos los equipos aún igualados. Si un criterio separa algunos equipos, el siguiente se calcula para el subconjunto que sigue empatado. Los partidos provisionales quedan fuera; una igualdad residual se devuelve como no resuelta, sin asignar un orden deportivo oculto.
- El reglamento también define tarjetas habilitadas, segunda amarilla, umbral de aviso por acumulación, revisión de roja y marcador/puntos adjudicados por walkover. El aviso no sanciona solo. El resultado adjudicado se mantendrá separado del jugado al implementar actas.
- No hubo migración: `rule_versions.rules` ya es JSONB. El campo nuevo `advanced` es `null` para borradores antiguos y se exige explícitamente al publicar; las versiones oficiales anteriores conservan su JSON. Solo el organizador activo de la organización edita/publica; prueba permitida y denegaciones de otro equipo/organización.

## UI móvil y errores

Tarjetas y walkover usan botones visibles. Los criterios están agrupados en «entre empatados», «todos los partidos» y «resolución manual»; la lista ordenada se mueve con botones de 44 × 44 px. El editor advierte si el marcador adjudicado no favorece al ganador. Al ocultar walkover conserva sus valores durante la edición de esa categoría. Estados sin definir y sin walkover son explícitos.

## Verificación

- `npm test`: **35/35**. Incluye reglas antiguas, combinaciones inválidas, permisos cruzados, v1/v2, triple empate con mini tabla, subempate recalculado, prioridad configurable, amarillas y sorteo pendiente.
- `npm run build`: TypeScript de servidor y Vue más compilación Vite correctos.
- `npm run restore:check`: destino nuevo `torneos_restore_20261028_8a49c3b0`, **28 archivos**, filas y checksums iguales a la fuente sintética, 2.275 ms; base original intacta.
- Navegador local: selección de criterios entre sí, cambio de prioridad, walkover 3–0, aviso al invertirlo. [Opciones en móvil](t02-desempates-opciones-movil.jpg) · [jerarquía en móvil](t02-desempates-movil.jpg). [Matriz 320/390/768/1280 px](t02-desempates-layout.json): un H1, cero `select`, sin desbordamiento ni botones visibles menores de 44 px de ancho o alto.

## Pendiente

T04 debe aportar partidos y fases; T05, acta oficial y resultado jugado/adjudicado; T06, tabla visible, proyección y resolución documentada de sorteo. T02 aún necesita fase inicial, uso de sedes/patrocinadores y reglas disciplinarias restantes. Faltan zoom/texto al 200 %, teclado virtual, red inestable, lector de pantalla, teléfonos físicos y aceptación estética.
