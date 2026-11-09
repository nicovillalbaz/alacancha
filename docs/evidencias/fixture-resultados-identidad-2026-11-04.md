# Fixture, resultados e identidad visual — 04/11/2026

## Alcance

- El Fixture lista cada Fecha con horario y cruces; Flyer y Editar permanecen junto a esa Fecha. Partidos muestra escudos o colores, marcador oficial u horario, y acceso directo al resultado.
- El resultado usa una composición central con marcador, equipos y goles separados bajo cada lado. La tabla de clasificación y los goleadores muestran posiciones y cifras alineadas, sin tarjetas flotantes. El portal público usa la misma jerarquía para resultados y tablas y muestra escudos autorizados o colores de referencia.
- La programación de los partidos restantes de una Fecha usa `schedule-batch` dentro de una sola transacción. Una colisión de equipo, cancha o árbitro revierte todos los cambios.
- Los partidos agregados a mano y sin planilla ni acta se pueden retirar y recuperar. Las Fechas privadas vacías también. Los cruces sorteados y las Fechas publicadas no admiten retiro: deben corregirse con los flujos de edición e historial existentes.
- Pagos versiona importes de tarjetas personalizadas por categoría y los ofrece como referencia al registrar una multa. El cargo y el ingreso efectivo siguen siendo asientos separados y manuales.

## Investigación visual

- [OneFootball, interfaz de tablas](https://onefootballsupport.zendesk.com/hc/en-us/articles/39365557084689-Learn-everything-about-the-new-Competition-Tables-Interface): posición visible y tabla simple/detallada. Se adaptó la jerarquía de posición, equipo y puntos.
- [Sofascore Torneo 2.0](https://www.sofascore.com/news/torneo-2-0-is-live-the-web-app-has-been-rebuilt-around-the-competition): competición como contexto y partidos/tabla/cuadro en su espacio. Se adaptó la proximidad de acciones a Fechas y partidos.
- [AiScore World Cup móvil](https://m.aiscore.com/world-cup): encuentros por etapa y grupo; columnas compactas y goleadores ordenados. Se adaptó su densidad de datos, sin seguimiento en vivo.

## Pruebas y límites

- Antes de la migración 039: `npm run backup` y `npm run restore:check`; restauración aislada con 62 tablas y 708 archivos, filas y huellas idénticas.
- Migración 039 aditiva; `npm run db:migrate` correcto.
- `npm run test`: 82/82. Nuevos casos comprueban lote atómico con conflicto, programación válida, aislamiento entre organizaciones, retiro/restauración y tarifas de tarjeta azul con rechazo de código ajeno.
- `npm run typecheck` y `npm run build`: correctos.
- Navegador local: Fixture, resultado, clasificación y portal revisados a 320, 390, 768 y 1280 px sin desbordamiento horizontal. Capturas: [Fixture](2026-11-04-fixture-mobile.png), [resultado](2026-11-04-resultado-mobile.png), [clasificación](2026-11-04-clasificacion-mobile.png), [portal](2026-11-04-portal-mobile.png).
- Pendientes de aceptación: teclado virtual, red inestable, nombres excepcionalmente largos, texto al 200 %, lector de pantalla, teléfonos físicos y decisión estética del propietario. T09 también conserva copia externa, revisión legal y piloto pendiente; este incremento no los da por cerrados.
