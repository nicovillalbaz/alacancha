# 10. Guía visual y sistema de diseño provisional

**Estado al 28/10/2026:** planificación visual, no identidad comercial aprobada. La revisión del proyecto gym incluye su guía inicial, las observaciones posteriores del propietario y dos capturas existentes. La prioridad aquí es que **todo el producto** funcione primero en teléfono: superadmin, organizador, administrador de equipo, planillero y aficionado.

Primera exploración disponible: [prototipo navegable](../prototipos/01-direccion-visual/README.md) y [revisión local](evidencias/t01-prototipo-visual.md). Esta entrega permite evaluar la dirección; todavía no hay aprobación estética del propietario ni prueba física.

Implementación vigente de T01: [web funcional y revisión móvil](evidencias/t01-base-funcional.md). Se extiende la rapidez al acceso, administradores, organizaciones, actividad y configuración. Las vistas deportivas se mantienen en su prototipo, con procedencia y jornadas directas y altas consecutivas de borradores.

## Observaciones del gym que rigen este diseño

La [guía del gym](../../gym/docs/11-plan-visual.md) conserva propuestas que el usuario corrigió después. Para esta adaptación se leyeron [T15](../../gym/docs/tandas/15-redisenio-mobile-first.md), [T16](../../gym/docs/tandas/16-ficha-alumno-y-experiencia.md), [T17](../../gym/docs/tandas/17-antropometria-y-densidad-visual.md), las decisiones [017](../../gym/docs/decisiones/017-redisenio-y-autoria-coach.md) y [018](../../gym/docs/decisiones/018-ficha-y-catalogo.md), el [barrido del 26/10](../../gym/docs/evidencias/ux-code-audit-2026-10-26.md) y la [revisión final de ilustraciones](../../gym/docs/evidencias/secuencia-ejercicios-2026-10-26.md). Se inspeccionaron las capturas existentes de [alimentación móvil](../../gym/docs/evidencias/ux-final-coach-alimentacion-390.png) y [rutinas en escritorio](../../gym/docs/evidencias/ux-final-coach-rutinas-1366.png). Son referencias de problemas y soluciones; la aceptación estética del gym seguía pendiente.

| Observación del propietario en gym | Regla para torneos |
|---|---|
| Formularios, tarjetas y títulos sobredimensionados; demasiado espacio vacío | Densidad funcional: título de trabajo compacto, filas breves y espacio según agrupación. Acceso centrado en el formulario; resumen de equipo con próxima tarea visible. |
| Ventanas grandes y editor de tres columnas con desplazamientos internos | Altas, edición y revisión en páginas con retorno. Un desplazamiento principal; fixture y planilla por pasos cuando haga falta. |
| Campos y botones desalineados | Altura común de 44–48 px. En móvil, filtros y acción se apilan si no caben; se alinean por control, no por etiqueta. |
| Funciones escondidas en «Más» y regreso que pierde contexto | Destinos con nombre explícito; detalle de equipo/partido como centro de sus tareas. Volver recupera padre inmediato, filtros, posición y borrador. |
| Títulos repetidos, mensajes de relleno y metadatos técnicos visibles | Un encabezado principal. Mostrar dato, estado y acción; revisiones internas y UUID fuera de tarjetas de uso diario. El acta/exportación conserva la trazabilidad pertinente. |
| Selector que ocupa varios controles aunque la persona ya está elegida | Mostrar equipo/jugador elegido y «Cambiar»; abrir búsqueda solo cuando sea necesaria. |
| Símbolos genéricos o imágenes que no distinguen el contenido | Una familia de iconos coherente y símbolos distintos por función; escudos e imágenes fieles al equipo/partido con procedencia conocida. Plantillas de flyer legibles con nombres largos. |
| Compilar y evitar desbordamientos no resolvía las objeciones visuales | Prototipo revisable antes de repetir el patrón y revisión visual en cada tanda. Registrar por separado comprobación técnica, revisión del propietario y prueba física. |

Estas reglas sustituyen las escalas grandes y la navegación «Más» propuestas anteriormente en este proyecto. Los colores y el branding propios de gym no se trasladan como identidad de torneos. La animación de sus ejercicios tuvo varias revisiones; no se deduce de ellas una prohibición general ni un requisito de animar esta app.

