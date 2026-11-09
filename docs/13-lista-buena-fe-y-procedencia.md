# 13. Lista de buena fe, ficha del jugador y equipo de origen

**Estado:** diseño de producto investigado, no reglamento federativo ni asesoría legal. El núcleo privado se implementó en T03; ver [acta y límites](evidencias/t03-cierre-codigo-local.md). La lista de buena fe es la nómina de jugadores presentada para una edición/categoría; la planilla de partido es la selección de titulares, suplentes y cuerpo técnico para un encuentro. Son entidades separadas y versionadas.

## Qué muestran las fuentes paraguayas

- Un [reglamento 2026 de la Secretaría Nacional de Deportes](https://www.snd.gov.py/wp-content/uploads/2026/04/REGLAMENTO-CATEGORIA-1RA-MAS.pdf) pide en su lista nombre de institución, nombres/apellidos, C.I. y fecha de nacimiento; fija además una ventana propia para agregar jugadores. Es **un ejemplo de torneo**, no una regla universal.
- El [reglamento de registro de jugadores de la APF](https://sistema.apf.org.py/laravel-filemanager/files/69/6022c4228bede.pdf) distingue datos de registro (nombre completo, nacimiento, nacionalidad, tipo de fútbol, club y estado) y la historia de clubes. No convierte a esta aplicación en registro APF.
- Un [reglamento APF de competición](https://statics-maker.llt-services.com/apf/documents/2025/07/08/db0f4f7c-095a-421e-8c18-57054d87f9b2-890.pdf) separa lista aprobada de alineación del partido con titulares, suplentes y cuerpo técnico. Sus cupos/plazos eran de esa competición, no presets obligatorios.
- La [Ley paraguaya 7593/2025 de protección de datos](https://www.bacn.gov.py/leyes-paraguayas/12924/ley-n-7593-proteccion-de-datos-personales) establece principios de necesidad, privacidad y protección de menores, con entrada en vigor diferida según publicación oficial. Revisar su vigencia/reglamentación y las obligaciones aplicables antes de usar datos reales.

## Ficha de jugador propuesta

| Campo | Uso y regla | Visibilidad |
|---|---|---|
| `player_id` UUID | Identidad interna dentro de la organización; nunca C.I. ni dorsal | Interna. |
| Nombres y apellidos | Identificación deportiva; admitir nombre para mostrar | Privada completa; pública solo si se autoriza. |
| Tipo y número de documento (C.I. u otro) | Verificación por organizador; formato flexible para extranjeros | Privada, acceso restringido; no en portal/flyer. |
| Fecha de nacimiento | Calcular edad a fecha de corte/partido; evita edad almacenada que envejece mal | Privada; edad/categoría pública solo si se autoriza. |
| Número de ficha | Identificador deportivo emitido por el torneo o declarado de una liga/entidad externa; guardar emisor, ámbito y vigencia. Unicidad solo dentro del ámbito que corresponda | Interna; exportación privada si se requiere. |
| Equipo actual/inscripción | Vínculo a entrada del equipo, categoría, edición, vigencia y estado de revisión | Privada; equipo deportivo público autorizado. |
| Equipo y ciudad de origen | Referencia interna o declaración externa; ver sección siguiente | Privada por defecto. |
| Nacionalidad, género/categoría | Solo si el reglamento los necesita para elegibilidad | Privada por defecto. |
| Foto, posición, dorsal | Foto opcional con permiso; dorsal/posición son datos deportivos del encuentro o temporada | Publicación configurable. |
| Documentos, autorización de tutor, evidencia de transferencia/préstamo | Requeridos solo por reglamento/caso; vencimiento y revisión | Archivo privado con permiso específico. |
| Contacto, domicilio, datos médicos | No recolectar por defecto; incorporar solo con finalidad y controles definidos | Privado restringido. |

La fecha de alta, actor, estado y motivo de rechazo pertenecen a la **inscripción**, no a la identidad de la persona. La ficha y el dorsal pueden cambiar entre torneos/temporadas; una ficha externa declarada no se considera verificada automáticamente. Si no hay C.I. válida para una persona extranjera o menor, el organizador define documentos alternativos; no inventar números.

## Procedencia interna o externa

| Caso | Representación | Validación |
|---|---|---|
| Origen en el mismo torneo/organización | `origin_kind=internal`, `origin_team_id`, edición/fecha | Verificar vínculo y evitar inscripciones incompatibles según reglamento. |
| Origen en otra organización de la plataforma | Referencia **declarada**, no consulta automática cruzada | No acceder a datos de otro tenant ni compartir ficha sin proceso/permiso expreso. |
| Origen fuera de la plataforma | `origin_kind=external`, nombre de equipo, ciudad/localidad, liga/asociación opcional, país opcional, período y documento/evidencia opcional | `declared → under_review → verified/rejected` por organizador; no crear equipo participante ni cuenta externa. |
| Sin equipo anterior/desconocido | `none` o `unknown` con razón opcional | No forzar un origen falso. |

Registrar si el movimiento declarado es alta nueva, transferencia o préstamo y sus fechas; la procedencia **no aprueba** por sí sola la habilitación. Una transferencia entre clubes externos a nuestro torneo puede requerir autorización o comprobante según reglamento propio; esta app conserva evidencia y decisión del organizador, sin certificar un pase APF/UFI.

## Flujo móvil de lista de buena fe

1. Administrador de equipo abre “Lista de buena fe”, ve cupo `registrados/máximo`, borradores y observados.
2. “Agregar jugador” solicita identidad privada y procedencia en dos pasos, con documentos/reglas solo cuando correspondan. Revisión del borrador opcional; no confundirla con aprobación oficial. Guardar y volver o guardar y agregar otro sin regresar a la lista, conservando el contexto del equipo. No copiar procedencia ni identidad al siguiente jugador por defecto.
3. Buscar por nombre, ficha o últimos dígitos de documento (solo autorizados) para detectar posibles duplicados; nunca mostrar C.I. completa en lista general.
4. Presentar lista al organizador; éste aprueba, observa o rechaza con motivo. La versión aprobada queda congelada; correcciones generan revisión.
5. Antes de cada partido, seleccionar convocados desde jugadores habilitados. Los no convocados permanecen en lista de buena fe.

## Decisiones por torneo que deben ser configurables

Cupo total, fecha de cierre, campos obligatorios, documentos aceptados, forma de numerar fichas, política de jugadores de origen externo, elegibilidad por edad, permisos de publicación y posibilidad de sustitución posterior. Ningún límite de un reglamento APF/SND se fija universalmente.

**Estado T02 al 28/10/2026:** el reglamento de cada categoría ya permite configurar límites de edad con referencia al partido o a una fecha fija y etiquetas de documentos requeridos. También admite declarar expresamente que no hay restricciones. Esto es configuración de reglas: la ficha del jugador, carga de documentos privados y validación efectiva de elegibilidad se implementarán en T03. [Acta de configuración](evidencias/t02-elegibilidad.md).

**Primer incremento T03:** ya existe alta privada de identidad con documento cifrado, fecha de nacimiento, ficha e inscripción en equipo/categoría; la lista solo muestra la terminación del documento. Procedencia interna referencia un equipo de la organización; externa guarda nombre, ciudad y liga opcional como declaración. El estado es borrador, sin aprobación ni cálculo de edad todavía. [Acta T03](evidencias/t03-borrador-jugadores.md).

**Segundo incremento T03:** la lista se puede presentar como versión privada y el organizador puede aprobarla, observarla o rechazarla con motivo. El snapshot revisado no se reescribe; se presenta una versión nueva para corregir. La aprobación usa cupo y reglamento publicado, calcula edad para una fecha de corte fija si corresponde y bloquea documentos exigidos hasta que exista revisión de archivos privados. Aún faltan elegibilidad por fecha de partido y planilla. [Acta de revisión](evidencias/t03-revision-buena-fe.md).

**Cierre técnico local T03:** la carga y revisión de documentos, la evaluación por fecha, los movimientos, las restricciones manuales y las planillas privadas ya tienen API, UI y persistencia. CSV y PDF también están implementados. Las políticas configurables y la aceptación física descritas en [el acta](evidencias/t03-cierre-codigo-local.md) siguen abiertas. Los párrafos anteriores documentan hitos históricos, no el estado vigente.

## Pruebas de aceptación propuestas

- Jugador con origen externo “Club X, Ciudad Y” se carga sin crear un equipo competidor; queda declarado hasta revisión.
- Jugador con origen interno usa referencia válida y el sistema detecta conflicto de inscripción cuando la regla lo prohíbe.
- La lista permite buscar/filtrar y guardar borrador desde 320 px; documento completo no aparece en público, flyer ni respuesta de otro equipo.
- Cambio de fecha de nacimiento recalcula edad para la fecha de corte sin alterar actas ya congeladas.
- Un jugador aprobado queda en lista histórica aunque luego cambie de equipo; la planilla de un partido anterior conserva su snapshot.
