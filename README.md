# Proyecto Torneos — guía del proyecto

**Estado:** T01–T08 implementadas en código local, con T03 ampliada a políticas configurables y T04 a progresión de copa y catálogo de árbitros. T09 completó los pendientes priorizados de código local; la aceptación física, copia externa, revisión legal y piloto siguen pendientes. **Corte:** 30/10/2026. **Mercado inicial:** Paraguay. **Nombre comercial:** pendiente. **Sin Docker.**

La base funcional tiene cuentas, organizaciones, permisos de servidor, control manual, invitaciones, recuperación y auditoría. T02 agrega torneos, ediciones, categorías, reglas versionadas, fase inicial, equipos, administradores de equipo revocables, sedes privadas, patrocinadores autorizados y un portal público inicial. La planilla de jugadores se calcula con cancha y banca; el cupo técnico, los cambios/reingreso, la edad, documentos, tarjetas, walkover y la jerarquía de desempates se configuran por categoría. Seguir la [guía de desarrollo local](docs/runbooks/desarrollo-local.md). Tras la preparación inicial, ejecutar `npm run dev` y abrir **http://127.0.0.1:4311**. [Cierre de código local T02, pruebas y pendientes](docs/evidencias/t02-cierre-codigo-local.md).

El [prototipo deportivo](prototipos/01-direccion-visual/README.md) conserva exploraciones de buena fe, fixture y partidos, con datos ficticios en memoria. Ejecutar `npm run preview:visual` y abrir `http://127.0.0.1:4310`. La implementación T02 vive en la aplicación principal de 4311; las vistas del prototipo no demuestran funcionalidad persistida.

**Entrada pública local:** `http://127.0.0.1:4311/` lista organizaciones con torneos publicados. La ruta de cada organización y torneo es directa; el ingreso de gestión está en `/acceso` y `/panel` resuelve el destino según el rol. Los enlaces antiguos con `#/publico/` siguen funcionando. En producción Fastify entrega la web compilada, las rutas públicas con metadatos y el fallback; el proxy debe enviarle todas las rutas. [Despliegue sin Docker](docs/runbooks/despliegue-vps-sin-docker.md).

T03 agrega jugadores con identidad cifrada, evidencia privada, procedencia y movimientos, elegibilidad por fecha, buena fe y planillas versionadas, importación CSV reversible y PDF privado. El reglamento puede fijar ventanas, campos privados adicionales y comprobante de pase. T04 genera liga, grupos y eliminatoria; conserva partidos borrador T03 compatibles, programa Fechas compartidas, detecta conflictos, reprograma con historial y publica fixture/cuadros autorizados. El avance usa actas T05 y tablas T06 para clasificar, resolver rondas y ejecutar sorteos posteriores. La agenda dispone de catálogo privado de árbitros. [Acta T03](docs/evidencias/t03-cierre-codigo-local.md) · [acta T04](docs/evidencias/t04-agenda-publicacion.md) · [incremento T03/T04](docs/evidencias/t03-t04-cierre-local-2026-10-29.md).

T05 agrega planilleros asignados por partido, eventos y planillas congeladas, acta enviada/conformada/aprobada, rectificación versionada, resultado provisional/oficial y sincronización ante cortes de red. La prueba en teléfonos reales sigue pendiente. [Cierre técnico T05](docs/evidencias/t05-cierre-codigo-local.md).

T06 calcula clasificación y goleadores desde actas aprobadas, permite ajustes de puntos y desempates documentados, y gestiona expedientes, suspensiones, multas y apelaciones sin cobros. El portal solo publica nombres de goleadores autorizados. [Cierre técnico y límites T06](docs/evidencias/t06-cierre-codigo-local.md).

T07 reúne tareas de revisión por rol y equipo, agrega vigencia a la comisión y permite exportar buena fe, planilla, acta y disciplina en PDF/CSV privados y auditados. [Cierre técnico y límites T07](docs/evidencias/t07-cierre-codigo-local.md).

T08 genera flyers públicos versionados desde jornadas y actas aprobadas, con plantillas locales y salida PNG/JPG/PDF. El portal incluye galería, enlace compartible con metadatos y QR generado en el servidor. El worker local necesita Chrome y FFmpeg instalados; no llama a servicios externos. [Avance y límites T08](docs/evidencias/t08-flyers-portal.md).

T09 agrega PWA instalable, cola de eventos guardada antes del envío, medición de torneos/captura/flyers, auditoría técnica de rutas y respaldo cifrado v3 por streaming. [Evidencia nueva](docs/evidencias/t09-codigo-local-2026-10-30.md) y [preparación anterior](docs/evidencias/t09-preparacion-piloto.md). Para revisar la instalación local: `npm run build`, `npm run dev:api` y `npm run preview:pwa` en procesos separados. El piloto no está autorizado.

