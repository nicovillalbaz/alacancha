# 06. Reglas deportivas y planilla

Este documento especifica invariantes del motor, no impone normas federativas. El organizador define y publica un reglamento por categoría/edición. F5, F7, F11 y futsal son **presets editables**. Cada partido conserva versión/snapshot del reglamento aplicable. La [lista de buena fe y procedencia](13-lista-buena-fe-y-procedencia.md) tiene su propio diseño.

## Configuración mínima por categoría

| Grupo | Parámetros |
|---|---|
| Plantel | `players_on_field` (incluye arquero), `minimum_to_start`, `minimum_to_continue`, `max_registered_players` opcional. |
| Planilla | `max_match_roster = players_on_field + max_bench_players` (calculado), `max_bench_staff` independiente, arquero/capitán requeridos, plazo y bloqueo. |
| Cambios | Modo sin cambios/limitado/ilimitado; máximo de cambios y ventanas opcionales cuando corresponda, reingreso. Modalidad volante por definir. |
| Tiempo | Períodos y nombres configurables, duración, reloj ascendente/regresivo/manual opcional, tiempo extra y tanda. |
| Resultado | Puntos por victoria/empate/derrota, desempates, walkover y decisiones administrativas. |
| Disciplina | Amarillas, segunda amarilla, rojas, sanciones, acumulación, reinicio, multas y apelaciones. |
| Elegibilidad | Edad/fecha de corte, ventana de inscripción, documentos, préstamos, suspensiones y excepciones. |

## Validación de planilla

La **lista de buena fe** es nómina de la edición/categoría; la **planilla** es selección para un partido. La inscripción aprobada y el origen declarado son conceptos distintos: un equipo externo no participa en el torneo por aparecer como procedencia. Los no convocados siguen en la lista general. Una multa pertenece a una decisión disciplinaria; este plan no registra pagos.

Sea `N` cancha, `B` banca de jugadores, `R=N+B` máximo de jugadores en planilla, `T` cupo técnico, `C` técnicos seleccionados, `G` plantilla general máxima o nulo, `S` titulares, `U` suplentes y `L` inscriptos elegibles para el encuentro:

```text
0 <= S <= N
0 <= U <= B
R = N + B
S + U <= R
S + U <= L
L <= G, cuando G existe
0 <= C <= T; C no consume R
S >= minimum_to_start para inicio normal
```

El arquero ocupa uno de los `N` puestos, no uno adicional. Un jugador solo puede tener un rol en la planilla. Los no convocados siguen visibles en la nómina general. En F7 ilustrativo `N=7, B=8, R=15, G=30`; no convertir esos números en regla universal. Si se exige arquero, al menos un titular debe estar marcado. El sistema explica el límite al bloquear una selección. El cupo técnico limita personas de cuerpo técnico **en la planilla del partido**, no la cantidad de personas que un equipo puede proponer en su ficha. Las versiones antiguas sin ese campo se leen con cupo conservador `0`; para habilitarlo se publica una versión nueva sin reescribir el snapshot anterior.

**Cambios configurables en T02:** `none` exige máximo `0`, sin ventanas ni reingreso; `limited` exige de 1 a 100 cambios y admite de 1 a 20 ventanas, sin superar el número de cambios; `unlimited` no guarda máximo de cambios y puede limitar ventanas. El reingreso es una elección explícita en los dos últimos modos. Ninguna etiqueta F5/F11 impone estos valores. Un borrador puede quedar sin modalidad, pero publicarlo requiere definirla. Las reglas publicadas antes de esta extensión se leen con modalidad sin definir y conservan el JSON original. El registro y descuento efectivos de cambios corresponderán a T05, con el reglamento versionado aplicable a ese partido.

**Fase inicial en T02:** el organizador elige liga, grupos o eliminación, y una rueda o ida y vuelta para la categoría. Grupos exige entre 2 y 32 grupos, con un mínimo de dos equipos por grupo compatible con el límite de participantes si se configuró. Un borrador puede dejarla sin decidir; la publicación la exige. Las versiones antiguas conservan el JSON original y se leen con fase sin definir. Fixture, asignación de grupos y cruces pertenecen a T04. La pantalla de revisión resume la fase y el resto de reglas antes de confirmar la publicación.

**Camino al título en T04-07:** el plan opcional y versionado conecta la fase inicial con un cuadro de eliminación. Una liga elige cuántos puestos clasifican; grupos eligen cuántos por grupo y cuántos mejores restantes; copa directa fija participantes previstos. El cuadro tiene 2 a 256 plazas en potencia de dos, con descansos solo si hay más participantes que la mitad de las plazas. Cada ronda decide cruces por posiciones o sorteo, y partido único o ida/vuelta. Una copa directa sin clasificación previa comienza por sorteo real auditado; no se fija la ronda siguiente cuando exige nuevo sorteo. Los puestos y mejores restantes usarán las tablas y desempates oficiales de T06, alimentados por actas T05. La vista prevista nunca se presenta como clasificación ya calculada.

**Edad y documentos configurables en T02:** el organizador decide expresamente entre ninguna restricción y una edad con límite inferior, superior o ambos. La referencia es la fecha del partido o una fecha de corte fija válida. El mínimo no puede superar al máximo; publicar una restricción de edad exige al menos un límite y, si corresponde, la fecha fija. Hasta doce etiquetas de documentos requeridos, únicas sin distinguir mayúsculas, se guardan en el reglamento; allí no se guardan archivos ni cédulas. Las versiones antiguas sin esta decisión se leen como sin definir y no se reescriben. La comprobación de años cumplidos, documentos y excepciones al inscribir jugadores pertenece a T03 y aún no está implementada.

