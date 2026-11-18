# Alta rápida y lectura de eventos — 18/11/2026

## Alcance

- **Dato:** sin migración de esquema. La aprobación del acta inserta la decisión de nombre público para altas rápidas auditadas que aparecen en eventos vigentes. La ficha de buena fe sigue pendiente. Las decisiones manuales existentes prevalecen.
- **API:** operación transaccional y acotada por organización/partido; el evento y el alta deben pertenecer al acta oficial. La regularización de actas anteriores usa `scripts/backfill-quick-player-publications.sql` tras respaldo y ensayo de restauración.
- **UI:** aviso preciso al crear jugador y estado «Buena fe pendiente» en la lista privada. Un componente común presenta PT/ST, equipos a izquierda/derecha, nombre, acción y minuto si consta, en ambas vistas públicas.
- **Permisos:** el alta y la aprobación conservan los controles existentes; la prueba niega el alta desde otra organización. El público no recibe fecha de nacimiento ni documento.
- **Errores/vacío:** si no hay eventos se muestra «Sin eventos registrados». Un evento sin tiempo se muestra en «Sin tiempo»; un lado desconocido no se asigna a un equipo inventado. Si la aprobación falla, la publicación se revierte con la transacción.

## Verificación

La prueba de integración comprueba reintento idempotente, evento y alta en una transacción, nombre antes/tras aprobación, ocultación manual, equipo y período públicos, y buena fe todavía pendiente. Ejecutar `npm run typecheck`, `npm run build` y `npm test` en entorno con PostgreSQL local. Revisar la vista en 320 y 390 px, con teclado, texto largo y red inestable; la aceptación física en teléfono sigue pendiente.

## Despliegue y datos reales

- Commit `f5166da` publicado y compilado en el VPS. `torneos-api`, `torneos-worker` y ambos servicios de ensayo activos; `/ready` y la ruta pública de Caacupé responden 200. Sin errores en el journal de API durante los diez minutos posteriores a la actualización.
- Copia `initial-20261118T110133Z.dump`: restauración de 71 tablas comprobada. En otra base descartable, el SQL regularizó 9 nombres y 9 auditorías; repetirlo dio 0 inserciones. Se aplicó después en producción con el mismo conteo 9/9.
- La API pública de Caacupé devuelve dos resultados oficiales, 16 eventos nombrados con lados local/visitante y períodos PT/ST (un evento sin período permanece sin tiempo). Sus dos marcadores 4:1 suman diez goles; goleadores y competición suman diez, la clasificación registra cuatro participaciones y valla cuatro equipos con partido. Esta comprobación cubre proyecciones de datos, sin sustituir la revisión visual física pendiente.
