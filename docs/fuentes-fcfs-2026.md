# Fuentes iniciales — fútbol de salón 2026

**Estado 10/11/2026:** fuentes aportadas por el propietario y conservadas localmente. La Copa Caacupé, su organizador y diez equipos están en borrador. Se publicó una instantánea del plan por posiciones para aficionados; no se crearon partidos oficiales.

La [especificación de la Copa Caacupé 2026](copa-caacupe-2026-formato.md) reúne el formato y la secuencia que deberá implementar la aplicación. Este archivo conserva el inventario y el detalle de las fuentes.

## Competencias y responsables

| Competencia | Organizador de los datos | Participantes | Entrada pública prevista |
|---|---|---|---|
| Copa Caacupé — Cooperativa Serrana 2026 | Federación Caacupeña de Fútbol de Salón | Clubes del afiche | Lista de torneos del portal federativo → copa |
| Copa local de Altos | Federación local, nombre formal pendiente | Clubes por confirmar | Lista de torneos → copa |
| Copa local de San Bernardino | Federación local, nombre formal pendiente | Clubes por confirmar | Lista de torneos → copa |
| Eliminatorias entre federaciones | FPFS; nombre y edición exactos pendientes | Selecciones de federaciones, incluida Caacupé si corresponde a la edición | Lista de torneos → eliminatorias |

La Federación Caacupeña puede aparecer como organizadora de su copa y como equipo/selección en las eliminatorias. Son dos contextos deportivos distintos. Ningún club de la copa ni resultado local se traslada automáticamente a la eliminatoria. La lista pública común es una agrupación de navegación, no una cesión de permisos administrativos a la FPFS.

En móvil, la entrada pública se plantea como un encabezado breve con el emblema FPFS, búsqueda y dos rótulos de agrupación: **Clubes** y **Federaciones**. Cada torneo ocupa una fila con su emblema, nombre corto y acceso directo. Copa Caacupé lleva el emblema de la copa; las eliminatorias usan identidad FPFS y sus selecciones muestran sus propios escudos dentro del torneo. Evitar bloques de descripción, tarjetas flotantes y otro paso de navegación. Esta composición es propuesta visual, aún no implementada.

## Archivos disponibles

| Archivo | Uso previsto | Límite |
|---|---|---|
| FPFS.pdf | Identidad de la FPFS en la entrada federativa y eliminatorias | El PDF no es todavía un recurso web optimizado. |
| FCFS.pdf | Identidad de la Federación Caacupeña | No reemplaza el emblema propio de la copa. |
| COPA CAACUPÉ - COOPERATIVA SERRANA 2026.pdf | Emblema de la competición, edición 2026 | La mención a Cooperativa Serrana forma parte de la pieza recibida; confirmar cómo mostrarla en la interfaz. |
| EQUIPOS PARTICIPANTES.jpg.jpeg | Fuente visual de diez escudos de la copa | Es un afiche compuesto, no diez archivos de escudos separados. Los nombres se completaron con la captura escrita del propietario. |
| PRESENTACION_FIXTURE_2026_ok.docx | Programación oficial por posiciones A1–A5 y B1–B5, etapas, fechas y sedes posibles | No asigna clubes a posiciones, horarios ni sede por partido. El propietario aclaró aparte la condición del partido extra. |
| FIXTURE_2026.xlsx | Matriz de cinco rondas originales por serie con posición «INTERSERIAL» | Son fórmulas que referencian posiciones, no clubes; no equivale por sí sola a las nueve jornadas fechadas del DOCX. |

Los seis originales permanecen en `img/FCFS/` del equipo local y no se suben al repositorio público. El formato implementado y los diez escudos recortados sí forman parte del código versionado.

## Equipos en el afiche de Copa Caacupé

Orden de lectura: fila superior de izquierda a derecha y luego fila inferior. Los nombres de uso provienen de la segunda captura aportada por el propietario. Los nombres completos de Teniente Fariña y AJBL provienen de sus aclaraciones posteriores.

