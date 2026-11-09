# T08 — Flyers y portal: avance de código local

**Fecha:** 29/10/2026. **Estado:** T08-01 a T08-04 implementados en código local; T08-05 requiere último repaso visual y aceptación física/humana. T09 no iniciado.

## Alcance entregado

| Ticket | Datos y API | Interfaz, permisos y estados |
|---|---|---|
| T08-01 | Dos plantillas (`forest`, `paper`) con versión explícita; nueve tipos: previa, jornada, resultado, tabla, cuadro, semifinal, final, campeón y comunicado. Texto escapado, nombres largos acotados, escudos/logos locales validados. | Selector de contenido, fuente, plantilla y tamaño en el contexto del torneo. Vista previa directa. El comunicado exige texto público. |
| T08-02 | Worker propio usa Chrome local para PNG/PDF y FFmpeg local para JPG. Medidas 1080×1080, 1080×1350, 1080×1920 y 1240×1754. Valida cabecera, tamaño y archivo; límites de 12 MB. No usa Docker ni servicio externo. | Cola con estados en cola, generando, listo y falló; descarga privada al estar listo. PDF de impresión comprobado con `pdfinfo`: **1 página**, 930×1315,92 pt. |
| T08-03 | Migración 026: fuente, revisión, aprobación, plantilla/version, snapshot, huella, checksum, archivo, motivo y actor. Trigger impide borrar o reescribir la fuente histórica. Solicitud idempotente; regenerar crea versión nueva. | Historial visible. La publicación exige archivo listo y fuente vigente. Si cambia horario, acta, visibilidad de equipo o autorización de goleador, el público deja de recibir el flyer antiguo; el organizador conserva descarga y versión. |
| T08-04 | Portal existente de fixture, resultados provisional/oficial, tabla, goleadores, equipos y patrocinadores se amplió con comunicados/flyers públicos, página compartible HTML con metadatos OG/SEO y QR generado con biblioteca local. | Galería móvil y botón de compartir. Los enlaces públicos y QR no incluyen cédulas, nacimientos, documentos ni procedencia. |
| T08-05 | Pruebas de permiso entre organizaciones, equipo sin escritura, versión, publicación/revocación, cambio de fuente, escapado HTML, PNG/JPG/PDF, QR y metadatos. | Comprobación Chrome a 320/390/768/1280 px sin desbordamiento, teclado desde contenido a fuente, vista previa y corte de API con borrador conservado. Se corrigió el aviso genérico de red a español después de observarlo. |

## Evidencia reproducible

- `npm run restore:check` antes de la migración: restauración sintética con 160 archivos y filas/huellas iguales.
- `npm run db:migrate`: migración 026 aplicada.
- `npm test`: **63/63** pruebas; `npm run build`: correcto. Incluye campeón por global de dos actas oficiales aprobadas.
- Una exportación PNG cuadrada se inspeccionó visualmente: escudos/monogramas, fecha, hora, sede, nombres y pie. PNG medido 1080×1080. JPG y PDF se descargaron con firmas válidas. El PDF inicialmente tenía una página extra por el elemento inline; se corrigió a bloque y la prueba exige `/Count 1`.
- En Chrome con datos sintéticos locales se abrió el portal, la pantalla `Flyers` del organizador y la vista previa de comunicado. La pantalla a 320 px no desbordó; las mediciones de 390/768/1280 dieron `scrollWidth === clientWidth`.
- Durante un corte real de los procesos locales, el texto y la fuente del formulario permanecieron. El primer mensaje fue `Failed to fetch`; el código ya muestra una explicación en español. La repetición visual tras el cambio quedó bloqueada por dos tiempos agotados de revisión automática del navegador; no se interpreta como fallo de la aplicación.

## Límites y pendientes

- La instalación local debe disponer de **Node 24, Chrome y FFmpeg**; no se ha preparado despliegue ni se han probado otros sistemas operativos.
- Un comunicado público figura como noticia visual. No existe editor independiente de noticias ni subida de fotografías de jugadores. La ausencia de foto evita publicar la imagen de un menor sin autorización.
- En resultados con más de cuatro goles, cada página conserva hasta cuatro líneas y la interfaz permite avanzar por páginas. El organizador publica cada archivo tras revisarlo.
- La aprobación estética, prueba con teclado virtual/teléfonos reales, lector de pantalla, impresión física y revalidación visual del aviso de red corregido siguen pendientes.
- El worker reclama cada trabajo con un bloqueo de PostgreSQL mantenido durante el render. Si se interrumpe, el bloqueo se libera y otro ciclo retoma el trabajo `running`; una prueba fuerza ese estado y verifica la descarga posterior.
