# T01 — Corrección de contadores y tiempos · 28/10/2026

Observación del propietario sobre el primer prototipo: retirar bloques como «4 Equipos / 41 Jugadores / 4 de 6 Jornadas» y admitir registro por tiempo, con minuto vacío si no se conoce.

**Revisión posterior:** la [carga continua](t01-carga-continua.md) sustituye los desplegables y la selección/confirmación individual de este corte por equipos con escudo, PT/ST/TE y altas consecutivas desde la misma vista. Las capturas de este documento conservan el estado anterior.

## Cambios

- Retirados los bloques de totales del inicio y del superadmin, junto con sus estilos sin uso. Los listados mantienen su información contextual.
- Eliminado el minuto fijo del marcador. La muestra indica captura abierta/finalizada y resultado provisional; no representa una transmisión en vivo.
- Gol/tarjeta ofrece **Primer tiempo, Segundo tiempo, Tiempo extra** o **Sin especificar**. Los períodos definitivos dependerán del reglamento.
- Minuto vacío, opcional y dentro de «Agregar minuto». Se guarda como `null` cuando se omite; no se convierte en cero. Cambiar equipo conserva período y minuto ingresados.
- Eventos, mensaje de deshacer y acta omiten el minuto desconocido y muestran el período disponible. La secuencia de eventos se conserva sin exigir un minuto.

## Verificación dirigida

- Sintaxis de `app.js` comprobada con `node --check`.
- Gol en segundo tiempo sin minuto: se guarda, actualiza marcador y el acta muestra «Segundo tiempo», sin minuto inventado.
- Tiempo extra sobrevive al cambio de equipo y aparece como `TE` en eventos.
- Evento sin período ni minuto: momento visual vacío. Minuto `0` introducido expresamente: aparece `0′` y se distingue del desconocido.
- Campo de minuto inicialmente vacío, no obligatorio y contraído.
- Inicio, formulario de evento y acta a 320, 390 y 1280 px: nueve combinaciones sin desbordamiento horizontal y sin bloques de totales. [Registro](t01-ajuste-tiempos-layout.json).
- Consola sin errores ni advertencias observadas en el recorrido.

Capturas vigentes: [inicio sin totales](t01-ajuste-tiempos-inicio.jpg) y [formulario de evento por tiempo](t01-ajuste-tiempos-evento.jpg). Las capturas de la entrega inicial conservan el estado anterior a esta observación.

Datos/migración: siguen siendo sintéticos y en memoria; no hay migraciones. API/permisos: sin cambios, continúan pendientes en servidor. No se acredita autorización entre organizaciones, PWA offline o aceptación física. T01 sigue en preparación visual.