**Desempates, tarjetas y walkover configurables en T02:** los puntos totales siempre ordenan primero. El dueño del torneo elige la jerarquía posterior por categoría: puntos, victorias, diferencia, goles a favor o goles en contra **entre los equipos aún empatados**; o victorias, diferencia, goles a favor, goles en contra, amarillas y rojas de **todos los partidos de la fase**. Menos goles en contra y menos tarjetas son mejores. Para un empate de tres o más, cada criterio «entre sí» arma una mini tabla con los partidos oficiales de todos los integrantes actuales del empate; si separa un subgrupo, el siguiente criterio se recalcula sobre ese subgrupo. Los encuentros provisionales no cuentan. El sorteo documentado, si se elige, queda último y no se resuelve automáticamente. [Motor y pruebas T02](evidencias/t02-desempates-y-criterios.md); la tabla visible alimentada por actas oficiales pertenece a T06.

Las amarillas y rojas se habilitan por reglamento; la segunda amarilla puede equivaler a roja y la acumulación genera aviso para revisión, sin crear suspensión automática. El walkover puede adjudicar marcador y puntos propios; su marcador se mantendrá separado del resultado jugado cuando exista el acta T05. No sumar goles de adjudicación a goleadores sin una regla explícita. Versiones anteriores sin estos criterios se leen como sin definir y conservan su JSON.

## Elegibilidad temporal

Evaluar contra fecha/instancia del partido y versión de reglas: inscripción aprobada, equipo/categoría correctos, préstamo vigente, edad/documentos necesarios, sanciones vigentes y ventana aplicable. Una transferencia no borra inscripción histórica ni limpia automáticamente una suspensión. La apelación tampoco levanta una sanción por sí sola. Una excepción requiere autoridad, motivo, vigencia y rastro; no usar `force=true` silencioso.

## Partido y acta

Estados principales: `scheduled → lineups_pending → ready → live` o `post_match_entry → pending_review → official`; suspender, abandonar, anular, adjudicar y corregir son transiciones explícitas. El operador solo actúa en partidos asignados. Las planillas aprobadas se congelan al inicio; cambios posteriores son eventos autorizados.

Eventos iniciales: gol, penal convertido, autogol, amarilla, segunda amarilla/roja según reglamento, roja directa, sustitución, periodo/reloj e incidencia. Un gol ordinario suma al equipo beneficiado y al goleador correspondiente; autogol suma solo al beneficiado, no a la tabla de goleadores del autor. Una tanda de penales decide un empate pero no aumenta marcador reglamentario ni ranking de goles. Gol anulado queda fuera de proyecciones.

La captura en vivo y “completar partido” escriben sobre el mismo modelo. Se puede registrar marcador sin autores solo si el reglamento lo permite; la interfaz indica desglose incompleto y nunca inventa goleadores. El público ve estado **provisional** hasta aprobación del acta. Rectificar exige permiso especial, motivo y reconstrucción de proyecciones; conserva el registro anterior.

**Momento del evento, decisión del 28/10/2026:** permitir registro por tiempo (primer tiempo, segundo tiempo, tiempo extra en el ejemplo), sin exigir minuto. Guardar período y minuto por separado; ambos pueden ser desconocidos. El campo de minuto empieza vacío y se conserva como `null` si no se informó, nunca como `0`. El cero es válido solo si se introduce expresamente. El orden de captura conserva su secuencia aun sin minuto. En carga posterior no mostrar un minuto actual ni deducir un cronómetro del último evento. En vivo, un minuto solo puede provenir de un reloj realmente controlado o de una entrada explícita. Las opciones/duraciones dependen del reglamento versionado, sin imponer dos tiempos ni tiempo extra a todas las modalidades.

La carga posterior es prioritaria. La carga continua conserva equipo y período para eventos sucesivos, pero limpia el minuto manual tras cada alta para no atribuírselo a eventos distintos. En T05-01a la interfaz filtra un doble toque idéntico dentro de 650 ms y la API guarda una identidad de solicitud por evento: los reintentos con esa identidad no duplican el diario. Deshacer agrega una corrección motivada sin eliminar el evento anterior. El acta oficial y las proyecciones deportivas aún no se construyen desde este diario privado. Una segunda amarilla no se convierte automáticamente en roja sin aplicar el reglamento correspondiente.

## Pruebas mínimas del motor

- F7 7+8 de 30 y futsal 5+9/14 configurados de manera independiente; bloquear 8.º titular, 9.º suplente o jugador duplicado.
- Suspensión/préstamo evaluados en fecha del partido, incluidos vencimiento y apelación.
- Futsal con cambios ilimitados no consume cupo inexistente; F11 respeta límites propios si se configuran.
- Autogol, tanda, walkover y gol anulado producen marcador y estadísticas correctas.
- Corrección oficial conserva evento original y recompone tabla/goleadores exactamente una vez.
- Gol/tarjeta por período sin minuto se conserva y muestra sin `0′`, `null′` ni minuto inventado; registro sin período ni minuto también es admisible. Elegir otro equipo no borra el momento ya cargado.

Referencia de detalle: especificación maestra §§5–11 y pruebas §20.
