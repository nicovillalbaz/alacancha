# Copa Caacupé 2026 — formato de competencia

**Actualización técnica del 10/11/2026:** si la jerarquía elegida por el organizador no separa un empate exacto en A, B o la tabla general, este puede ordenar manualmente solo a los empatados desde Estadísticas. La decisión queda auditada, se invalida al cambiar reglamento, sorteo o actas relevantes y permite preparar los cruces posteriores. Esto no confirma la jerarquía deportiva de la FCFS. La Copa real sigue privada, sin clubes sorteados ni partidos oficiales.

**Estado:** especificación de la edición basada en `PRESENTACION_FIXTURE_2026_ok.docx`, `FIXTURE_2026.xlsx` y aclaraciones del propietario del 10/11/2026. La Copa y sus diez equipos existen como borrador local. Hay un plan privado de 35 cruces por posiciones; el sorteo de los diez clubes aún no está completo, no hay partidos oficiales creados ni reglamento publicado. El borrador ya usa **2 puntos por victoria, 1 por empate y 0 por derrota**. La jerarquía de desempates sigue sin confirmación. [Fuentes y nombres de equipos](fuentes-fcfs-2026.md).

## Secuencia deportiva

| Etapa | Participantes y partidos | Resultado |
|---|---|---|
| 1. Series A y B | Dos grupos de cinco. Cada club juega contra los otros cuatro de su serie y un interserial contra el club de igual posición de la otra serie: A1–B1 hasta A5–B5. Son 20 encuentros internos y 5 interseriales, **25 partidos únicos**. | El interserial suma puntos, goles y partido jugado a la tabla del grupo propio **de ambos equipos**. Se clasifican los cuatro primeros de cada grupo. También se calcula una tabla general única con los diez equipos y los 25 encuentros. |
| 2. Cuartos de final | Ocho clasificados, cuatro partidos únicos: MM1 1.º A–4.º B; MM2 1.º B–4.º A; MM3 2.º A–3.º B; MM4 2.º B–3.º A. | Cuatro ganadores. Si un partido empata, el DOCX indica tiempo suplementario y luego penales. Esta etapa **no** tiene semifinal ni final de llave. |
| 3. Cuadrangular final | Los cuatro ganadores se enfrentan todos contra todos a una rueda: **seis partidos** en tres fechas. | La tabla de estos seis partidos determina la clasificación final, salvo eventual partido extra decidido manualmente. |

### Orden para los cruces del cuadrangular

1. Cerrar las 25 actas de la primera etapa y calcular **una tabla general de los diez equipos de A y B juntos**. Los interseriales cuentan; cada partido aparece una sola vez como encuentro, y aporta resultado a ambos participantes.
2. Resolver los cuatro cuartos de final. Sus resultados sirven **solo para seleccionar a los cuatro participantes del cuadrangular**.
3. Filtrar la tabla general de la primera etapa a esos cuatro ganadores y asignarles 1.º, 2.º, 3.º y 4.º según el orden que ya tenían allí. **No** ordenarlos por marcador, diferencia de goles o llave de cuartos.
4. Generar los cruces: fecha 1, 1.º–4.º y 2.º–3.º; fecha 2, 1.º–3.º y 2.º–4.º; fecha 3, 1.º–2.º y 3.º–4.º. Son partidos del todos contra todos: el último día **no** constituye una final ni un partido independiente por tercer puesto.

Si la tabla general deja empatados a dos o más de los cuatro ganadores, el orden debe seguir la jerarquía de desempates que configure el organizador; esa jerarquía de la edición aún no se informó. La aplicación no debe inventar una siembra.

### Partido extra

El DOCX reserva el **22/12/2026** para un partido extra. Solo se contempla si, tras el cuadrangular, hay **empate en puntos por el título**. Incluso entonces, el organizador marca **manualmente Sí o No** para esta edición; la aplicación no genera el encuentro al detectar el empate. Si elige Sí, selecciona dos equipos empatados y programa el partido. El marcador o la tanda de penales del acta aprobada determina el campeón del extra. Si hay más de dos aspirantes empatados, el organizador debe determinar qué dos disputan el encuentro; el documento fuente no establece ese criterio. Si elige No, la aplicación conserva la tabla y la decisión sin proclamar campeón por suposición.

## Calendario de referencia

**Fecha deportiva ≠ jornada programada.** F1–F5 designan cinco fechas deportivas de la primera etapa, cada una con cinco partidos. J1–J9 designan los días de programación. El rótulo «F2», «F3», «F4» o «F5» al final de una secuencia en el DOCX indica que **ahí termina esa fecha deportiva**. Una jornada puede contener partidos de dos fechas; F3 incluso ocupa partes de J4 y J6, además de J5. El Excel contiene los mismos cruces, pero sus fechas 3 y 4 aparecen en orden inverso al de programación del DOCX. Para esta edición, el DOCX fija la secuencia calendarizada.

