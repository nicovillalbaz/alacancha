# 09. Flujos, navegación y pantallas

La ruta conceptual es `organización → torneo → edición → categoría → jornada → partido`; desde equipo se accede a `comisión → cuerpo técnico → lista de buena fe → planilla`. El selector de contexto hace visible dónde se está trabajando. **Todos los flujos se diseñan primero en móvil.** Las rutas indicadas son propuestas de UX, no endpoints implementados.

| Perfil | Navegación móvil prioritaria | Panel amplio |
|---|---|---|
| Superadmin | Inicio · Administradores · Organizaciones · Accesos | Estado manual, auditoría y soporte. |
| Administrador de torneo | Inicio · Equipos · Fixture · Partidos · Torneo | Desde Torneo: reglas, disciplina, flyers y publicaciones con accesos explícitos. |
| Administrador de equipo | Mi equipo · Buena fe · Partidos · Sanciones | Desde Mi equipo: comisión, cuerpo técnico y planilla del próximo partido con accesos explícitos. |
| Planillero/árbitro | Mis partidos · Partido activo · Acta | Historial asignado y revisión según función. |
| Público | Torneo · Fixture · Resultados · Tablas · Goleadores | Desde Torneo: cuadros, equipos, novedades y flyers autorizados; en vivo desde el partido. |

Los destinos aparecen según permiso y tanda disponible. Una ruta directa siempre repite autorización en API. Una función futura no debe presentarse como botón funcional vacío.

**Revisión visual 28/10/2026:** navegación directa conforme a las observaciones del gym; sin destino genérico «Más». Altas, edición y revisiones se abren como páginas. Cada hija vuelve al padre inmediato y conserva filtros, posición y borrador; un enlace directo usa un padre determinista. El equipo y el partido son centros de sus acciones relacionadas. Ver [criterios visuales](10-guia-visual.md).

**Continuación T01 del 28/10:** acceso y administración ya tienen una implementación local persistente, descrita en su [acta](evidencias/t01-base-funcional.md). En las demás exploraciones, pocas opciones se muestran como botones; procedencia con equipos por escudo/nombre, jornadas visibles y alta de borradores de jugador en dos pasos con guardado consecutivo. El reglamento y la aprobación oficial conservan su revisión; la rapidez no concede permisos nuevos.

## F1 — Superadmin crea y controla acceso

1. Inicia sesión por contraseña y abre organizaciones.
2. Crea organización, administrador de torneo y enlace de invitación de un uso con caducidad; entrega el enlace por un medio elegido fuera de la app.
3. El administrador establece contraseña. Superadmin lo habilita manualmente con alcance preciso.
4. Superadmin suspende/bloquea con motivo; nuevas solicitudes y sincronizaciones quedan denegadas, sin borrar datos.

**Errores visibles:** invitación vencida/usada, login fallido, organización suspendida y pérdida de permiso. **Prueba:** dos organizaciones con equipos del mismo nombre no comparten datos.

## F2 — Organizador crea torneo y reglamento

1. Crea torneo y edición, elige preset F5/F7/F11/futsal o personalizado.
2. Ajusta categoría, jugadores en cancha y banca; la planilla suma ambos automáticamente. Configura aparte el cupo de cuerpo técnico, nómina, cambios, puntos, tarjetas, documentos y vigencia.
3. Revisa resumen, publica versión del reglamento, crea equipos y asigna administradores de equipo.
4. Define comisión y cuerpo técnico con roles configurables; un título de comisión no otorga permiso de cuenta automáticamente.
5. Ve portal inicial con contenido que autorizó publicar.

**Errores:** límites incompatibles (`R < N`, banco imposible), nombre repetido dentro de edición y falta de permisos. Una regla publicada no se sobrescribe: se crea nueva versión.

## F3 — Administrador de equipo presenta buena fe y arma planilla

1. Entra a “Mi equipo”, consulta comisión, cuerpo técnico, buena fe, sanciones y próximos partidos.
2. Crea jugador con nombre/apellido, C.I. privada, nacimiento, ficha y origen interno o externo con ciudad; adjunta documentos solo si la regla los exige. Organizador revisa; estado y motivo son visibles.
3. Presenta una versión de la lista de buena fe y solicita alta/transferencia/préstamo si corresponde.
4. Abre partido y elige titulares/suplentes/no convocados desde elegibles. Ve contadores `X/N`, `Y/B`, `Z/R` y motivo de cada bloqueo.
5. Marca arquero/capitán, añade cuerpo técnico, guarda borrador y presenta planilla.
6. Autoridad la aprueba/congela; luego el operador usa ese snapshot.

