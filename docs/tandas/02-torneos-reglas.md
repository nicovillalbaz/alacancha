# T02 — Torneos, equipos, comisión y reglamentos

**Objetivo:** el administrador de torneo crea equipos y sus administradores, comisión y cuerpo técnico, además de torneos/categorías con reglas versionadas. Todo desde móvil.

**Estado al 28/10/2026:** alcance programable de T02 completo en código local, con [acta de cierre técnico](../evidencias/t02-cierre-codigo-local.md). Las seis entregas tienen datos, API, UI, permisos y pruebas. La aceptación en teléfonos físicos, con usuarios reales y por el propietario sigue pendiente; no equivale a despliegue ni aceptación final. T03 ya había comenzado por instrucción expresa del propietario y permanece separada.

**Ajuste del 06/11/2026:** en el alta móvil, «Añadir tarjeta» está junto a los importes de amarilla y roja. La tarjeta personalizada y su multa de referencia se crean en la misma operación que el torneo. [Evidencia](../evidencias/t02-alta-tarjeta-2026-11-06.md).

| Ticket | Estado verificado | Falta para cerrarlo |
|---|---|---|
| T02-01 | Migraciones 003–006 y 009: torneos, reglas, equipos/participaciones, comisión, cuerpo técnico, sedes y patrocinadores asociados al torneo. Alta, archivo y publicación explícita del patrocinador. | Club agrupador es opcional y se difiere hasta definir un caso de uso distinto del equipo. |
| T02-02 | Asistente móvil, presets editables, límite, zona horaria, nuevas categorías/ediciones, fase inicial liga/grupos/eliminación con ruedas y previa completa de publicación. | Validación con usuarios reales. |
| T02-03 | Cancha, banca, técnico y planilla calculada; cambios, edad/documentos, tiempos/puntos, tarjetas, walkover y jerarquía de desempates, versionados por categoría. | Aplicación a jugadores/partidos/tabla en T03/T05/T06. La modalidad volante y otras sanciones requieren definición o expediente en T06; no se inventa una regla universal. [Cupos](../evidencias/t02-cupos-reglamento.md) · [Cambios](../evidencias/t02-cambios-reingreso.md) · [Edad/documentos](../evidencias/t02-elegibilidad.md) · [Criterios](../evidencias/t02-desempates-y-criterios.md). |
| T02-04 | Equipo/participación, color, escudo, administradores asignados/invitados, comisión/staff propuestos y confirmados. Revocación por participación con motivo, corte de acceso y reasignación auditada. | Uso con administradores reales. |
| T02-05 | Portal anónimo con categorías/reglas, equipos aprobados y patrocinador autorizado; sin sede privada ni datos personales. | Fixture y demás contenido deportivo en T04–T06. |
| T02-06 | 40 pruebas de integración/motor, build, restauración y revisión de 320–1280 px. | Teléfonos físicos, teclado virtual, red inestable, zoom/texto al 200 %, lector de pantalla y aceptación estética del propietario. |

## Dependencias

T01: contexto de organización, permisos, media y auditoría. Confirmar nombres de entidades y migraciones antes de añadir datos deportivos.

## Tickets en orden

1. **T02-01 Datos.** Migrar torneos, ediciones, categorías, presets, reglamentos versionados, equipos/participaciones, comisión, staff, sedes y patrocinadores básicos. Club agrupador opcional; claves compuestas impiden cruce de tenant/categoría.
2. **T02-02 Asistente.** Crear torneo/edición/categoría con modalidad como preset F5/F6/F7/F8/F9/F11/futsal/personalizado. Configurar límite de equipos, fase inicial y zona horaria; preview antes de publicar.
3. **T02-03 Editor de reglas.** Campo, mínimos, banco, acta, nómina, cuerpo técnico, cambios/reingreso, tiempos, puntos, tarjetas, edad, documentos, walkover y desempates. Validar relaciones matemáticas; versión publicada inmutable y fecha efectiva.
4. **T02-04 Equipo/administrador.** El organizador crea equipo, escudo y colores; asigna uno o más administradores de equipo con alcance de edición/categoría. El equipo propone comisión (presidencia, secretaría, tesorería u otros roles configurables); permisos de cuenta se asignan por separado. Conservar historial entre temporadas.
5. **T02-05 Portal inicial.** Nombre/logo/reglas públicas y equipos autorizados sin login. No exponer datos personales.
6. **T02-06 QA.** Tests de presets editables, versión/snapshot, límites imposibles, permisos cruzados y flujo E2E F5/F11.

## Aceptación

- La misma organización crea F5 y F11 con distintos máximos; cambiar preset no pisa una regla ya publicada.
- Un equipo participa en dos categorías/ediciones sin mezclar plantillas futuras.
- Administrador de equipo A solo ve su equipo; admin de torneo B no accede al torneo de A.
- Un integrante de comisión sin cuenta no obtiene permiso automáticamente por su título.
- El portal inicial muestra únicamente datos aprobados para publicación.

## Demostración de salida

Crear dos torneos/categorías y equipos desde móvil, asignar admins de equipo y comisión, publicar reglamento v1 y crear v2 sin modificar snapshot v1. Abrir portal anónimo y probar URL ajena. **Puerta:** reglas versionadas y aislamiento comprobados.
