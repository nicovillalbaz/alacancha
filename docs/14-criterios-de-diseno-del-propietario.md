# Criterios de diseño del propietario

**Propósito:** guía práctica para diseñar, revisar y corregir pantallas de la aplicación. Resume las observaciones hechas sobre gym y sobre este proyecto hasta el 16/11/2026. No afirma que todas estén implementadas ni cambia reglas deportivas. Ante una contradicción, prevalece la decisión más reciente de [01-decisiones](01-decisiones.md). La [guía visual](10-guia-visual.md) conserva los detalles técnicos y evidencias.

## La experiencia que buscamos

La aplicación debe sentirse **sobria, deportiva, moderna, rápida y fácil de recorrer**, primero en teléfono. Un aficionado reconoce de inmediato equipos, resultado, estado y competición. Quien administra encuentra la acción que vino a hacer sin recorrer formularios, explicaciones ni pantallas intermedias innecesarias. El diseño ayuda a registrar y mostrar el torneo; no pretende arbitrar sus reglas ni obligar al usuario a justificar cada movimiento.

OneFootball, Sofascore, AiScore, Copa Fácil, TIMBO y elnine sirven como referencias para la **composición y representación de datos**: escudos, marcadores, tablas, fechas, estados, iconos y densidad. No se copian su marca, navegación exacta, funciones en vivo ni servicios ajenos a nuestro producto. Las correcciones concretas del propietario pesan más que cualquier referencia externa.

## Reglas que no se negocian al rediseñar

1. **Conservar el mapa de secciones vigente.** Mejorar la pantalla que existe sin reordenar todo el producto por iniciativa propia. Añadir subpestañas **dentro** de una sección cuando sus contenidos producen un scroll largo; no convertirlas en nuevas secciones principales. Un cambio de arquitectura de navegación necesita una decisión explícita.
2. **Un contexto por pantalla.** Primero se elige organización o torneo; equipos, pagos, fixture, partidos y estadísticas pertenecen a ese torneo. La ficha de equipo contiene sus propias personas, jugadores y pagos. No mezclar equipos de torneos distintos ni mostrar tareas ajenas al contexto.
3. **Un dato protagonista y una acción natural.** En Partido mandan escudos, marcador y eventos; en Fixture, Fecha/Jornada y cruces; en Estadísticas, tabla y puestos. El botón de flyer pertenece al dato exacto que se está viendo.
4. **Menos pasos.** No pedir de nuevo una elección que ya hizo la persona al abrir una Fecha, partido, grupo o tabla. Las opciones cortas se resuelven con botones visibles. Las opciones extensas se abren solo cuando se solicitan.
5. **Datos reales y estados honestos.** No mostrar números rotos, marcadores inventados, minutos supuestos ni una tabla antigua mientras carga la nueva. Un borrador se distingue de una publicación y un cargo por cobrar de dinero ingresado.

## Composición visual

- Fondo de lectura blanco o muy claro. Evitar el gris de página con muchas tarjetas flotantes, bordes gruesos y sombras repetidas. Una fila con divisor suele comunicar mejor que una card. Reservar una superficie oscura para un resultado o momento deportivo protagonista.
- Densidad útil: cabeceras compactas, poco espacio vertical vacío, filas legibles, alineación precisa. El espacio separa grupos reales de información; no rellena la pantalla. En escritorio, centrar el contenido a un ancho razonable en lugar de estirar cada fila o formulario.
- Un solo título por vista. Eliminar subtítulos que repiten el título, como «Mi cuenta / Tu identidad y accesos», párrafos de ayuda permanentes, conteos decorativos y metadatos técnicos. Un aviso aparece solo cuando ayuda a decidir o corregir algo.
- No presentar «4 Equipos», «41 Jugadores» o «4 de 6 Jornadas» como bloques grandes en el inicio. Mostrar las listas, el próximo encuentro o la tarea concreta.
- Iconos deportivos coherentes para gol, autogol, gol de penal, penal errado, tarjeta, cambio, clasificación, fecha y equipo. Deben ayudar a reconocer el dato; las acciones conservan nombre accesible y foco visible.
- Usar escudos auténticos cuando estén disponibles, sin deformarlos. Recortar afiches o fotografías para mostrar **solo el escudo sobre fondo blanco**. Si falta la imagen, usar iniciales claras. Los colores de equipo son acentos, no sustitutos del nombre ni del estado.
- Los nombres largos se recortan visualmente donde el espacio es estrecho, sin alterar el dato. La disposición debe soportar escudos, títulos de copa y equipos largos en móvil y en flyers.
- El diseño es deportivo sin volverse recargado: contraste, tipografía con jerarquía, formas medidas y color con propósito. No usar adornos que compitan con resultado, tabla o cruce.