| Jornada | Día de 2026 | Fecha deportiva | Partidos previstos por posición |
|---|---|---|---|
| J1 | 17/11 | F1 | Dos partidos de F1 por sorteo; todavía no se sabe cuáles. |
| J2 | 19/11 | F1 | Los otros tres partidos de F1. |
| J3 | 24/11 | F2 | A3–A1, A4–A5, B3–B1. |
| J4 | 26/11 | F2 → F3 | Cierra F2: B4–B5, A2–B2. Abre F3: A1–A4. |
| J5 | 27/11 | F3 | A5–A2, B1–B4, B5–B2. |
| J6 | 01/12 | F3 → F4 | Cierra F3: A3–B3. Abre F4: A5–A1, A4–B4. |
| J7 | 03/12 | F4 | A2–A3, B5–B1, B2–B3. |
| J8 | 04/12 | F5 | A2–A4, A3–A5, B2–B4. |
| J9 | 10/12 | F5 | B3–B5, A1–B1. |
| J10 | 11/12 | Cuartos | MM1 y MM4. |
| J11 | 12/12 | Cuartos | MM2 y MM3. |
| J12 | 15/12 | Cuadrangular, fecha 1 | 1.º–4.º y 2.º–3.º. |
| J13 | 17/12 | Cuadrangular, fecha 2 | 1.º–3.º y 2.º–4.º. |
| J14 | 18/12 | Cuadrangular, fecha 3 | 1.º–2.º y 3.º–4.º. |
| J15, condicional | 22/12 | Partido extra | Solo por decisión manual ante empate por el título. |

F1 contiene A1–A2, A4–A3, B1–B2, B4–B3 y A5–B5. F2, F3, F4 y F5 quedan delimitadas por las filas anteriores; cada una suma cinco partidos. En el dato de cada encuentro deben persistir por separado **etapa, fecha deportiva y jornada programada**: agrupar el fixture por fecha no debe cambiar el día real de sus partidos, y mover un partido de jornada no debe alterar su fecha deportiva automáticamente.

**Cuenta verificable:** 25 + 4 + 6 = **35 partidos ordinarios**, en **14 jornadas**. Con partido extra serían **36 partidos en 15 jornadas**. El resumen del DOCX escribe «TOTAL 15» y «CON PARTIDO EXTRA 16», aunque numera las jornadas ordinarias hasta 14 y reserva la 15 para el extra. Conservar el documento como fuente; no trasladar esa discrepancia al contador de la aplicación.

La FCFS definirá horarios y sede de cada encuentro entre el Polideportivo Municipal y la Sede Social del Club Teniente Fariña. El 08/12 no se programa por feriado. Las jornadas pueden reprogramarse conservando su secuencia. El sorteo de posiciones sigue incompleto; **no asignar equipos por suposición ni publicar partidos oficiales a partir de esta tabla**.

## Estado de implementación

El plan privado persiste 25 cruces de grupos, cuatro cuartos y seis del cuadrangular, con **fecha deportiva y jornada separadas**. La vista de Fixture deja consultar ambas, asignar cada equipo a una posición con cambio visible en todos sus cruces y repartir los cinco partidos de F1 entre J1/J2 cuando se sortee la apertura. El reparto puede quedar pendiente aun cuando se publique el sorteo de clubes; si se modifica después, hay que actualizar la publicación para que lo vea el público. [Evidencia del plan](evidencias/t04-copa-caacupe-plan-posiciones-2026-11-10.md).

El motor local ya calcula ambas tablas de grupo con interserial, la general única, cuartos con penales, siembra de los **ganadores** según la general y tabla final del cuadrangular. Un organizador puede publicar el reglamento tras revisar puntos y desempates; con diez posiciones y J1/J2 definidos puede preparar los 25 partidos de grupos. Las actas aprobadas permiten preparar cuatro cuartos y luego seis partidos del cuadrangular, sin duplicados. Tras seis actas del cuadrangular, un empate en puntos habilita la decisión manual «Sin extra» o «Crear partido extra»; este último se prepara para J15 y admite programación o corrección mientras no esté iniciado ni publicado. Los resultados públicos se limitan a jornadas publicadas. La edición real sigue en borrador y conserva los clubes sin posición asignada. Los empates que agoten los criterios elegidos se ordenan manualmente, sin inventar participantes.

La **vista pública del plan** ya está publicada en la base local como instantánea separada del torneo oficial: muestra 35 cruces, Fechas/Jornadas, Grupos A/B, Cuartos, Cuadrangular y Tabla general sin inventar resultados. Los diez clubes aparecen con escudo, pero ninguno tiene todavía puesto asignado; todos figuran como pendientes en los cruces. Esta publicación no confirma el reglamento ni prepara partidos oficiales. Tras el sorteo presencial, el organizador asigna los puestos, resuelve J1/J2 y pulsa «Actualizar vista pública» para que se refleje en aficionados. La categoría de la edición es **Primera**.
