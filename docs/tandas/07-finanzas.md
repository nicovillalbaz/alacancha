# HISTÓRICO — antigua T07 de finanzas

> **No implementar esta guía histórica.** Fue reemplazada el 27/10/2026 por [T07 — control y exportaciones deportivas](07-control-y-exportaciones.md). La decisión del 30/10/2026 agregó un registro manual y privado de Pagos internos del torneo; no restablece el libro SaaS, conciliaciones ni pasarela descritos abajo. Véanse [decisiones](../01-decisiones.md) y [evidencia](../evidencias/pagos-demo-2026-10-30.md).

**Objetivo:** organizadores controlan deudas/cobros/gastos del torneo; plataforma controla por separado jornadas/cobros SaaS.

## Dependencias

T04: cargos SaaS; T06: multas aprobadas; T01: autorización y auditoría. Revisar V03/V05 de [decisiones](../01-decisiones.md) antes de uso comercial real.

## Tickets en orden

1. **T07-01 Libro del torneo.** Cargos a equipo (inscripción, arbitraje, cuota, multa), vencimiento, estado, gastos/ingresos generales; dinero entero PYG.
2. **T07-02 Pagos.** Comprobante privado, pendiente/confirmado/rechazado, pago parcial, asignación a varios cargos, saldo y anticipo según política. Reverso/ajuste con actor y motivo.
3. **T07-03 Vistas.** Organizador: cuenta por equipo/fecha/torneo, caja/balance, filtros y exportación. Delegado: solo su cuenta y recibos; público: nada privado.
4. **T07-04 Libro SaaS.** Precio histórico, cargos por jornada, créditos/ajustes, recibos internos, pagos manuales y conciliación de superadmin. El owner ve su cuenta, no cuentas ajenas.
5. **T07-05 Documentos y QA.** PDF/CSV de cuenta/recibo con acceso privado; tests de importes, asignaciones, reverso, concurrencia, permisos y diferencia entre las dos contabilidades.

## Aceptación

- Un cargo de Gs. 100.000 con pago confirmado de Gs. 40.000 deja Gs. 60.000; adjunto pendiente deja Gs. 100.000.
- Reverso conserva pago original y saldo correcto; no se borra físicamente.
- Delegado A no ve cuenta de equipo B; finanzas del torneo no alteran deuda SaaS.
- Superadmin ve jornadas cobradas/pendientes con versión de precio y sin duplicados.

## Demostración de salida

Crear cargos/una multa, confirmar pago parcial, revertir uno con motivo, exportar estado de cuenta y consultar por delegado. En otro panel, conciliar cargo SaaS de jornada. **Puerta:** libros separados y saldos auditables.
