# Tarjeta personalizada en el alta — 06/11/2026

- **Datos/migración:** ninguna. El reglamento ya admite hasta ocho tarjetas personalizadas y la tabla de tarifas ya dispone de importes personalizados. El alta convierte el código temporal de cada tarjeta a la clave de su categoría recién creada.
- **API:** la creación guarda reglamento y tarifa inicial en una transacción. Rechaza importes de tarjetas que no figuran en el reglamento. El permiso y el ámbito provienen de la organización de la ruta y la sesión.
- **UI:** botón discreto junto a los importes; formulario de tarjeta cerrado inicialmente. Nombre, color, multa y suspensión sugerida aparecen al tocar. Se puede quitar y ajustar el importe antes de guardar; los borradores se limpian al cambiar de cuenta.
- **Errores/vacío:** sin tarjeta adicional, el alta conserva amarilla y roja. El botón Agregar requiere nombre único y valores válidos; el servidor devuelve 400 para código ajeno. No hay cargo automático.
- **Pruebas:** `npm test` 83/83; creación permitida con tarjeta azul y tarifa inicial, código desconocido rechazado y acceso cruzado denegado. `npm run typecheck` y `npm run build` correctos. Botón y bloque expandido revisados en el navegador local móvil. Teléfono físico pendiente.
