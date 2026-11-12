# T08 — Flyers, PDFs y portal público completo

**Avance real al 29/10/2026:** T08-01 a T08-04 implementados en código local; T08-05 tiene 63 pruebas, build y revisión móvil, pero espera revalidación visual del aviso de red corregido y aceptación física/humana. Ver [evidencia](../evidencias/t08-flyers-portal.md). T09 no iniciado.

**Incremento del 06/11/2026:** tres torneos sintéticos terminados permiten revisar el portal con grupos, copa directa y liguilla más eliminación. El cuadro público muestra marcador global, tanda o tercer partido según la decisión, además de ida, vuelta y ganador; nunca exhibe puntos como marcador. En liguilla más eliminación, Clasificación alterna la tabla y el cuadro. Goleadores y Valla, incluido su flyer, suman partidos oficiales de eliminación. [Datos y verificación](../evidencias/t04-copas-terminadas-2026-11-06.md). La revisión en teléfono físico sigue pendiente.

**Navegación del cuadro del 06/11/2026:** los partidos de eliminación muestran la ronda en lugar de «Fecha N». Tocar la llave abre su encuentro publicado más reciente; Ida, Vuelta y Desempate ofrecen acceso propio cuando están publicados. [Evidencia](../evidencias/t04-navegacion-rondas-2026-11-06.md).

**Corrección del flyer de resultado del 06/11/2026:** cuando el acta oficial incluye tanda, el flyer conserva el resultado del partido y muestra por separado «Penales local : visitante». La tanda no se cuenta como gol. [Evidencia](../evidencias/t08-penales-flyer-2026-11-06.md).

**Diseño y generación contextual del 10/11/2026:** los botones de Flyer de Fixture, partido y estadísticas crean directamente el archivo de la fuente tocada usando los ajustes guardados del torneo. La configuración separada admite tres logos, colores, plantilla, tamaño y formato; se recuperan emblema del torneo y logo del organizador como valores iniciales. El archivo generado queda privado hasta publicación expresa. La plantilla v2 incorpora una composición más deportiva; los archivos de versiones anteriores no se alteran. El flyer de Clasificación por grupos apunta a la página del grupo concreto en el formato de esta Copa (cinco por grupo). [Prueba y límites](../evidencias/t04-t08-etapas-flyers-caacupe-2026-11-10.md).

**Objetivo:** difundir datos deportivos reales mediante plantillas e imágenes locales de 1v1, fecha y resultado con goleadores, y portal público móvil sin exponer información privada.

## Dependencias

T04: fixture/jornadas; T05–T06: resultados/estadísticas oficiales; T01: media/worker y seguridad. Los flyers previos pueden empezar con datos programados, pero la salida completa requiere fuentes oficiales.

## Tickets en orden

1. **T08-01 Plantillas.** Diseños e imágenes locales versionados para **1v1**, jornada completa, resultado con goleadores, tabla, cuadros, semifinal/final/campeón y comunicado. Campos ligados a DB más texto opcional revisable.

   **Decisión posterior (04/11/2026):** Goleadores exporta la tabla colectiva por categoría, con páginas si es necesario. No se crean flyers por cada jugador. Escudos o iniciales acompañan a cada equipo y el pie se limita al sello solicitado.