| Posición | Lectura del escudo | Estado del nombre |
|---|---|---|
| 1 | Mc Cavi | Nombre escrito en la captura; escudo rojo. |
| 2 | 8 de Diciembre | Nombre escrito; el escudo agrega «Club». |
| 3 | Juan Pablo II | Nombre escrito; sigla JP II en el escudo. |
| 4 | Barrio Nuevo | Nombre escrito; el escudo agrega «Sport». |
| 5 | Mercury | Nombre escrito; el escudo agrega «FC». |
| 6 | Cosmos 04 | Nombre escrito; el escudo agrega «Futsal». |
| 7 | Ytororo | Nombre escrito sin tilde en la captura. |
| 8 | Club Teniente Fariña | Aclaración del propietario; la captura abrevia «Tte. Fariña». |
| 9 | Asociación de Jóvenes del Barrio Loma (AJBL) | Aclaración del propietario; la captura usa «AJBL». |
| 10 | Sporting Cruzado | Nombre escrito. |

Los diez nombres están identificados y cargados; se pueden corregir desde la ficha del equipo. Los diez escudos fueron recortados del afiche original en `img/FCFS/escudos/` y cargados en los equipos de la base local. La fuente es pequeña; sustituir un recorte por el escudo oficial cuando se disponga de él. El afiche no aporta listas de jugadores, reglamento, calendario, resultados ni administradores. No completar esos campos con supuestos.

## Formato comunicado por el propietario

- **Primera etapa:** todos contra todos en dos grupos de cinco, a una rueda, más cinco interseriales: A1–B1, A2–B2, A3–B3, A4–B4 y A5–B5. El Excel trata «INTERSERIAL» como sexta posición de cada serie; cada cruce real se cuenta una sola vez, para **25 partidos** en total. **Cada interserial suma puntos, goles y demás estadísticas a la tabla del grupo propio de cada equipo**, sin duplicar el partido. El sorteo completo de posiciones aún no está definido.
- **Segunda etapa:** pasan los cuatro primeros de cada serie (ocho equipos). El mata-mata tiene **solo cuartos de final**, a partido único: MM1 1.º A–4.º B; MM2 1.º B–4.º A; MM3 2.º A–3.º B; MM4 2.º B–3.º A. El DOCX indica suplementario y luego penales ante empate. Los cuatro ganadores van a la etapa final.
- **Tercera etapa:** los cuatro ganadores de cuartos juegan un **cuadrangular todos contra todos a una rueda**, seis partidos. Primero se calcula una **tabla general única de la primera etapa con los diez equipos de las series A y B**, incluidos los interseriales. Se toman solo los cuatro ganadores de cuartos y se les asigna puesto 1.º–4.º **según su orden en esa tabla general**, sin usar el resultado de cuartos para ordenarlos. Con esos puestos se fijan las tres fechas: 1.º–4.º y 2.º–3.º; luego 1.º–3.º y 2.º–4.º; finalmente 1.º–2.º y 3.º–4.º. El 1.º–2.º y 3.º–4.º de la última fecha **son encuentros de liga**, no una final y un partido por tercer puesto independientes. La clasificación final se resuelve por los resultados del cuadrangular; falta jerarquía de desempates. **Solo si existe empate por el título**, el organizador decide **manualmente en esta edición** si habrá partido extra. La aplicación debe mostrar la decisión Sí/No y nunca crearlo por sí sola; si se elige Sí, habrá que indicar los equipos del desempate y programarlo. El DOCX reserva para ello el 22/12, sin establecer automáticamente que vaya a jugarse.

El DOCX marca **F1–F5 como fechas deportivas**, cada una de cinco partidos; «F2», «F3», «F4» y «F5» aparecen después del último partido de la fecha correspondiente. Las **jornadas 1–9 son días de programación**, no sinónimos de fecha. Una jornada puede contener el cierre de una fecha y el comienzo de otra. El Excel contiene los mismos cinco conjuntos de cruces, pero muestra sus fechas 3 y 4 en el orden inverso al calendario DOCX; para la programación de esta edición prevalece el orden F1–F5 del DOCX:

