# T02-03 — Cambios y reingreso · 28/10/2026

**Estado:** incremento local verificado. T02 sigue en desarrollo; sin Docker ni despliegue.

## Función

- El administrador de torneo configura en cada categoría si no hay sustituciones, si hay una cantidad limitada o si son ilimitadas. Puede fijar ventanas y permitir o impedir reingreso. La interfaz muestra opciones cortas como botones; conserva cantidad, ventanas y reingreso al alternar entre limitado e ilimitado durante la edición.
- `none` exige cero cambios, sin ventanas ni reingreso. `limited` exige 1–100 cambios; ventanas opcionales 1–20, sin superar la cantidad de cambios. `unlimited` no lleva cantidad máxima, pero puede tener ventanas. Las etiquetas F5/F11 no eligen esta regla automáticamente.
- Una categoría puede guardar un borrador sin elegir modalidad. Publicar exige la decisión y un motivo. Las reglas anteriores que carecen del campo se leen como sin definir, sin alterar el JSON de su versión publicada. Una v2 cambia la modalidad sin reescribir la v1.

## Datos, API, permisos y estados

No hubo migración: `rule_versions.rules` ya almacena JSONB versionado. El contrato compartido valida combinaciones y el servidor valida otra vez al publicar. Solo el organizador activo de la organización puede crear/editar/publicar reglas; los casos permitidos y denegados entre organizaciones siguen cubiertos. El editor muestra estado sin definir y aviso de ventanas incompatibles; la API devuelve error específico si se intenta publicar sin elegir. Las sustituciones reales y el consumo de cupos se implementarán con el acta T05.

## Verificación

- `npm test`: **29/29**. El caso nuevo cubre configuración inválida, lectura de borrador antiguo sin el campo, publicación obligatoriamente configurada, permisos ajenos, v1 pública estable y v2 con modo distinto.
- `npm run build`: TypeScript de API/Vue y Vite correctos.
- `npm run restore:check`: destino nuevo `torneos_restore_20261028_ed49fad4`, **18 archivos** y filas/huellas iguales a la fuente sintética, 2.629 ms; base de prueba original intacta.
- Navegador local: sin definir → limitado → ilimitado → limitado recuperó 4 cambios, 2 ventanas y reingreso; 5 ventanas mostró aviso cuando solo había 4 cambios; “sin cambios” ocultó campos. [Matriz 320/390/768/1280 px](t02-cambios-layout.json): un H1, cero `select`, sin desbordamiento horizontal ni controles visibles menores de 44 px. [Limitados en móvil](t02-cambios-limitados-movil.jpg) · [Error en móvil](t02-cambios-error-movil.jpg).

## Pendiente

Definir modalidad volante si un torneo la requiere; completar tarjetas, edad/documentos, walkover, desempates, fase inicial, sedes y patrocinadores. El control real de sustituciones pertenece a T05. Quedan pendientes zoom/texto al 200 %, teclado virtual, red inestable, lector de pantalla, teléfonos físicos y aceptación estética.

Actualización posterior del mismo día: la configuración de edad/documentos se realizó en el [siguiente incremento](t02-elegibilidad.md); la validación de cada jugador queda para T03.