## Principios

1. El dato y la siguiente acción ganan a la decoración. En carga de resultados deben leerse equipo, marcador, tiempo conocido, evento y estado de guardado de un vistazo; en administración deben verse torneo, equipo, tarea pendiente y estado de acceso.
2. El tema claro es la base para exterior; un tema oscuro puede añadirse tras validar contraste y uso real. El color de cada torneo no reemplaza colores semánticos de error, guardado, sanción o provisionalidad.
3. Una acción principal visible por contexto. El registro de gol/tarjeta evita formularios largos y muestra deshacer inmediato con auditoría.
4. La plataforma mantiene estructura y componentes; la organización/torneo configura nombre, logo, escudo, portada y acentos dentro de límites de contraste.
5. Todo estado importante combina texto, forma/icono y color: `Oficial`, `Provisional`, `Pendiente local`, `Sincronizado`, `Inhabilitado`.
6. Observación del propietario del 28/10: evitar tarjetas o franjas de totales decorativos de equipos, jugadores y jornadas. Priorizar próximos encuentros y tareas. Un conteo contextual dentro de su lista puede acompañar el trabajo, sin convertirse en un bloque de cifras del inicio.
7. Aplicar rapidez a toda pantalla: pocas opciones como botones visibles; listas grandes con búsqueda; conservar borrador/filtros al ir y volver; evitar confirmaciones repetidas para guardar borradores. Habilitar/bloquear, publicar o corregir una decisión oficial sí requiere revisión explícita de alcance y consecuencia. No eliminar controles de seguridad para ahorrar un toque.
8. En Pagos, separar con etiquetas cortas el dinero ingresado, el pagado y las multas de la federación aún por cobrar. Registrar abre solo al tocar; las tarifas abren desde Configuración; las filas usan divisores, sin cards. No mostrar una multa pendiente como efectivo recibido ni duplicar el ingreso al cobrarla.

## Tokens iniciales propuestos

Estos colores son **neutros provisionales** para prototipos privados, no la marca final. Los pares propuestos dan aproximadamente 14,77:1 (`ink` sobre `page`), 6,27:1 (`muted` sobre blanco) y 7,81:1 (`action` con blanco); volver a medir cada combinación real, incluidos estados y colores de organizador.

| Token | Valor propuesto | Uso |
|---|---|---|
| `--page` | `#F5F7F6` | Fondo general claro. |
| `--surface` | `#FFFFFF` | Tarjetas, formularios, hoja de evento. |
| `--ink` | `#10252B` | Texto principal, marcador. |
| `--muted` | `#52636A` | Texto secundario; medir contraste. |
| `--line` | `#D7E0DE` | Separadores y campos. |
| `--action` | `#165D46` | Acción primaria con texto blanco, sujeto a medición. |
| `--action-soft` | `#E4F2EB` | Selección/foco no crítico. |
| `--warning` | `#8B5700` | Aviso y pendiente, con etiqueta textual. |
| `--danger` | `#A82C31` | Error/roja, sin depender solo del color. |
| `--focus` | `#165DAD` | Anillo de foco visible. |

Definir variantes para hover/focus/disabled y para marca configurable. Si un color elegido por el organizador falla contraste, ofrecer alternativa accesible en la vista previa y conservar semántica fija. No incorporar fuentes desde CDN; usar fuente de sistema o archivo local con licencia. Logos dentro de caja con `object-fit: contain` y respaldo de iniciales.

## Tipografía, espacio y controles

