# Formato por posiciones reutilizable — 16/11/2026

## Datos y API

La migración 055 añade `group_size` con valor 5 para los planes existentes y permite posiciones A/B1–8. El plan nuevo elige de cuatro a ocho equipos por grupo. La API genera las posiciones, valida la ronda inicial, guarda la versión, publica una instantánea y calcula el umbral de resultados desde `group_size²`. Exige un cruce único por cada pareja del mismo grupo, un interserial por posición, ocho plazas distintas de cuartos y seis parejas distintas del cuadrangular. Las decisiones de desempate admiten hasta 16 equipos.

## UI, permisos y errores

La vista del organizador muestra la cantidad de posiciones y partidos de apertura del plan; Fixture y Estadísticas dejan de usar 10/25 como umbral. La ruta valida organización y categoría en el servidor. Los tests niegan creación y lectura desde otra organización, y rechazan una posición que no existe en un plan de 12 equipos. Planes incompletos o con cruces repetidos devuelven error de validación. No se crean resultados al publicar el sorteo.

## Verificación

- Copa existente: 10 posiciones, 25 cruces de grupos, 4 cuartos y 6 del cuadrangular; preserva la estructura y las publicaciones previas.
- Copa sintética: 12 posiciones y 36 cruces de grupos con 4 cuartos y 6 del cuadrangular; verifica interserial, puntos, lectura, apertura y aislamiento.
- `npm test`: 105/105; `npm run typecheck` y `npm run build`: correctos.
- Aceptación física móvil, teclado, red inestable y texto largo: pendiente.