| Fecha deportiva del DOCX | Serie A | Serie B | Interserial | Jornadas programadas |
|---|---|---|---|---|
| F1 | A1–A2; A4–A3 | B1–B2; B4–B3 | A5–B5 | J1 y J2 |
| F2 | A3–A1; A4–A5 | B3–B1; B4–B5 | A2–B2 | J3 y comienzo de J4 |
| F3 | A1–A4; A5–A2 | B1–B4; B5–B2 | A3–B3 | Final de J4, J5 y comienzo de J6 |
| F4 | A5–A1; A2–A3 | B5–B1; B2–B3 | A4–B4 | Final de J6 y J7 |
| F5 | A2–A4; A3–A5 | B2–B4; B3–B5 | A1–B1 | J8 y J9 |

El DOCX programa la primera etapa en nueve jornadas: **17, 19, 24, 26 y 27/11; 01, 03, 04 y 10/12/2026**. Los cuartos van el **11 y 12/12**; el cuadrangular, el **15, 17 y 18/12**. La inauguración reparte los cinco partidos de la primera ronda original en dos y tres encuentros mediante sorteo; no se sabe cuáles jugarán cada día. Hay sedes posibles (Polideportivo Municipal y Sede Social del Club Teniente Fariña), pero no sede ni horario asignados a cada partido. El documento señala no programar el 08/12 y permite reprogramar jornadas conservando su secuencia.

**Inconsistencia de resumen del DOCX:** 9 + 2 + 3 = 14 jornadas ordinarias y 25 + 4 + 6 = 35 partidos. Su tabla escribe «TOTAL 15» y «CON PARTIDO EXTRA 16»; las jornadas numeradas llegan hasta 14 y el extra figura como 15. No usar 15/16 como total confirmado sin aclarar esa cuenta. Conservar por partido su **fecha deportiva F1–F5** y su **jornada programada J1–J9** como datos separados; no inferir una relación uno a uno.

El organizador puede asignar posiciones conforme avance el sorteo presencial y publicar su resultado al completar las diez. No crear partidos oficiales ni resultados todavía. El reglamento persistido conserva `initialPhase: null` y `competitionPlan: null` deliberadamente: el motor actual soporta grupos seguidos de una llave hasta una final, pero no el interserial y la progresión cuartos → cuadrangular. Los otros campos del reglamento borrador son valores técnicos provisionales, no reglas oficiales de la Copa. La publicación deportiva queda bloqueada hasta implementar ese motor.

## Incremento de carga real

1. Confirmar responsables de los otros torneos y las reglas aún pendientes de esta Copa: jerarquía de desempates del cuadrangular, qué hacer si más de dos equipos empatan por el título y discrepancia del total de jornadas. Registrar por separado clubes y selecciones federativas.
2. Sustituir los recortes del afiche por escudos oficiales cuando estén disponibles; verificar legibilidad en 320 px y permisos de uso.
3. La organización, cuenta `usuariofcfs`, Copa y diez equipos ya se cargaron localmente como borradores. El resultado del sorteo de posiciones puede publicarse al completar las diez; publicar reglamento, partidos oficiales y estadísticas solo después de implementar y revisar el formato real.
4. Implementar la lista federativa común como lectura pública de torneos de organizaciones distintas. El servidor debe continuar validando escritura por organización y recurso; probar un acceso permitido y uno denegado entre federaciones.
5. Inventariar las filas sintéticas existentes. Antes de retirar datos de muestra, respaldar la base y medios, restaurarlos en un entorno aislado y registrar el resultado. Borrar únicamente los registros identificados como sintéticos. Conservar los scripts de demo para pruebas separadas; no ejecutarlos contra la base de trabajo real.

**Verificación pendiente:** API pública de agrupación, estados vacío/error, navegación y búsqueda a 320/390 px, teclado, red inestable y teléfono físico. Ninguna de estas verificaciones se declara realizada en este documento.