- Cuerpo móvil de 14–16 px/20–24; usar 16 px en captura en cancha y texto de lectura. Etiqueta 13–14 px/18–20; título de página 22–24 px y sección 18–20 px. Marcador 36–48 px por su función deportiva. Inputs de al menos 16 px para evitar zoom involuntario en iOS.
- Escala de espacio de 4, 8, 12, 16, 24, 32 y 48 px. Margen exterior móvil 12–16 px, escritorio 24–40 px.
- Objetivos táctiles de al menos 44 × 44 CSS px; botones de evento con etiqueta e icono. Foco de teclado visible, controles accesibles sin arrastrar.
- Reducir movimiento cuando `prefers-reduced-motion`; nunca animar el marcador de modo que oculte si el gol se guardó.
- Usar componentes: `AppShell`, `ContextSwitcher`, `PageHeader`, `AccessStatus`, `ScheduleSlot`, `Scoreboard`, `EventAction`, `PlayerPicker`, `RosterCounter`, `OriginPicker`, `StatusBadge`, `SyncState`, `Card`, `FormField`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton`, `DataList`. Formularios y revisiones usan páginas; los selectores rápidos se resuelven dentro del flujo, sin ventanas extensas ni barras que tapen campos.

## Reflujo

| Ancho CSS | Estructura esperada |
|---|---|
| 320–359 | Una columna, marcador compacto, acciones en cuadrícula 2×2, CTA sin tapar, sin scroll horizontal. |
| 360–599 | Una columna cómoda, navegación corta inferior con destinos explícitos, selector de jugadores dentro del flujo. |
| 600–899 | Dos zonas si el contenido cabe: lista y detalle/acta. |
| 900–1199 | Sidebar y contenido principal; panel lateral opcional. |
| ≥1200 | Sidebar + contenido centrado + contexto lateral solo cuando ayuda. |

El shell usa media queries; cards y paneles internos pueden usar container queries. La CTA inferior respeta `safe-area-inset-bottom` y teclado virtual. Una tabla densa se transforma en tarjetas en móvil, manteniendo filtros y acciones.

En escritorio, formularios con ancho de lectura aproximado de 560–720 px y listas con ancho según sus datos; aumentar contexto útil antes que estirar campos o crear paneles vacíos. La navegación inferior móvil ofrece hasta cinco destinos; otras tareas se alcanzan mediante accesos con nombre en la ficha de equipo, torneo o partido. No reducir texto ni esconder funciones bajo «Más» para hacerlas caber.

## Composición por rol

**Planillero, teléfono:** arriba jornada/partido y estado; marcador grande; fila de acciones `Gol`, `Amarilla`, `Roja`, `Cambio`; selector de equipo/jugador; eventos recientes; estado de sincronización persistente; “Revisar acta” separado de “Finalizar”. La selección de jugador prioriza convocados en cancha, luego banco, dorsal y búsqueda. Evitar que la barra fija tape el último evento o el teclado.

El flujo prioritario es cargar resultados después del partido. Al abrir gol o tarjeta, mostrar ambos equipos como botones con escudo y nombre; tiempo como tres botones `PT`, `ST`, `TE`, con nombre completo y estado pulsado accesible. Evitar desplegables para esas opciones. Tocar un jugador agrega el evento y mantiene la vista abierta con equipo/tiempo, posición y foco conservados. Se puede cambiar Gol/Amarilla/Roja dentro de la misma vista. Confirmación visible junto a la lista y deshacer accesible; proteger el doble toque accidental sin impedir registros deliberados posteriores. Las filas muestran nombre/dorsal y conteos deportivos del jugador para comprobar lo cargado.

Minuto vacío y opcional bajo «Agregar minuto»; no precargar un valor ni copiarlo al siguiente evento. Los períodos serán configurables al implementar. En eventos usar `PT`, `ST`, `TE` con nombre accesible completo; el acta muestra el nombre completo. No colocar un minuto fijo en el marcador ni presentar la carga posterior como una transmisión en vivo. El control en vivo queda en segundo plano en esta fase.

**Administrador de equipo, teléfono:** “Mi equipo” muestra comisión, buena fe, cuerpo técnico, próximos partidos y sanciones. Alta de jugador por pasos: identidad privada → equipo de origen interno/externo → documentos si aplica. La lista oculta C.I. completa, muestra ficha/estado y permite buscar. La planilla exhibe contadores de titulares, suplentes y no convocados; inhabilitados explican motivo.

**Organizador, teléfono primero:** inicio con próximos partidos/tareas; equipos y administradores; fixture por jornada como lista cronológica editable con hora, cancha y conflicto visible; partido/acta; flyers. En escritorio la misma información se distribuye en columnas, sin añadir funciones exclusivas.

**Superadmin, teléfono:** lista de administradores con estado activo/suspendido/bloqueado y alcance; abrir detalle antes de cambiar acceso, confirmar con motivo. **Público, teléfono:** fecha próxima, fixture, cuadros, resultado, tabla y goleadores; provisional/oficial explícito, sin datos privados.

## Pantallas prioritarias y entregas

Antes de repetir los componentes de T01, preparar un prototipo revisable de acceso y control de acceso, y explorar las composiciones de ficha de equipo, alta de jugador, fixture y control de partido a 320/390 px y escritorio. Estas exploraciones usan datos sintéticos y no adelantan funcionalidad de otras tandas. Registrar las correcciones del propietario en esta guía antes de extender el patrón. El trabajo visual forma parte de las nueve tandas; no se añade una tanda de rediseño al final.

| Tanda | Pantallas a diseñar y verificar |
|---|---|
| 01 | Acceso, invitación, habilitar/bloquear administrador, selector de organización y shell móvil. |
| 02 | Asistente de torneo/reglamento, equipos/admins de equipo, comisión y portal inicial. |
| 03 | Alta de jugador, origen interno/externo, buena fe, revisión y planilla móvil. |
| 04 | Fixture, orden por horario/cancha, conflictos, jornada y publicación. |
| 05 | **Completar resultado, goles y tarjetas**, carga continua, acta, sincronización y corrección; captura en vivo secundaria. |
| 06 | Tabla, estadísticas, expediente/sanción y estados de elegibilidad. |
| 07 | Bandeja de revisión, comisión, multa deportiva y exportaciones privadas. |
| 08 | Selector/preview/exportación de flyer y portal público completo. |
| 09 | Auditoría visual completa con usuarios y teléfonos reales. |

## Puerta visual por pantalla

**Corrección del 30/10/2026:** el propietario rechaza fondos grises, muchas cards y texto explicativo permanente. Usar fondo claro, filas con divisor y un único contexto de torneo; la navegación primaria va arriba. Mostrar edición, motivos, restricciones y opciones avanzadas solo después de pedir la acción. En un formulario corto, agrupar campos relacionados sin añadir otra tarjeta. Esta decisión reemplaza las recomendaciones de cards y navegación inferior que permanecen más arriba como antecedente.

**Recorrido vigente del organizador:** el selector superior establece el torneo; debajo aparecen Equipos, Multas, Fixture, Partidos y Estadísticas. Cada destino muestra listas compactas y acciones en su propio contexto. Las exportaciones se abren desde la fecha, partido o tabla correspondiente. No repetir un título con una frase que lo explique ni llenar un vacío con metadatos. Los iconos acompañan etiquetas breves. A 320 px las cinco áreas deben seguir visibles sin desplazamiento horizontal. Los estados sin fuente publicable ocultan la acción de flyer.

**Identidad de resultados y estadísticas — 04/11/2026:** usar blanco como lienzo de lectura y verde profundo `#102d29` solo para el resultado protagonista. Marcador grande y centrado con escudos reales cuando existan; nombre del equipo bajo cada escudo, goles bajo el lado correspondiente y PT/ST/TE sin minuto inventado. En listados, resultado u hora ocupa el eje central, con equipos equilibrados y un divisor entre encuentros. Fixture presenta cada Fecha con encabezado firme, acciones Flyer/Editar en ese mismo encabezado y horarios alineados. Tablas sin tarjetas: columnas compactas `Equipo · PJ · DG · PTS`, cifras tabulares, posición visible y color del equipo discreto. Goleadores usan puesto, nombre y cantidad como jerarquía principal. Evitar fondos grises, textos duplicados y bloques flotantes. Las referencias visuales estudiadas fueron [OneFootball: tablas y posiciones](https://onefootballsupport.zendesk.com/hc/en-us/articles/39365557084689-Learn-everything-about-the-new-Competition-Tables-Interface), [Sofascore: espacio por competición](https://www.sofascore.com/news/torneo-2-0-is-live-the-web-app-has-been-rebuilt-around-the-competition) y [AiScore: partidos, grupos y goleadores](https://m.aiscore.com/world-cup); se adaptó su jerarquía de datos sin añadir funciones de seguimiento en vivo.

