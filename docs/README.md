# Organizador de documentación

**Primera carga federativa (en preparación):** [fuentes, diez equipos del afiche y separación entre copas de clubes y eliminatorias](fuentes-fcfs-2026.md). Es un inventario, no una carga publicada.

**Copa Caacupé en producción (11/11/2026):** [evidencia del respaldo, ensayo y carga](evidencias/t09-fcfs-produccion-2026-11-11.md). La vista pública contiene el plan parcial y los diez equipos; el sorteo, el reglamento oficial y los resultados siguen pendientes.

**Espejo privado de Caacupé (12/11/2026):** [runbook de acceso y aislamiento](runbooks/espejo-privado-vps.md) y [barrido de extremo a extremo](evidencias/t09-espejo-privado-2026-11-12.md). Sus resultados de ensayo no pertenecen a la Copa pública real.

**Alcance vigente al 27/10/2026:** planificación móvil primero. El control de acceso es manual desde superadmin; las secciones antiguas de cobros/facturación de la especificación maestra son históricas.

**Entrega vigente del 28/10/2026:** [base funcional T01](evidencias/t01-base-funcional.md) y [cierre de código local T02](evidencias/t02-cierre-codigo-local.md), persistentes en PostgreSQL nativo y sin contenedores. [Guía de desarrollo y accesos de muestra](runbooks/desarrollo-local.md). El [prototipo deportivo](../prototipos/01-direccion-visual/README.md) continúa separado, con datos ficticios en memoria. La aceptación física y de uso de T01/T02 sigue pendiente.

**T03 en código local:** [acta inicial](evidencias/t03-cierre-codigo-local.md) e [incremento de políticas](evidencias/t03-t04-cierre-local-2026-10-29.md). Incluye documentos privados revisables, elegibilidad por fecha, ventanas, comprobante de pase, campos adicionales, buena fe, planilla, CSV y PDF. **T04 en código local:** [agenda y publicación](evidencias/t04-agenda-publicacion.md), [plan de copa](evidencias/t04-plan-copa.md) e [incremento de progresión/árbitros](evidencias/t03-t04-cierre-local-2026-10-29.md). Clasifica y avanza desde actas oficiales; reasigna cruces posteriores sin planilla ni acta, incluso programados o publicados, y bloquea los ya iniciados para revisión humana.

**T05 completa en código local:** [cierre técnico de resultados y actas](evidencias/t05-cierre-codigo-local.md): planilleros por partido, eventos auditables, revisión, resultado oficial, difusión y cola de red inestable. La aceptación física/humana sigue pendiente; T06 ya toma las actas para estadísticas.

**T06 completa en código local:** [cierre técnico y límites](evidencias/t06-cierre-codigo-local.md): tablas y goleadores reconstruibles, ajustes y desempates documentados, expedientes, suspensiones, multas y apelaciones. Pruebas, Chrome móvil/escritorio y PDF verificados; aceptación en teléfonos reales pendiente.

**T07 completa en código local:** [cierre técnico y límites](evidencias/t07-cierre-codigo-local.md): bandeja de revisión por rol/equipo, comisión con vigencia y acceso separado, PDF/CSV privados y auditados de buena fe, planilla, acta y disciplina. Pruebas, Chrome y PDF verificados; aceptación física/humana pendiente.

**T08 con código local y QA final pendiente:** [flyers y portal](evidencias/t08-flyers-portal.md): plantillas y exportaciones versionadas, worker local PNG/JPG/PDF, galería pública, página compartible con OG/SEO y QR propio. Privacidad y 63 pruebas verificadas; falta revalidar visualmente el aviso de red corregido y la aceptación física/humana.

**T09 con código local ampliado, sin piloto autorizado:** [cierre de pendientes priorizados](evidencias/t09-codigo-local-2026-10-30.md) y [preparación anterior](evidencias/t09-preparacion-piloto.md): PWA instalable, cola de captura durable, carga sintética, auditoría de rutas y respaldo v3. Copia externa, pruebas en teléfonos reales, revisión legal y piloto siguen abiertos.

## Jerarquía de lectura

| Necesidad | Documento | Uso |
|---|---|---|
| Visión íntegra | [Especificación maestra](../PROYECTO_TORNEOS_ESPECIFICACION_MAESTRA_CODEX.md) | Antecedente original y escenarios; leer su aviso de alcance vigente. |
| Estado real | [Avances](avances.md) | Qué se implementó, probó y sigue pendiente. |
| Decisiones | [01 — Decisiones](01-decisiones.md) | Confirmado, propuesta operativa y validaciones. |
| Orden | [02 — Hoja de ruta](02-hoja-de-ruta.md), [03 — Paso a paso](03-paso-a-paso.md), [tandas](tandas/README.md) | Hitos, dependencias, tickets y demostración de salida. |
| Construcción | [04 — Estructura](04-estructura-del-proyecto.md), [05 — Arquitectura y datos](05-arquitectura-y-datos.md) | Carpetas, módulos, contratos y persistencia previstos. |
| Reglas | [06 — Deporte](06-reglas-deportivas.md), [07 — Permisos y seguridad](07-permisos-y-seguridad.md), [08 — Activación](08-activacion-y-control.md), [13 — Buena fe/procedencia](13-lista-buena-fe-y-procedencia.md) | Invariantes que las pruebas deben proteger. |
| Experiencia | [09 — Flujos](09-flujos-y-pantallas.md), [10 — Visual](10-guia-visual.md) | Navegación, acciones y sistema visual. |
| Referencias externas | [Investigación de GitHub (09/11/2026)](investigacion-github-2026-11-09.md) | Ideas para evaluar; no son decisiones ni funciones implementadas. |
| Copa Caacupé 2026 | [Formato confirmado y límites](copa-caacupe-2026-formato.md), [fuentes recibidas](fuentes-fcfs-2026.md) | Tres etapas, interserial, tabla general, calendario por posiciones y decisiones pendientes; la carga local sigue privada. |
| Ejecución | [11 — Operación y calidad](11-operacion-y-calidad.md), [12 — Catálogo](12-catalogo-funcional.md) | Entornos, Definition of Done y trazabilidad del alcance. |

## Regla de mantenimiento

La especificación maestra conserva el alcance. Las guías de `docs/` convierten ese alcance en decisiones y trabajo verificable. Cuando una hipótesis cambia, registrar fecha, motivo y efecto en `01-decisiones.md`, actualizar la tanda afectada y evitar versiones contradictorias. El avance se mide por evidencia, no por porcentajes inventados.

La carpeta hermana `../../gym` sirvió como referencia para **organizar** guías, tandas y diseño. Este proyecto tiene reglas comerciales y técnicas propias; no hereda sus planes, correo, cuentas ni estados de implementación.
