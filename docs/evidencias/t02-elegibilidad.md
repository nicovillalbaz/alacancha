# T02-03 — Edad y documentos por categoría · 28/10/2026

**Estado:** incremento local verificado. T02 sigue en desarrollo; sin Docker ni despliegue.

## Función y datos

- El organizador decide expresamente si la categoría no tiene restricción de edad o fija edad mínima, máxima o ambas. Elige como referencia la fecha del partido o una fecha de corte fija. Puede marcar etiquetas sugeridas de documentos requeridos y agregar otras propias. No se guardan documentos ni datos de jugadores en el reglamento.
- Los límites y la fecha permanecen en el formulario al alternar opciones. Las etiquetas duplicadas muestran un aviso en el campo. Hay estado inicial «sin definir» para borradores históricos y un estado explícito «sin restricciones».
- No hubo migración: `rule_versions.rules` ya es JSONB versionado. Las reglas anteriores sin `eligibility` se leen como `null` sin modificar su JSON histórico. Una nueva versión publicada conserva intacta la versión anterior.

## API, permisos y estados

El contrato compartido valida fechas reales, mínimo menor o igual al máximo, etiquetas únicas sin distinguir mayúsculas, longitud de 2–80 caracteres y un máximo de doce. El servidor repite la validación al publicar. Permite guardar un borrador sin decisión, pero publicar exige decidirla; una restricción de edad necesita al menos un límite y la fecha fija cuando fue elegida. Solo el administrador activo del torneo, dentro de su organización, puede editar y publicar. La prueba nueva incluye acceso permitido y denegaciones de otro equipo/organización. El portal conserva la versión oficial anterior hasta publicar otra.

## Verificación

- `npm test`: **31/31**. Casos nuevos de borrador anterior, publicación incompleta, reglas válidas e inválidas, permisos cruzados, v1 estable y v2 modificada.
- `npm run build`: tipos de API/web y compilación Vite correctos.
- `npm run restore:check`: destino nuevo `torneos_restore_20261028_5f7283e6`, **22 archivos**, filas y checksums iguales a la fuente sintética, 2.637 ms; base original intacta.
- Navegador local: configuración 14–18 años con corte 31/12/2026, documento sugerido y documento personalizado; un duplicado mostró aviso. Alternar fecha del partido/corte fijo y edad sin/con límite recuperó los valores. [Matriz 320/390/768/1280 px](t02-elegibilidad-layout.json): un H1, cero `select`, sin desbordamiento horizontal ni botones visibles menores de 44 px. [Edad móvil](t02-elegibilidad-edad-movil.jpg) · [Documentos móvil](t02-elegibilidad-documentos-movil.jpg).

## Pendiente

T03 debe almacenar fecha de nacimiento y documentos privados, calcular años cumplidos según el reglamento aplicable y revisar excepciones; nada de eso se considera implementado por esta configuración. En T02 faltan tarjetas, walkover, desempates, fase inicial y uso de sedes/patrocinadores. Faltan zoom/texto al 200 %, teclado virtual, red inestable, lector de pantalla, prueba en teléfonos físicos y aceptación estética del propietario.

Actualización posterior del mismo día: tarjetas, walkover y desempates configurables avanzaron en el [incremento siguiente](t02-desempates-y-criterios.md); las tablas visibles continúan pendientes.
