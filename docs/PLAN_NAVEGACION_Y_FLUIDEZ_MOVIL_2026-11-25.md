# Plan de navegación y fluidez móvil de A la cancha

**25 de noviembre de 2026. Implementación.** El primer recorrido es el panel del organizador y el del planillero. El portal público y la app instalada también se validan. [Investigación de Contobook](<C:/Users/info/Documents/nico/contobook/docs/PLAN_NAVEGACION_Y_FLUIDEZ_MOVIL_2026-11-25.md>)

## Cómo debe sentirse

Si entrás desde un enlace y pasás por **Equipos → Pagos → Fixture → Partidos → Estadísticas**, un solo **Atrás** del navegador te devuelve a la página desde la que entraste, si existe. Cada sección sustituye a la anterior en el historial. El teléfono aplica su comportamiento habitual cuando abriste la app directamente.

Si abrís un partido de **Jornada 4**, el primer **Atrás** cierra la ficha y te devuelve a J4, al mismo partido y con el selector intacto. El siguiente Atrás sale de la app o vuelve a la página anterior del navegador. Si cambiaste de pestaña dentro del partido o abriste el formulario de un evento, todo sigue siendo el mismo paso de detalle. La flecha de la app y el botón del navegador tienen el mismo destino cuando existe una lista de origen.

Al tocar una sección se responde enseguida con el encabezado, los controles y los datos disponibles para ese contexto. La consulta que falte carga en su lugar. Al volver a una lista se recuperan jornada, categoría, scroll, búsqueda y foco antes de revalidar. Si cambiaste de filtro, la pantalla muestra los datos del filtro nuevo cuando lleguen.

## Hallazgos previos a la implementación

