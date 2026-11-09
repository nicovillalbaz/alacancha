# T07 — Control administrativo y exportaciones deportivas

**Estado al 29/10/2026:** T07-01 a T07-05 completas en código local. [Acta de implementación y pruebas](../evidencias/t07-cierre-codigo-local.md). La aceptación física, impresión en papel y revisión con usuarios reales siguen pendientes. T08 no se inició.

**Objetivo:** el organizador y los administradores de equipo revisan su operación, generan listas/actas/reportes privados y resuelven observaciones sin introducir contabilidad ni cobros.

**Ampliación del propietario, 30/10/2026:** el área nueva Pagos lleva un registro privado y manual de multas a favor de la federación, ingresos recibidos y salidas del torneo. La multa pendiente es ingreso por cobrar y solo su cobro se suma a lo efectivamente ingresado. Esta ampliación no modifica las resoluciones deportivas ni introduce facturación de la plataforma. Véanse [decisiones](../01-decisiones.md) y [evidencia](../evidencias/pagos-demo-2026-10-30.md).

## Dependencias

T02: equipos/comisión; T03: buena fe y planilla; T05: actas; T06: disciplina. Seguridad y auditoría de T01 aplican a cada exportación.

## Tickets propuestos

1. **T07-01 Bandeja móvil de revisión.** Inscripciones, procedencias externas, listas, comisión, sanciones y actas pendientes con estado, responsable, plazo y siguiente acción.
2. **T07-02 Comisión y responsables.** Roles configurables (presidencia, secretaría, tesorería, vocalía u otros), vigencia y permiso de acceso separado del título de comisión. El admin de equipo propone; organizador aprueba asignaciones de cuenta.
3. **T07-03 Multas deportivas.** Registro de resolución, motivo, importe si el reglamento lo usa, sujeto y estado de notificación/revisión; sin pagos, saldos ni cierre financiero.
4. **T07-04 Exportaciones privadas.** Lista de buena fe, planilla de encuentro, acta y resumen disciplinario a PDF/CSV con alcance de equipo/torneo, fecha, versión y marca; cédula solo cuando perfil autorizado y finalidad lo exijan.
5. **T07-05 QA.** Denegar exportación de otro equipo, verificar versiones y datos personales, repetir descarga y revisar PDF móvil/impreso.

## Aceptación

- Admin de equipo ve solo su bandeja y presenta modificaciones; no aprueba su propia sanción ni cambia el resultado oficial.
- Un título de comisión no concede acceso automáticamente: el organizador debe asignar permiso separado.
- Exportar lista aprobada identifica versión y fecha; una lista posterior no modifica la anterior.
- El público no descarga reportes privados ni cédulas.

## Demostración

Equipo A presenta lista y comisión; organizador revisa, observa y aprueba; se exportan versión aprobada y acta. Intentar descargar desde Equipo B y usuario público produce denegación. **Puerta:** revisión y exportación auditables en móvil.