**Prueba:** F7 7+8 de 30 con teléfono a 320 px, una mano, sin desplazamiento horizontal ni jugador de otro equipo.

## F4 — Organizador programa y publica jornada

1. Genera fixture revisable o crea partidos manualmente; valida choque de cancha/equipo/árbitro.
2. Agrupa partidos/categorías en jornada; ordena por horario, cancha y prioridad, con vista de lista móvil y calendario amplio.
3. Publica versión del fixture; el portal muestra jornada, horarios y cuadro correspondiente.
4. Reprograma un partido con motivo sin perder su jornada; equipos reciben aviso interno.

**Prueba:** doble clic/reintento no duplica publicación, partido ni aviso.

## F5 — Autoridad autorizada completa resultado, goles y tarjetas

1. El planillero o administrador de torneo con permiso de control abre el encuentro dentro de su alcance.
2. Ve escudos, marcador, estado de sincronización y jugadores de planillas congeladas.
3. Priorizar carga posterior. Gol/amarilla/roja abre una vista de carga continua: elegir uno de los dos escudos con nombre, PT/ST/TE y tocar el jugador para agregar. La vista permanece abierta; conserva equipo/período, mantiene posición y muestra confirmación y deshacer. Se puede cambiar de gol a amarilla/roja dentro de esa misma vista. No exigir selección más un segundo botón de registro para cada jugador. Cambios de jugadores usan selección sale/entra y explican límites.
4. Revisa eventos recientes, deshace/corrige con motivo y distingue guardado local, sincronizando, confirmado y fallo.
5. Finaliza captura, revisa acta y la envía. Otra autoridad habilitada aprueba cuando el flujo requiera revisión; público deja de ver “provisional”.

“Completar partido” permite ingresar retrospectivamente sin cronómetro. Para gol/tarjeta se puede indicar primer tiempo, segundo tiempo o tiempo extra según el reglamento; el minuto es opcional, empieza vacío y se carga solo cuando se conoce. Se admite dejar el momento sin especificar. El marcador de carga posterior no muestra un minuto actual. Eventos y acta omiten minutos desconocidos. Si el marcador carece de autores, advierte según la regla, sin inventarlos. **Prueba:** reintento sin señal no duplica gol; corrección oficial conserva antes/después; minuto vacío no se convierte en cero.

Los equipos y períodos usan botones visibles, no desplegables. PT/ST/TE incluyen nombre completo y estado seleccionado que no dependa solo del color. Un segundo toque sobre el período seleccionado lo deja sin especificar. El minuto manual se limpia tras agregar un evento para no asignarlo a los siguientes. Un doble toque accidental no duplica; los registros posteriores deliberados siguen permitidos. Una sanción no se aplica automáticamente por tocar una tarjeta: las reglas oficiales se resuelven en su tanda.

## F6 — Disciplina, multas y revisión

Tras acta oficial se derivan tabla y estadísticas; un caso disciplinario puede proponerse, revisarse, resolverse y apelarse. Una multa aprobada queda como resolución deportiva visible al equipo afectado, con importe si el reglamento lo usa, sin módulo de pagos ni saldos. El administrador de equipo ve sus expedientes; el organizador decide y audita.

## F7 — Flyer y público

Desde partido/jornada, el organizador elige plantilla existente para 1v1, fecha completa o resultado con goleadores. Ve escudos, horario, sede, resultado y fotografías autorizadas; ajusta texto opcional y exporta PNG/JPG/PDF mediante worker propio. Una reprogramación o corrección ofrece regenerar sin alterar archivo anterior. El espectador abre portal sin login y consulta fixture, cuadro, tabla y goleadores autorizados.

## Estados comunes de pantalla

Cada pantalla tiene carga, vacío útil con siguiente acción, error recuperable, permiso denegado, contenido largo y conectividad insuficiente donde corresponda. No mostrar éxito de un evento hasta confirmación del servidor; un borrador local se etiqueta como tal. Navegar atrás o cambiar organización no pierde datos sin aviso.