**Subpestañas vigentes — 04/11/2026:** conservar selector, secciones y recorrido existentes; agregar pestañas únicamente dentro de secciones que ya agrupan contenidos, como Estadísticas y el detalle de Partido. Mostrar solo el panel elegido y conservar el marcador como contexto del partido. Las pestañas se accionan con toque o teclado (flechas, Inicio y Fin), declaran selección y panel asociado, y tienen foco visible. Si superan el ancho móvil, la fila permite desplazamiento horizontal dentro de sí misma sin ensanchar la página; nunca ocultar la última pestaña tras un menú impreciso. Clasificación, Goleadores, Valla y Cuadro tienen su flyer en el panel exacto. Público y organizador usan el mismo lenguaje de filas, escudos, puestos, cifras alineadas e iconos para gol, autogol, tarjetas y cambios. Los iconos siempre acompañan texto accesible. El lector público no ve nombres privados en eventos ni en la planilla del partido.

**Ajuste específico del fan — 04/11/2026:** la nueva decisión del propietario en `01-decisiones.md` sustituye la estructura pública descrita arriba. En el fan, el selector ocupa la cabecera y las cinco pestañas principales son Partidos, Clasificación, Goleadores, Valla menos vencida y Equipos; el Cuadro se abre dentro de Partidos. El partido se presenta a pantalla completa sin pestaña de jugadores. El equipo abre una lista deportiva de jugadores con nombre publicado, goles y tarjetas. Escudos, cifras y estados se reconocen antes que las etiquetas; fondos claros en listados y un único bloque oscuro para el marcador. Evitar encabezados de reglamento, cards y repeticiones de contexto. Las columnas del cuadro deben poder recorrerse en móvil sin comprimir los cruces ni ensanchar la página completa.