## Navegación y acceso

- La raíz pública muestra organizaciones y torneos consultables con búsqueda. Si una organización tiene un solo torneo, el acceso puede abrirlo directamente. Los enlaces cortos de organización y torneo deben llegar al contenido sin pasos de selección redundantes.
- El público entra **sin cuenta**. El acceso administrativo vive en una ruta propia y en un enlace discreto del catálogo; no domina la portada ni aparece como invitación en la vista del aficionado.
- El selector de torneo es un control propio con filas y búsqueda, no el desplegable nativo del navegador. Su cabecera ocupa lo necesario. No crear un segundo scroll dentro de esa lista que deje un bloque blanco vacío.
- En el organizador, mantener las áreas principales actuales: **Equipos, Pagos, Fixture, Partidos y Estadísticas** bajo el torneo elegido. Navegación principal arriba; no volver a una barra inferior que mezcle «Inicio / Torneos / Partidos / Equipos / Cuenta» sin contexto.
- En el público, mantener las secciones deportivas actuales; el torneo se ve desde su cabecera y cada pestaña abre su contenido. El cuadro pertenece al recorrido de Partidos cuando corresponda. No trasladar Goleadores fuera de la estructura existente por experimentar con una nueva navegación.
- Una fila de pestañas puede desplazarse horizontalmente **dentro de sí**, sin ensanchar la página ni mostrar barra de scroll. Al tocar una pestaña parcialmente oculta, desplazar la fila hasta mostrarla completa. Con teclado, conservar selección, foco y relación con su panel.
- Partido y equipo públicos abren un detalle claro y completo. Allí se oculta la cabecera del torneo que ocuparía espacio; al cerrar, se recuperan pestaña, filtros y posición de la lista. El retorno debe llevar al padre inmediato, no al inicio genérico.
- En móvil se puede ocultar el indicador vertical del navegador en el portal público, pero nunca impedir el desplazamiento del contenido.

## Subpestañas: dónde y para qué

| Contexto | Separación esperada |
|---|---|
| Estadísticas del organizador | Clasificación, Goleadores, Valla y Cuadro cuando exista. Si el formato lo exige: Grupos A/B, General, Cuartos y Finales dentro del apartado adecuado. |
| Partido del organizador | Marcador como contexto; Eventos, Jugadores y Gestión sin poner todos los formularios uno debajo de otro. |
| Partido público | Marcador y eventos públicos por tiempo; no añadir pestaña de jugadores por ahora. |
| Equipo | Jugadores, personas/comisión y gestión en su contexto. Buena fe separa Jugadores y Publicación; los partidos citados se consultan en Equipo → Partidos. |
| Clasificación mixta | Liguilla y Eliminación en subpestañas distintas. Una copa solo eliminatoria no muestra tabla de liga. |

Mostrar solo el panel seleccionado. No repetir el nombre de la subpestaña como otro encabezado grande y no convertir cada subpestaña en un bloque de scroll interminable.

## Fixture, Fechas y Jornadas

