# Sorteo y simplificación móvil — 04/11/2026

## Verificación

- `npm run backup` y `npm run restore:check` antes de migraciones 037 y 038. La última restauración aislada coincidió en 62 tablas y 675 archivos.
- `npm run db:migrate`: migraciones al día.
- `npm run typecheck` y `npm run build`: correctos.
- `npm run test`: 82/82. La prueba nueva crea cuatro equipos, solicita dos ruedas, comprueba seis Fechas privadas sin horario, verifica la advertencia antes de publicar, programa un encuentro y deniega la generación desde otra organización. El flyer individual exige nombre público y goles oficiales y deniega acceso cruzado.
- Vista local móvil en `http://127.0.0.1:4311/#/torneo/dc279f34-56a4-4e39-b1e1-aadda8403641/fixture`: selector Una rueda/Dos ruedas visible. El documento tuvo `scrollWidth = clientWidth` a 320, 390, 768 y 1280 px; captura visual revisada a 320 px. La muestra sintética permanece sin sortear para que el propietario pruebe ambas opciones.

## Alcance y pendientes

- El sorteo simple funciona para liga, grupos y copa directa sin siembra por posiciones. En copa crea cuadro y primera Fecha con partidos; la siembra por posiciones conserva su flujo de orden explícito.
- La programación en lote desde la UI envía cada partido de forma secuencial; si un horario genera conflicto, los ya programados quedan guardados y el resto puede reintentarse por separado. Falta una operación atómica de lote.
- No se agregó eliminación de partidos ni Fechas ya creadas; se conserva la edición de equipos y horario. Falta diseñar archivo recuperable para no borrar actas o historial.
- El importe por tarjeta personalizada se registra como multa manual; las tarifas automáticas siguen disponibles solo para amarilla y roja.
- Falta revisar el resultado y el flyer individual visualmente en un teléfono físico, además de teclado virtual, red inestable y texto largo. Los anchos indicados se probaron solo en el Fixture, no en todos los flujos nuevos.
