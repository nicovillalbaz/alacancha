# Nombre de equipo corregible — 10/11/2026

La Copa Caacupé incluye nombres provisorios; el organizador necesita corregirlos después sin recrear el equipo ni perder su participación.

| Capa | Cambio y evidencia |
|---|---|
| Datos / migración | Sin migración. `teams.name` ya existía; la corrección conserva ID, inscripciones, escudo, jugadores y referencias deportivas. El cambio se audita con nombre anterior y nuevo. |
| API | `PATCH /api/v1/organizations/:id/teams/:teamId` acepta solo `name` de 2 a 120 caracteres; devuelve 404 si el equipo no pertenece a la organización, 409 ante otro nombre igual y 400 ante entrada inválida. Repetir el mismo nombre es inocuo. |
| UI | «Editar nombre» junto al título de la ficha; el campo se abre únicamente al tocar. Guardar actualiza las listas. No se agrega otra tarjeta ni un motivo obligatorio. |
| Permisos | Solo `tournament_admin` activo de la organización seleccionada. El `team_admin` y un organizador de otra organización reciben 403. El ID de organización enviado por el cliente no concede acceso. |
| Estados | El campo conserva el texto si falla el guardado; cerrar cancela el cambio local. La vista pública muestra solo equipos que cumplen sus permisos de publicación habituales. |
| Pruebas | `npm run typecheck` y `npm run build` correctos. Prueba de integración específica: corrección, repetición, nombre inválido, duplicado y tres accesos denegados; 4/4 archivos de prueba ejecutados, sin fallas. |

**Pendiente:** revisión visual a 320/390 px, teclado y teléfono físico. No se publicaron torneos ni se crearon grupos o fechas. Los diez nombres del afiche y sus niveles de certeza constan en [fuentes FCFS](../fuentes-fcfs-2026.md).
