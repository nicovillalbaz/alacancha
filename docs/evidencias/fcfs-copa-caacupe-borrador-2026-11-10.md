# Copa Caacupé: carga local privada — 10/11/2026

## Alcance y estado

En `torneos_local` se creó la Federación Caacupeña de Fútbol de Salón, su organizador `usuariofcfs`, la Copa Caacupé - Cooperativa Serrana (edición 2026, categoría Libre) y los diez equipos del afiche con nombres aclarados en [fuentes](../fuentes-fcfs-2026.md). Se cargaron el logo de la Federación Caacupeña y el emblema de la Copa; los escudos individuales siguen pendientes porque el archivo recibido es un afiche compuesto. No se crearon jugadores, grupos, partidos, fechas ni resultados. El torneo y su reglamento siguen en borrador y no figuran en el catálogo público.

Después de la carga, el propietario añadió [DOCX y Excel](../fuentes-fcfs-2026.md): dos grupos de cinco, cinco interseriales por posición que puntúan en ambas tablas de grupo, cuatro clasificados por grupo, cuatro cuartos a partido único y un cuadrangular todos contra todos entre sus ganadores. **La tabla general de la primera etapa, con los diez equipos e interseriales, ordena a los cuatro ganadores de cuartos** para fijar los cruces del cuadrangular. Un partido extra requiere empate por el título y decisión manual Sí/No del organizador; no se crea automáticamente. Faltan ubicación de clubes y criterios de desempate. `initialPhase` y `competitionPlan` permanecen en `null` para no presentar el motor actual de grupos + llave como formato aprobado. Los demás valores deportivos del borrador son provisionales. La publicación rápida de reglas en la UI exige que se defina la fase inicial; no la convierte automáticamente en liga.

## Incremento vertical

| Capa | Implementación y verificación |
|---|---|
| Datos / migración | `042_tournament_emblem.sql` agrega `tournaments.emblem_id` con clave foránea compuesta al medio de la misma organización. La migración es aditiva. Los nombres de equipos se pueden corregir sin cambiar sus IDs. |
| API | Carga privada del emblema de torneo y lectura privada; lectura pública solo con organización, torneo, edición, categoría y reglamento publicados. El logo de la organización tiene lectura pública bajo la misma condición de torneo publicado. `PATCH` de nombre de equipo registra auditoría y evita duplicados. |
| UI | Emblema editable en Ajustes del torneo; emblema en el selector público cuando corresponde. Logo de organización en la entrada pública. Nombre de equipo editable desde la ficha. La Copa borrador no aparece al aficionado. |
| Permisos | Escritura de emblema y nombre reservada al organizador activo de su organización. La lectura del borrador requiere acceso privado; el endpoint público devuelve 404. Integración cubre acceso permitido y denegado desde otra organización y desde administrador de equipo. |
| Error / vacío | Archivo limitado a PNG/JPG/WebP y 2 MB. Sin emblema se usa el icono existente. El cargador aborta ante conflicto de usuario, respuesta API fallida, torneo que dejó de ser borrador o presencia inesperada en catálogo público. Se puede ejecutar otra vez sin duplicar la carga. |
| Pruebas | `npm run fcfs:draft` comprobó diez equipos, cero partidos, emblema presente, fase/reglas borrador y ausencia pública. `npm test`: 85/85; `npm run typecheck` y `npm run build`: correctos. `git diff --check`: sin errores. |

Antes de la carga se creó el respaldo cifrado `.local/backups/torneos-1794307476053-8ddf636c.backup`; se restauró en `torneos_restore_20261110_ebc1ac41` y coincidieron 62 tablas, un archivo y las comprobaciones de filas/huella. Tras cargar los emblemas se hizo el respaldo `.local/backups/torneos-1794308068765-b30edc3b.backup` y se restauró en `torneos_restore_20261110_404eef87`, con 62 tablas y dos archivos coincidentes. No se borraron datos sintéticos.

Identificadores locales: organización `6cc4a065-092d-4430-93ee-1ee455c4c2c0`, torneo `9b464e92-2721-4481-aa08-f2fab5a228f0`, categoría `7f5babf5-67dd-4028-b946-00f4ffd768de`. El acceso local generado está en `.local/fcfs-access.txt`, ignorado por Git; no se envió contraseña por correo ni se incluyó en esta evidencia. El script `npm run fcfs:draft` está limitado a `127.0.0.1:55461/torneos_local` y a la cuenta superadmin de muestra; no es un importador de producción.

**Pendientes:** implementar y validar el formato real de tres etapas y el control manual del partido extra; confirmar jerarquía de desempates y empate múltiple; asignar clubes a posiciones cuando se anuncien; preparar escudos individuales; probar a 320/390 px con teclado, red inestable y teléfono real; decidir publicación. La agrupación pública FPFS tampoco está implementada.