**Selector público — 06/11/2026:** la cabecera usa un botón de torneo que abre filas propias debajo, no un `select` del navegador. Enlace de torneo y organizador resuelven directamente su vista pública. Las pestañas pueden deslizarse horizontalmente pero su barra de desplazamiento no se dibuja; el panel activo conserva subrayado y foco visible. El acceso administrativo no figura en la interfaz del fan.

**Desplazamiento del fan — 06/11/2026:** en ancho móvil el indicador vertical del navegador se oculta solo para el portal público; el contenido debe seguir desplazándose. La pestaña elegida se centra cuando estaba cortada y sigue siendo accesible con teclado. Partido y equipo son vistas de detalle sin la cabecera del torneo; cerrar restaura la lista en su posición previa.

Comprobar **primero 320 y 390 px**, luego 768 y 1280 px; 200 % de texto y zoom de escritorio cuando corresponda; texto/escudo largo; vacío, carga, error, denegado, offline y conflicto; contraste medido; teclado, foco y lector de pantalla básico; safe area; sin scroll horizontal. Revisar también altura de tarjetas, espacios sin propósito, título único, alineación campo/acción, navegación directa y retorno contextual. Probar marcas claras y oscuras. Observar administradores de torneo/equipo y planilleros reales en dispositivo, contar acciones/tiempo y corregir fricciones antes de cerrar. Un emulador no acredita aceptación física ni aprobación estética del propietario.

**Implementación T02 al 28/10/2026:** asistente de torneo/categoría, editor de reglas, equipos, participación y portal inicial en la web local. La [matriz de 24 combinaciones](evidencias/t02-layout.json) cubre seis pantallas a 320/390/768/1280 px sin desbordamiento horizontal, controles visibles menores de 44 px ni desplegables para opciones cortas. Se conservaron [capturas móviles de categorías](evidencias/t02-categorias-movil.jpg), [reglamento](evidencias/t02-reglamento-movil.jpg), [equipo](evidencias/t02-equipo-movil.jpg) y [portal](evidencias/t02-portal-publico-movil.jpg). Zoom/texto al 200 %, teclado virtual, red inestable, lector de pantalla, uso físico y aceptación estética siguen pendientes. [Acta T02](evidencias/t02-torneos-y-equipos.md).

**Ajuste posterior de T02-03:** [captura del cálculo a 390 px](evidencias/t02-reglas-cupos-movil.jpg) y [aviso de inconsistencia](evidencias/t02-reglas-error-movil.jpg). El total de jugadores se lee junto a cancha y banca, sin un tercer campo editable; el cupo técnico queda separado. Revisado a 320/390/768/1280 px sin desbordamiento ni controles visibles menores de 44 px. [Acta de cupos](evidencias/t02-cupos-reglamento.md).