2. **T08-02 Render.** Worker propio HTML/SVG → PNG/JPG/PDF, formatos 1080×1080, 1080×1350, 1080×1920 e impresión. Escape de texto, validación de logos/fotos y límites de archivo.
3. **T08-03 Snapshot.** Guardar plantilla/versión, insumos y archivo generado. Reprogramar/corregir ofrece regenerar; no alterar ni borrar silenciosamente flyer anterior.
4. **T08-04 Portal.** Torneo/categorías, fixture por fecha/hora, cuadros, resultados provisional/oficial, tabla, goleadores, equipos autorizados, noticias, patrocinadores y enlace/QR; páginas móviles compartibles y metadatos SEO/OG.

   **Entrada pública (04/11/2026):** sin sesión se elige un torneo publicado en el catálogo. Su vista filtra los datos deportivos y flyers a esa competencia; el ingreso administrativo es opcional y separado.

   **Vista fan corregida (04/11/2026):** selector de torneo en cabecera, sin botón de regreso ni ingreso a la vista administrativa. Navegación por Partidos, Clasificación, Goleadores, Valla menos vencida y Equipos; Cuadro dentro de Partidos y sin Clasificación en copa directa. Detalle de partido con marcador y todos los eventos públicos agrupados por tiempo; detalle de equipo con jugadores expresamente publicados, goles y tarjetas. Flyers contextuales en la Fecha, partido, cuadro y estadística. Nombre largo visualmente truncado, dato íntegro conservado. La ruta pública de organización limita la lista a sus torneos; la configuración de subdominios queda pendiente de una decisión de despliegue.

   **Acceso directo (06/11/2026):** el enlace de torneo abre su vista sin portada ni login; el de organizador abre su lista de torneos publicados. Selector propio de filas, sin desplegable nativo. El último enlace público del navegador se recuerda al abrir la raíz. Login solo por `#/acceso`, sin promoción dentro del fan. Pestañas desplazables sin barra visible.

   **Entrada por organizaciones (09/11/2026, sustituye el recuerdo de la raíz):** `/` muestra las organizaciones con torneos publicados y búsqueda móvil. La ruta limpia de organización usa un identificador persistido; la de torneo agrega su ID. `/acceso` aparece de forma discreta solo en la portada, fuera de las pestañas deportivas. `/panel` resuelve el destino privado según el rol. Los enlaces `#/publico/...` permanecen válidos. El despliegue estático requiere fallback de SPA para rutas directas.

   **Ajuste del selector (09/11/2026):** cabecera más baja, lista de torneos sin scroll interno ni altura máxima, búsqueda propia por nombre. La búsqueda de la portada incluye organización y torneo; un resultado de torneo abre ese torneo. Solo aparecen torneos publicados y la búsqueda del servidor no depende del límite inicial de 100 resultados.

   **Detalle móvil (06/11/2026):** al tocar una pestaña parcialmente fuera de pantalla, la fila la centra sin desplazamiento horizontal de la página. Los detalles de partido y equipo ocultan la cabecera del torneo; al cerrar vuelven a la posición anterior. El scroll vertical conserva el gesto, sin mostrar su indicador en el fan estrecho.
5. **T08-05 Privacidad/QA.** Controles de publicación por torneo/dato, no exponer C.I., nacimiento, documento, procedencia privada ni foto no autorizada de menor. Pruebas de formato, datos, marca, reprogramación, URL pública y accesibilidad.

## Aceptación

- Flyer A vs B muestra escudos correctos, fecha/hora/sede; flyer de resultado incluye marcador y goleadores oficiales. La jornada completa muestra todos sus encuentros ordenados.
- Exporta al menos cuadrado, vertical e historia con misma fuente de datos; PDF básico descargable.
- Regenerar tras cambio crea versión nueva, conserva snapshot previo.
- Público ve “provisional” en vivo y “oficial” tras acta, sin login ni datos privados.

## Demostración de salida

Generar previa y resultado, reprogramar, regenerar y comparar versiones; abrir portal anónimo y probar que endpoints/documentos privados niegan acceso. **Puerta:** artefactos coherentes y privacidad.

**Copa Caacupé — 10/11/2026:** el enlace público del plan parcial muestra Partidos, Fixture por Fechas/Jornadas, Clasificación por Grupos/Cuartos/Cuadrangular/Tabla general y los diez clubes con escudo. Las celdas sin acta permanecen pendientes; no se publican datos de lista de buena fe. [Evidencia](../evidencias/t04-t08-vista-publica-plan-parcial-2026-11-10.md).

**Flyers del plan por posiciones — 12/11/2026:** Cuartos y Finales toman únicamente partidos oficiales publicados de la revisión vigente del plan; el campeón se habilita tras la definición oficial. La Copa no tiene semifinal, por lo que ese flyer no aplica. Tres PNG generados y revisados en el espejo privado. En la plantilla v6 se agranda únicamente el círculo de fondo de cada emblema superior y se mantiene el escudo interior en su tamaño original; el pie dice «Generado por alacancha.top». La variante oscura usa blanco para fondos de escudo y texto secundario, y trazos blancos tenues. La aceptación en dispositivos físicos sigue pendiente.