- La organización debe poder crear Fechas y partidos a mano, o sortear una o dos ruedas con una acción que deje todas las Fechas y cruces listos, inicialmente sin horario. El sorteo no debe producir «rondas generadas» que obliguen luego a asignar manualmente cada ronda a una Fecha.
- **Fecha y Jornada son conceptos distintos.** Una Fecha puede jugarse en más de una Jornada; mostrar ambas agrupaciones cuando el torneo lo necesite. Las rondas eliminatorias se nombran Cuartos, Semifinales, Final, etc., y no «Fecha X» cuando la fase ya tiene nombre.
- Al programar el primer partido, ofrecer el mismo día/hora para todos, horarios consecutivos o programación independiente. Permitir editar y retirar datos donde el estado lo permita, con historial cuando la programación ya es pública.
- Una Fecha muestra sus encuentros ordenados, con escudos y resultado u hora en el eje central. En su encabezado están **Ver partidos, Editar y Flyer** según estado. Abrir la Fecha conduce a sus partidos; abrir un cruce o partido conduce al detalle correcto.
- «Libre», «Cancha 1», sede redundante y etiquetas internas no deben ocupar espacio cuando no agregan información. Lugar es el recinto; Cancha solo distingue superficies dentro de él.
- En cuadros, las llaves y cruces deben verse como una competición real, no como cajas planas sin jerarquía. Una serie de ida/vuelta muestra sus partidos y el criterio decisivo; nunca presenta puntos de serie como si fueran goles. Mostrar global, tanda o partido extra según lo que efectivamente decidió la llave.
- Para formatos por grupos, la primera etapa, cruces, tabla general y Finales tienen que poder leerse sin inventar clasificados. En la Copa Caacupé el rótulo público es **Finales**; el cuadrangular sigue siendo todos contra todos por puntos.

## Partido y carga de eventos

- El uso prioritario es **cargar después del partido**; no diseñar como si fuera una transmisión en vivo. El minuto queda vacío y opcional. Cuando aporta información, usar período PT/ST/TE con botones directos.
- Al pulsar Gol o Tarjeta, elegir uno de los **dos equipos mediante escudo/botón**, tiempo con botones visibles y jugador con toques rápidos. Después de guardar un evento, permanecer en la misma vista con selección y foco útiles para cargar el siguiente.
- Mostrar la lista de eventos con símbolos claros. Cada evento se puede abrir para editar o eliminar individualmente, con historial; no depender de «Deshacer último» como única vía de corrección.
- El organizador puede completar el resultado sin un recorrido de planillas o aprobaciones que bloquee una carga ordinaria. La planilla de partido se arma eligiendo jugadores con toques rápidos y guardando. Las comprobaciones deportivas que no corresponde hacer cumplir a la aplicación se presentan como avisos, no como jueces automáticos.
- El marcador y la vista pública colocan escudo y nombre de cada equipo en lados equilibrados, resultado central y eventos bajo el equipo correspondiente, agrupados por tiempo cuando exista. El detalle público no expone datos privados ni controles administrativos.

## Formularios, configuración y textos

- Ningún formulario avanzado debe venir abierto porque sí. «Agregar tarjeta», «Agregar jugador», «Editar», «Registrar», «Más opciones» y sus campos se abren al tocar la acción. No dar aspecto de gran formulario a un listado o ficha.
- Pedir únicamente los campos que la acción necesita. Documento, número de ficha, procedencia externa y otros datos de registro pueden ser opcionales según el flujo. No obligar a indicar arquero, capitán, cantidad de cambios o ventana de inscripción por costumbre; la app registra y avisa.
- No pedir motivo antes de que exista una corrección o decisión que lo requiera. En un alta ordinaria de comisión/cuerpo técnico basta añadir; no pedir vigencia por defecto. Las correcciones oficiales conservan historial y motivo cuando corresponde.
- La configuración deportiva y los importes internos se encuentran donde se usarán: tarjetas personalizadas desde el torneo, importes y multas en Pagos. Una multa es un ingreso **por cobrar** a favor de la federación, distinto del cobro efectivamente recibido.
- Publicar torneo, reglamento, jugadores o sorteo debe tener un estado y una acción comprensibles. No esconder la transición de borrador a público ni usar términos como «iniciar carga» que no explican la consecuencia.
- Los estados vacíos son breves y accionables cuando hay una acción posible. No llenarlos con explicación del reglamento, textos de desarrollo, identificadores, mensajes duplicados ni promesas de contenido inexistente.

## Tablas y estadísticas

- La clasificación se lee como tabla: puesto, escudo, equipo, PJ, diferencia o goles pertinentes y puntos, con números alineados. Si hay grupos, cada grupo conserva su tabla propia y un encabezado claro; no mezclar todas las filas en una sola lista continua.
- La tabla general y las etapas eliminatorias o finales se separan con pestañas o vistas propias. Una tabla sin partidos puede mostrar equipos y cero sin inventar un orden decidido por criterios aún no definidos.
- Goleadores muestra puesto, nombre autorizado, equipo y goles; Valla menos vencida muestra equipo, partidos y goles recibidos. Ambas consideran partidos oficiales de eliminación cuando el reglamento lo indica. Los penales de tanda no se cuentan como goles.
- El cuadro se puede recorrer en móvil sin comprimir nombres o ensanchar toda la página. Un cruce con partido publicado se abre al tocarlo.