**Cambios T02-03:** tres modos como botones visibles, campos de cupos solo cuando aplican y dos botones para reingreso. La tercera opción ocupa el ancho completo en móvil. [Estado limitado](evidencias/t02-cambios-limitados-movil.jpg) y [aviso de ventanas incompatibles](evidencias/t02-cambios-error-movil.jpg). Cuatro anchos 320/390/768/1280 px sin desbordamiento, desplegables ni controles visibles bajo 44 px; aceptación humana y física pendiente. [Acta de cambios](evidencias/t02-cambios-reingreso.md).

**Edad y documentos T02-03:** restricciones y referencias de fecha mediante botones visibles; etiquetas de documentos como opciones rápidas y campo para agregar otra. El editor conserva límites y fecha al alternar opciones, y advierte duplicados junto al campo. [Edad móvil](evidencias/t02-elegibilidad-edad-movil.jpg) · [Documentos móvil](evidencias/t02-elegibilidad-documentos-movil.jpg) · [Matriz de cuatro anchos](evidencias/t02-elegibilidad-layout.json). Sin desbordamiento horizontal, `select` ni botones visibles menores de 44 px. Teclado virtual, red inestable, zoom/texto al 200 %, lector de pantalla, teléfonos físicos y aceptación estética aún pendientes. [Acta](evidencias/t02-elegibilidad.md).

**Jerarquía deportiva T02-03:** criterios visibles agrupados en globales y entre empatados; la lista ordenada usa dos botones de 44 × 44 px por criterio, sin arrastrar ni desplegable. [Opciones a 390 px](evidencias/t02-desempates-opciones-movil.jpg) · [Orden a 390 px](evidencias/t02-desempates-movil.jpg) · [Matriz de cuatro anchos](evidencias/t02-desempates-layout.json). Sin desbordamiento ni controles visibles menores de 44 px de ancho o alto; aceptación física y de uso pendiente. [Acta](evidencias/t02-desempates-y-criterios.md).

**Cierre técnico local T02:** fase inicial y rondas usan botones visibles; grupos pide un número directamente. Antes de publicar aparece una previa legible del reglamento. Sedes y patrocinadores se gestionan en el contexto del torneo; revocar un administrador se hace en el equipo con motivo. [Fase a 390 px](evidencias/t02-fase-inicial-movil.png) · [previa a 390 px](evidencias/t02-previa-publicacion-movil.png) · [revocación a 390 px](evidencias/t02-admin-revocado-movil.png) · [matriz 320–1280 px](evidencias/t02-cierre-layout.json). Las 12 combinaciones verificadas no tienen desbordamiento horizontal ni controles visibles menores de 44 px. Teclado virtual, red inestable, zoom/texto al 200 %, lector de pantalla, teléfono físico y aceptación estética siguen pendientes. [Acta](evidencias/t02-cierre-codigo-local.md).

**Borrador T03:** lista privada con búsqueda y cédula enmascarada; alta en dos páginas cortas de identidad y procedencia. Tipo de origen/documento como botones, guardar y agregar otro sin copiar identidad. [Lista](evidencias/t03-buena-fe-borrador-movil.jpg) · [identidad](evidencias/t03-alta-identidad-movil.jpg) · [procedencia](evidencias/t03-alta-origen-movil.jpg) · [matriz 320–1280 px](evidencias/t03-borrador-layout.json). Aceptación física, teclado virtual, red inestable, zoom/texto al 200 % y lector de pantalla pendientes. [Acta](evidencias/t03-borrador-jugadores.md).

**Revisión T03:** la presentación y el estado de cada versión están en la misma vista de la lista, con acciones directas del organizador y motivo visible. [Captura móvil](evidencias/t03-buena-fe-revision-movil.jpg) · [matriz 320–1280 px](evidencias/t03-revision-layout.json). Sin desbordamiento ni controles visibles menores de 44 px; faltan pruebas físicas, de teclado virtual, red inestable, zoom/texto al 200 % y lector de pantalla. [Acta](evidencias/t03-revision-buena-fe.md).
