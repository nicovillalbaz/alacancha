# Rondas y apertura de partidos — 06/11/2026

## Cambio local

- Las jornadas de eliminación muestran su ronda en Fixture y Partidos, en el panel del organizador y en el portal. Fixture y Partidos del panel cargan el cuadro de cada categoría para resolver el nombre. Ida, Vuelta y Desempate distinguen jornadas de la misma ronda. Liga y grupos conservan «Fecha N»; una jornada mixta no recibe un nombre de ronda inexacto.
- El cuadro público entrega únicamente identificadores de partidos de jornadas publicadas. Tocar la llave abre el encuentro publicado más reciente; los resultados de Ida, Vuelta o Desempate abren ese partido exacto. Cruces futuros permanecen sin botón.
- El detalle público del partido indica ronda y tramo. No se cambiaron actas, resultados, reglas ni datos persistidos; no hubo migración.

## Verificación

- `npm run typecheck`, `npm run build`, `npm run test`: 83/83 pruebas. `npm run demo:verify`: 15, 5 y 13 partidos oficiales en los tres torneos terminados; los IDs expuestos por cada llave pertenecen al fixture público. La integración confirma IDs publicados y ausencia de acceso en llaves futuras; mantiene el caso de organización ajena denegada.
- En el navegador local, la copa por grupos mostró «Semifinales» y «Final» donde antes decía «Fecha 4/5»; tocar una semifinal del cuadro abrió su detalle. La copa directa mostró «Semifinales · Ida», «Semifinales · Vuelta» y «Final»; los accesos de Ida y Vuelta abrieron encuentros distintos con sus resultados y fechas respectivos.
- A 320 px, la lista y el cuadro no produjeron desbordamiento horizontal (`scrollWidth = clientWidth = 320`). La aceptación en teléfono físico, teclado virtual, red inestable y texto ampliado queda pendiente.