## Flyers

- «Flyer» usa **el contexto exacto**: Fecha abierta → flyer de esa Fecha; partido abierto → previa o resultado; Clasificación/Goleadores/Valla/Cuadro → el apartado visible. No volver a preguntar el contenido ya elegido.
- La configuración de diseño y logos vive aparte del botón de generar. Una vez configurado, pulsar Flyer genera el archivo y muestra resultado, descarga o error claro.
- Incluir escudos reales de los equipos y logos configurados de Copa/federación sin deformarlos. Diseño futbolero y tipografía con carácter, pero marcador, goleadores y lectura siguen siendo lo primero. Reducir líneas y texto del pie; mantener la firma pública vigente.
- Jornada completa: escudos de todos los encuentros. Resultado: goleadores y eventos bajo el equipo correspondiente, PT/ST/TE si se conoce, sin metadatos triviales como «Cancha 1». Si hubo tanda, mostrar **Penales X:Y** separado del marcador del juego.
- Goleadores se exporta como **tabla colectiva**, paginada si hace falta; no un archivo por cada jugador. Clasificación por grupos: un grupo por página o elección explícita del grupo, nunca una lista mezclada.
- Los círculos de fondo de los logos pueden ser amplios, pero el escudo interior conserva proporción equilibrada. En plantilla oscura, círculos, palabras secundarias y formas que antes se veían grises pasan a blanco con la opacidad necesaria para no competir con el dato.

## Velocidad y estados de carga

- Una navegación habitual debe sentirse inmediata. Evitar pantallas en blanco, «Cargando…» que parpadea por cada pestaña y recargas repetidas de escudos o partidos al volver. Precargar o reutilizar lecturas recientes cuando sea seguro y revalidar al publicar o corregir datos.
- Una optimización no puede mostrar por un instante información de otra Fecha, tabla anterior o partido equivocado. Durante la actualización, usar un estado pendiente discreto y consistente. Si falla la red, permitir reintento y conservar lo que la persona estaba haciendo.
- Los datos del sorteo publicados deben aparecer en el público y en el organizador sin depender de refrescar manualmente, con el tiempo real entendido como actualización en pocos segundos cuando hay conexión, no como promesa absoluta.

## Revisión antes de aceptar una pantalla

1. Revisar a **320 y 390 px** primero; después 768 y 1280 px. La página no debe desbordar horizontalmente. Probar texto largo, zoom/texto al 200 %, teclado virtual y safe area.
2. Recorrer con toque y teclado: pestañas, selector, volver, abrir detalle, guardar y repetir acción. Foco, estado elegido y nombre accesible visibles.
3. Comprobar estados vacío, cargando, error, sin permiso, desconexión y conflicto. Ninguno debe mostrar datos viejos como si fueran actuales ni bloquear sin explicar una salida.
4. Contar pasos de tareas comunes: elegir torneo, buscar equipo, abrir Fecha, completar partido, registrar gol/tarjeta y generar flyer. Cada toque extra debe tener un motivo concreto.
5. Mirar la pantalla como aficionado y como organizador: ¿se reconoce el dato principal de un vistazo?, ¿hay texto repetido, card decorativa, formulario abierto sin pedirlo o espacio vacío inútil?, ¿se sabe dónde seguir y cómo volver?
6. Registrar por separado comprobación técnica, revisión estética del propietario y prueba física en Android/iPhone. Una captura o emulador no sustituye la aceptación en dispositivo real.

## Prioridad frente a documentos anteriores

Este documento reúne criterios, no sustituye [01-decisiones](01-decisiones.md). Las propuestas tempranas de navegación inferior, cards para tablas móviles, ventanas de cambio, formularios preventivos, selector nativo público o títulos explicativos que aún puedan aparecer en [10-guia-visual](10-guia-visual.md) son antecedentes. Aplicar las correcciones posteriores recogidas aquí y en las decisiones fechadas antes de repetir un patrón en otra pantalla.