**Torneo de prueba local:** `npm run demo:ready` crea una Copa de los Barrios ficticia, con cuatro equipos, jugadores, fixture próximo y Pagos internos. El comando solo admite la base local `torneos_local` en `127.0.0.1` y evita duplicar el torneo. [Datos y evidencia](docs/evidencias/pagos-demo-2026-10-30.md).

**Copas terminadas de muestra:** `npm run demo:finished` crea o completa tres torneos sintéticos locales: grupos y cuadro, eliminación directa, y liguilla con eliminación. Incluyen ida/vuelta, global, penales y tercer partido. `npm run demo:verify` comprueba sus actas y cuadros públicos. [Detalle](docs/evidencias/t04-copas-terminadas-2026-11-06.md).

Este repositorio contendrá una plataforma web/PWA de uso **principalmente móvil** para administrar torneos de fútbol y sus variantes. El organizador podrá crear equipos y administradores de equipo, fixture y horarios; cada administrador de equipo gestionará comisión, cuerpo técnico, jugadores y lista de buena fe. Los planilleros registrarán partidos y los aficionados consultarán fixture, cuadros, resultados, goleadores y clasificación sin cuenta.

## Punto de entrada

1. [Especificación maestra original](PROYECTO_TORNEOS_ESPECIFICACION_MAESTRA_CODEX.md): antecedente de alcance; sus secciones comerciales fueron reemplazadas por la decisión del 27/10/2026.
2. [Organizador de documentación](docs/README.md): qué leer y dónde registrar avances.
3. [Decisiones y pendientes](docs/01-decisiones.md): confirmado, propuesta técnica y asuntos por validar.
4. [Hoja de ruta](docs/02-hoja-de-ruta.md) y [paso a paso](docs/03-paso-a-paso.md): orden de ejecución y puertas de salida.
5. [Estructura prevista](docs/04-estructura-del-proyecto.md) y [arquitectura/datos](docs/05-arquitectura-y-datos.md).
6. [Reglas deportivas](docs/06-reglas-deportivas.md), [permisos](docs/07-permisos-y-seguridad.md), [activación de acceso](docs/08-activacion-y-control.md) y [lista de buena fe/procedencia](docs/13-lista-buena-fe-y-procedencia.md).
7. [Flujos y pantallas](docs/09-flujos-y-pantallas.md) y [guía visual](docs/10-guia-visual.md).
8. [Operación y calidad](docs/11-operacion-y-calidad.md), [catálogo funcional](docs/12-catalogo-funcional.md) y [tandas detalladas](docs/tandas/README.md).
9. [Avances](docs/avances.md): estado real, evidencias y próximo trabajo.

## Decisiones que deben mantenerse visibles

- El superadmin habilita o bloquea manualmente el acceso de administradores de torneos. La tarifa inicial definida es Gs. 20.000 por jornada oficial publicada; no se integra pasarela ni correo transaccional en esta fase.
- Uso móvil primero para todos los roles; escritorio adapta los mismos recorridos.
- Nombre comercial aún sin elegir. `Proyecto Torneos` es solo la referencia interna; la carpeta `alacancha` no aprueba una marca.
- Un motor de reglas versionadas por categoría/edición; la modalidad selecciona un preset editable.
- Registro de partido rápido desde teléfono, con eventos auditables, acta oficial y resultado derivado.
- Sin IA, OTP, SMS, correo transaccional externo ni APIs/integraciones de terceros en esta fase. Bibliotecas instaladas localmente y componentes autohospedados sí son admisibles.
- Cédula, fecha de nacimiento, documentos y procedencia son privados; el portal solo muestra datos deportivos autorizados.

## Orden inmediato

La [Tanda 02](docs/tandas/02-torneos-reglas.md), la [03](docs/tandas/03-jugadores-planillas.md) y las [Tandas 05](docs/tandas/05-partido-en-vivo.md), [06](docs/tandas/06-estadisticas-disciplina.md) y [07](docs/tandas/07-control-y-exportaciones.md) están implementadas en código local. La [Tanda 04](docs/tandas/04-fixture-jornadas.md) tiene progresión deportiva y árbitros en código local; una rectificación reasigna cruces posteriores sin planilla ni acta, incluso programados y publicados, y detiene para revisión humana los ya iniciados. La [Tanda 08](docs/tandas/08-flyers-portal.md) tiene flyers y portal; falta QA visual y aceptación física/humana. La [Tanda 09](docs/tandas/09-piloto-lanzamiento.md) completó los pendientes de código local priorizados; las puertas de piloto siguen abiertas.
