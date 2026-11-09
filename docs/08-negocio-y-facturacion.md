# HISTÓRICO — planteamiento comercial reemplazado

> **No usar para implementación.** El propietario retiró cobros, facturación, créditos y pasarelas del producto planificado el 27/10/2026. Este archivo se conserva solo para trazabilidad de la planificación previa. El plan vigente está en [activación y control manual](08-activacion-y-control.md).

## Precio confirmado

La única tarifa inicial es **Gs. 20.000 por fecha/jornada del torneo**, todas las funciones incluidas. No hay planes, mensualidad obligatoria, cobro por equipo/jugador/árbitro ni recargo por mover un partido. 8 jornadas = Gs. 160.000; 10 = Gs. 200.000; 15 = Gs. 300.000. Estas cifras son aritmética del precio acordado, no una validación de mercado.

## Definición operativa propuesta

Una `tournament_round` es jornada oficial de una edición. Puede reunir partidos de varias categorías, canchas y días naturales. El hecho facturable ocurre **una sola vez**, al publicarla por primera vez. Un borrador o simulación no factura. Reprogramar, agregar un partido pendiente o republicar no crea otro cargo. Distintos torneos tienen jornadas independientes, aunque ambos digan “Fecha 1”. Antes de T04 hay que validar con organizadores cómo agrupar categorías con calendarios diferentes.

## Publicación transaccional

1. Mostrar al admin estado, importe, regla aplicada y resumen antes de confirmar.
2. Verificar permiso, jornada, edición, estado comercial y clave de idempotencia.
3. En una transacción bloquear/proteger jornada, fijar primera publicación y crear `saas_round_charge` único de Gs. 20.000 asociado a versión de precio; consumir crédito si esa política está habilitada.
4. Guardar auditoría y outbox. Reintento/doble clic devuelve el resultado ya creado.
5. Si se modifica el precio más adelante, nueva versión solo afecta jornadas futuras; cargos históricos quedan intactos.

Una anulación posterior no borra el cargo: el superadmin registra crédito/ajuste/reverso con motivo y política visible. Los casos especiales aún se validan comercialmente. Los pagos se reciben/concilian manualmente; adjuntar un comprobante no confirma por sí solo el cobro. Recibos internos deben identificarse correctamente y no hacerse pasar por factura fiscal.

## Dos contabilidades independientes

| Cuenta | Acreedor/deudor | Ejemplos | Acceso |
|---|---|---|---|
| Finanzas del torneo | Organizador ↔ equipos/clubes | Inscripción, arbitraje, multas, pagos parciales, gastos, entradas registradas | Organizador/finanzas; delegado solo su equipo. |
| Cuenta SaaS | Plataforma ↔ organizador | Gs. 20.000 por jornada publicada, créditos, ajustes, pagos manuales | Superadmin y vista de cuenta del organizador. |

No reutilizar una tabla de pagos como si ambos libros fueran el mismo. Dinero en enteros PYG; cargos, pagos, asignaciones y ajustes con referencias. Pago parcial reduce saldo según asignación, sin alterar el cargo original. Reverso conserva historia y requiere permiso/motivo.

## Casos de aceptación

- Dos publicaciones concurrentes de la misma jornada generan **un** cargo; un segundo intento confirma el primero.
- Una jornada con tres categorías cuesta Gs. 20.000; mover un partido a otro día cuesta Gs. 0 adicionales.
- Fecha 1 de otro torneo crea cargo propio.
- Cambiar precio futuro no altera importes emitidos.
- Comprobante pendiente no se contabiliza como confirmado; pago parcial y reverso conservan saldo y auditoría correctos.
- Delegado no consulta cuenta SaaS global ni deudas de equipos ajenos.
