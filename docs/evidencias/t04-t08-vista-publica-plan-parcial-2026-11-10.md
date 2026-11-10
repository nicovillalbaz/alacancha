# T04/T08 — Plan parcial de Copa Caacupé en público

Fecha: 10/11/2026. Estado: código y base local verificados; prueba física pendiente.

## Datos y publicación

- Sin migración nueva. `fixture_position_publications.snapshot` conserva diez posiciones, diez clubes activos y los 35 cruces del plan; las posiciones no asignadas permanecen `null`.
- El organizador publicó la revisión actual mediante **Publicar vista pública** con 0/10 posiciones. El portal local muestra el plan; ningún partido, reglamento o resultado se volvió oficial por este acto.
- La categoría existente de la Copa Caacupé cambió de «Libre» a «Primera», restringida por organización y torneo. El cargador local nuevo crea «Primera» y corrige esa edición si aún figura «Libre».

## API, UI y permisos

- La API permite la publicación parcial con revisión esperada, guarda una instantánea inmutable y entrega al público solo los clubes y escudos incluidos en ella. Otros ámbitos y administradores de equipo no pueden publicarla.
- El portal presenta Partidos por jornada, Fixture con Fechas/Jornadas y Clasificación con Grupos A/B, Cuartos, Cuadrangular y Tabla general. Sin actas aprobadas se ven referencias y valores pendientes. Goleadores y Valla muestran su vacío; Equipos lista diez clubes con escudo.
- Los partidos publicados con resultado conservan acceso al detalle. Un cambio privado de asignaciones requiere publicar una nueva revisión para llegar al portal.
- El portal no recibe documento, nacimiento, lista de buena fe, correo ni contraseña.

## Comprobación

- `npm run typecheck`: correcto. `npm test`: 92/92. La prueba nueva cubre 1/10 posiciones asignadas, 35 cruces, diez clubes, datos pendientes y rechazo entre organizaciones; la prueba existente conserva versionado y actualización del sorteo completo.
- Navegador local: 35 cruces ordenados; F1 con J1/J2 y sus dos fechas previstas; cuatro cuartos, seis cruces y cuatro puestos pendientes del cuadrangular; tabla general de diez lugares. Escudos: 10/10. Equipos en admin: «Primera».
- Sin desborde horizontal en 320, 390, 768 y 1280 px; navegación a Clasificación/Tabla general con teclado. Nombres largos observados en la lista de equipos. La red inestable y el dispositivo físico siguen pendientes.

## Pendiente deportivo

La asignación de A1–B5, el reparto J1/J2, la confirmación de desempates y la publicación del reglamento dependen de la organización. Las estadísticas oficiales aparecerán únicamente desde actas y jornadas publicadas.