| Hallazgo en el código | Trabajo previsto |
| --- | --- |
| El panel usa `pushState` para cada ruta en `go()`. El portal agrega entradas al cambiar de torneo y al navegar entre secciones. | Clasificar las acciones y darles una regla común en las entradas de Vue. [Panel](../apps/web/src/App.vue#L357) · [Portal](../apps/web/src/PublicApp.vue#L62) · [Navegación pública](../apps/web/src/public-navigation.ts#L81) |
| El regreso del partido ya guarda la selección y el scroll mediante el historial de la lista. | Reusar esa restauración al generalizar el regreso para planteles, formularios y demás fichas. [Estado del listado](../apps/web/src/match-list-navigation.ts) |
| El panel y el portal ya tienen cachés acotadas que comparten lecturas simultáneas. En el panel todavía hay escrituras que vacían toda la caché. | Medir primero. Luego invalidar los recursos afectados y mantener visibles los datos correctos durante la actualización. [Lecturas del panel](../apps/web/src/view-reads.ts) · [Lecturas públicas](../apps/web/src/public-reads.ts#L44) |
| Buena Fe ya muestra el dorsal de la inscripción. El alta lo acepta y la planilla puede guardar un dorsal propio del partido. | Agregar la edición del dorsal de la inscripción en la misma fila del plantel. [Pantalla del panel](../apps/web/src/App.vue#L2002) |
| **Crear y registrar acción** guarda en una transacción al jugador como borrador y el evento. La aprobación automática se aplica después, al oficializar el acta, a las altas rápidas que todavía tienen un evento activo en ella. La lista aprobada se crea en ese flujo solo si el equipo carecía de una previa. | Aprobar e incorporar el alta rápida desde que el servidor confirma la acción. Asegurar que figure también en la versión vigente de Buena Fe. [Alta rápida](../apps/api/src/app.ts#L3247) · [Aprobación por acta](../apps/api/src/app.ts#L3394) |

**Conteo de solo lectura en producción al 25/11/2026.** En Caacupé hay **22 altas rápidas activas, todas aprobadas**. De ellas, **3 no figuran en la última versión aprobada de la lista de su equipo**. Otras **34 inscripciones activas** están en borrador o presentadas y vienen de flujos distintos al alta rápida. El plan contempla incorporar las 3 fichas que faltan tras cotejar su equipo y su acta. Las demás siguen el flujo de revisión que les corresponde.

### Política de Atrás y enlaces directos

| Acción | Historial y destino |
| --- | --- |
| Cambiar de sección, torneo o pestaña dentro de la app | Una sola entrada base. Actualizar la URL con `replaceState` cuando sirva para recargar o compartir. Usar estado local para búsqueda, filtros y controles que solo importan en esa pantalla. |
| Abrir partido, jugador, equipo, acta o formulario desde una lista | Crear como máximo una entrada de detalle sobre esa lista. Si ya hay un detalle abierto, reutilizar su entrada. |
| Cerrar el detalle, guardar o cambiar de sección desde el detalle | Recuperar la entrada base conocida. Si elegiste otra sección, abrirla sobre esa misma entrada. Mostrar los datos confirmados cuando corresponda y conservar el borrador en la sesión cuando se pueda retomar. |
| Entrar a una ficha desde un enlace, un aviso, una recarga o WhatsApp | Resolver el torneo y el recurso con los permisos vigentes. Si falta una entrada de origen propia, la flecha interna abre la lista correspondiente sustituyendo la entrada actual. |
| Entrar al panel desde el portal, iniciar sesión o cambiar de organización | Mantener un destino válido y usar reemplazos para los saltos automáticos. El cambio de sesión u organización limpia el contexto privado anterior. |
| Usar Adelante | Una ficha vigente que acabás de cerrar puede reabrirse. Si guardaste o cancelaste el formulario, regresar al contexto vigente y descartar ese destino anterior. Las escrituras requieren una acción del usuario. |

Centralizar la decisión de crear, reemplazar o recuperar una entrada y la restauración de `popstate`. Reusar los enlaces y alias existentes. Guardar en `history.state` solo los identificadores de navegación, filtros no sensibles y el ancla o la posición. Mantener datos de formularios y búsquedas privadas en memoria de la sesión. Restaurar las filas visibles y después el foco y el desplazamiento. Cubrir `pageshow` y la vuelta desde otro documento. La regla de una entrada base y un detalle se aplica a las visitas nuevas. Las entradas de versiones anteriores siguen bajo control del navegador.

### Respuesta rápida y lecturas necesarias

1. **Pintar primero.** Mantener montadas las barras del panel y del partido durante las transiciones. Usar el marcador, los escudos y el resumen ya visibles al abrir una ficha. Pedir el acta, el historial, las estadísticas o los flyers cuando la vista los necesita. Mantener el contenido correcto visible al refrescar el mismo recurso.
2. **Reutilizar la consulta exacta.** Claves por sesión, organización, torneo, categoría, recurso y parámetros. En un regreso con datos frescos, cero lecturas de ese recurso. Con una vista vencida, una revalidación en segundo plano por clave. Compartir la solicitud en vuelo y cancelar o ignorar respuestas de destinos abandonados. Usar los 15 segundos vigentes como punto de partida medible.
3. **Actualizar por cambios concretos.** Dorsal → plantel y vista de captura que lo usan. Evento → acta y marcador. Resultado oficial → partido y proyecciones afectadas de clasificación, goleadores y disciplina, según el evento. Aplicar primero la respuesta confirmada y evitar que una lectura anterior la pise. Conservar el canal de actualizaciones del partido y la cola de eventos para cortes de red.
4. **Cuidar arranque y errores.** Mantener la separación de JavaScript entre portal y panel y la carga inicial rápida de Fixture. Tratar la primera lectura, el vacío confirmado y el error como estados distintos. Conservar la compatibilidad de la PWA durante un despliegue con dos versiones abiertas. Probar el caso de corte al descargar un fragmento y preservar los borradores de captura ante una recarga.

## Buena Fe y jugadores creados desde un resultado

### Editar o agregar el dorsal en la lista

- Mostrar **Agregar dorsal** o **Editar dorsal** junto al jugador. Abrir un campo numérico en esa fila con acciones de guardar y cancelar. Aceptar del **0 al 99** y un campo vacío para quitar el número.
- Guardar el dorsal en la inscripción de ese equipo y categoría. Validar el rol y la pertenencia en el servidor, usar la revisión de la inscripción para detectar ediciones concurrentes y auditar el cambio. Mantener el filtro, el foco y el scroll al guardar. Aplicar el valor confirmado a la lista y conservar el orden numérico donde se usa para captura.
- Mantener el dorsal específico que ya quedó congelado en una planilla o un acta. Probar la independencia de una misma persona inscrita en dos equipos o categorías.

### Aprobar y publicar en la misma alta rápida

- **Crear y registrar acción** debe confirmar, en una sola transacción, la inscripción aprobada en el equipo del partido, su incorporación a la Buena Fe vigente, el nombre deportivo publicable y el evento. Actualizar la lista aprobada por versión y conservar el historial. Una lista pendiente con otros cambios conserva su revisión.
- Aplicar las reglas de publicación de la competición, la privacidad del jugador y la protección de menores. Mostrar el nombre deportivo solo cuando corresponda. Resolver la decisión de visibilidad en el mismo alta en los casos que la requieran. La elegibilidad deportiva sigue usando el reglamento vigente y la aprobación del resultado tiene su propio flujo.
- Reusar la autorización de organizador de la ruta de alta rápida. Validar equipo participante, acta editable, límites y reglas de la planilla. Los reintentos deben devolver la misma inscripción y el mismo evento, incluso si después cambió el dorsal. Si falla un paso, se conserva el formulario para reintentar.
- Si falta conexión, mantener los datos ingresados y señalar el estado pendiente. Mostrar la aprobación y la publicación al recibir la confirmación del servidor.
- Auditar los registros anteriores por el rastro de alta rápida. Distinguir el estado aprobado de la presencia en la última Buena Fe, revisar los eventos anulados y aplicar correcciones explícitas por equipo con auditoría y ensayo previo. El tratamiento de borradores de otros flujos corresponde a su propia revisión.

## Orden de implementación y verificación

| Entrega | Criterio de salida |
| --- | --- |
| T05 y T03 · Alta rápida y dorsal | Una acción deja al jugador aprobado, incorporado a Buena Fe y con el nombre deportivo visible cuando corresponde. Editar, agregar o retirar dorsal en la misma fila. Probar reintento, dos ediciones concurrentes, permiso propio y denegación entre organizaciones. Cotejar actas históricas, fichas privadas y borradores ajenos al flujo. |
| T09 · Navegación | Desde una página de origen, cinco toques en secciones y un Atrás vuelven al origen. Abrir un partido de J4, cambiar de pestaña y volver conserva J4, el partido y el scroll. Probar flecha, Atrás, Adelante, enlaces directos, recarga, aviso y cambio de sesión. Hacer el mismo recorrido en un torneo habitual y uno por posiciones. |
| T09 · Rendimiento y estabilidad | Volver con datos frescos da cero GET del recurso. Con datos vencidos, como máximo un GET por clave y acción. Cinco cambios rápidos con red lenta dejan visible el último destino. Comprobar dos versiones durante un despliegue y el estado de la PWA sin red. |

Antes de tocar la navegación, levantar la línea base en el panel y en el portal. Repetir las mismas acciones después. Registrar **toque → primer cambio visible**, **toque → datos correctos utilizables** y **consultas por acción** con mediana y percentiles 75 y 95. Separar arranque frío de reapertura con datos conocidos. La primera meta es **100 ms en p75** para una respuesta visual con datos ya disponibles. Medir con red normal, red móvil lenta, CPU limitada y caché fría y caliente.

Probar teclado, nombres largos, anchos de 320/390/768/1280 px y movimiento reducido. Registrar el gesto Atrás en Safari de iPhone y Chrome de Android, en navegador y en la PWA. La aceptación en teléfonos físicos queda pendiente hasta ejecutar esas pruebas. [T03](tandas/03-jugadores-planillas.md) · [T05](tandas/05-partido-en-vivo.md) · [T09](tandas/09-piloto-lanzamiento.md)


## Implementación

- Las secciones principales reutilizan la entrada base y los enlaces conservan el alias público y la ruta interna. Una ficha abierta desde una lista conserva una sola entrada adicional. Los reemplazos y el regreso restauran la búsqueda de la sesión, los filtros y el desplazamiento existente.
- El panel comparte las lecturas y limita la invalidación al recurso modificado. Partidos muestra la vista conocida al abrir un acta. Equipos pide partidos de un equipo cuando se abre esa pestaña. Las estadísticas de formatos habituales consultan la categoría visible, y el cuadro carga al abrirse. Se conserva el canal en vivo.
- Buena Fe permite editar o retirar el dorsal desde la inscripción. El alta rápida confirma el jugador, su aparición en la Buena Fe aprobada, la decisión de visibilidad y el evento. Si hay una revisión pendiente, se arrastra íntegra a la siguiente versión con el alta incorporada. Un alta cuya respuesta se perdió admite reintento con los datos originales. El formulario en curso se puede recuperar durante una hora en la misma pestaña, con el mismo usuario, organización y partido.
- La conciliación de altas anteriores se limita a inscripciones aprobadas y activas, con el evento original vigente en un acta oficial. Se comprueba el conteo antes de escribir, con respaldo y ensayo de restauración.
