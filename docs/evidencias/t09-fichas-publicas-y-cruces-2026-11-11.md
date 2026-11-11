# Cruces y equipos de Caacupé antes del sorteo

**Estado:** código desplegado en `18e062f` el 11/11/2026; aceptación en teléfono físico pendiente.

## Alcance

- En la Copa pública, cada equipo abre una ficha con escudo y jugadores publicados. Sin inscripciones públicas, muestra «Aún no hay jugadores publicados.»; no expone documentos ni fechas de nacimiento.
- Los cruces planificados abren una vista de partido aun sin acta oficial. Cuando exista partido oficial, su ficha usa ese partido. La cabecera del torneo se oculta dentro del detalle.
- En la administración, «Partidos» muestra los cruces del plan por jornadas o fechas, con detalle de los pendientes y acceso a los partidos oficiales.
- La API pública comprueba organización activa y pertenencia del equipo a la instantánea publicada. Una consulta de otra organización recibe 404.
- No hay migración. La revisión pública 21 conserva 0/10 puestos asignados porque el sorteo anterior fue una prueba que el propietario retiró; no se restauró ni editó.

## Verificación

- `npm run typecheck`, `npm run build`, `npm test` (98/98), `npm run audit:routes` (163 rutas, 0 sin clasificar) y `git diff --check`: correctos.
- Navegador local: apertura de un cruce y de la ficha de 8 de Diciembre; vista vacía sin jugadores. Se revisaron anchos de 320 y 390 px sin desbordamiento visible.
- HTTPS de producción: `/ready` 200, `/fcfs-copacaacupe` 200 y ficha pública de 8 de Diciembre 200 con `[]`. En navegador publicado, «Equipos» abrió el equipo y mostró «Aún no hay jugadores publicados.»; «Partidos» muestra los cruces como botones.
- Falta la prueba en Android/iOS reales, con red inestable, teclado y texto largo.
