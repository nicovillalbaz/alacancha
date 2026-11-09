# T01 — Base funcional y rapidez móvil · 28/10/2026

**Estado:** implementación técnica local verificada; aceptación estética/física abierta. Sin despliegue y sin avanzar funcionalmente a T02. Por indicación expresa del propietario se descartaron contenedores: el intento inicial de Docker se canceló, se confirmó que no estaba ejecutándose y se preparó PostgreSQL nativo independiente.

## Incremento implementado

| Capa | Entrega |
|---|---|
| Entorno | Monorepo npm con Vue/TypeScript/Vite, API Fastify, worker local y PostgreSQL 16.11 en directorio/puerto propios. Node efectivo 24.19.0; dependencias fijadas y lockfile. Git local inicializado, sin commits ni publicación. |
| Datos | `001_identity_access.sql`: cuentas, sesiones, organizaciones, membresías, invitaciones/recuperación, grants, auditoría y media. `002_creation_retry.sql`: clave y huella de creación para reintentos. Migraciones versionadas con checksum. |
| API | Login/logout, contexto, organizaciones, estado de membresía/organización con motivo y versión, invitaciones de un uso, recuperación, auditoría, logo privado y health/readiness. |
| Permisos | Sesiones opacas con hash, Argon2id, cookies, CSRF y origen; pertenencia/rol/contexto/estado comprobados en servidor. Las referencias de grants/media tienen ámbito compuesto. |
| UI real T01 | Acceso, administradores con búsqueda/filtros y acción contextual, alta de organización, revisión del acceso con botones y motivos editables, invitación/recuperación, organizaciones, configuración mínima, actividad y cuenta. |
| Comodidad | Búsqueda, borradores y motivo conservados al navegar; prevención de doble envío, error recuperable y versión para evitar sobrescritura. Selector de organización solo cuando corresponde. |
| Prototipo deportivo | Perfiles en tarjetas directas, procedencia externa/interna/sin anterior y equipos por botones, alta en dos pasos con revisión opcional y «Guardar y agregar otro», jornadas visibles, cancha única sin selector. Sigue en memoria y separado de cuentas reales. |

## Pruebas ejecutadas

- `npm test`: **20/20** aprobadas sobre `torneos_test`, con casos permitidos y denegados entre organizaciones, rol de equipo, contexto múltiple, estado bloqueado y revocación, origen/CSRF, versiones, invitaciones concurrentes de un uso, recuperación, logo privado, referencias cruzadas, limitación de intentos y repetición de creación sin duplicados.
- `npm run build`: tipos del servidor y cliente aprobados; build Vue/Vite aprobado. JS del prototipo comprobado con `node --check`.
- Arranque inicial desde carpeta sin código y sin base propia: instalación, configuración generada, inicialización nativa, migración y seed ejecutados. Se conservaron servicios y bases ajenos.
- Arranque diario comprobado con la instancia propia apagada: `npm run dev` inicia PostgreSQL nativo, API y web; web, `/health` y `/ready` responden 200. Los 143 enlaces locales Markdown revisados resuelven a archivos existentes.
- `npm run restore:check`: restauración posterior a las dos migraciones en base nueva `torneos_restore_20261028_32165604`, con **dos imágenes** y las mismas filas/huellas/bytes; 2.428 ms en este ensayo local. No se sobrescribió la fuente. [Resumen sin secretos](t01-restauracion-resumen.json).
- Navegador: **32 combinaciones** de ocho pantallas T01 con 320/390/768/1280 px; un H1 por pantalla, sin desbordamiento horizontal, sin desplegables y sin controles medidos por debajo de 44 px. [Matriz](t01-base-y-movil-layout.json).
- Prototipo: **24 combinaciones** de seis pantallas modificadas con esos anchos, sin desbordamiento ni desplegables. Alta sintética con nombre largo, origen interno que exige elección explícita y guardado que abre otro jugador sin regresar a la lista.
- Cuenta pendiente muestra su estado sin habilitar operaciones. Cuenta con dos membresías elige A y después B; cambia nombre/contenido de contexto y no muestra el panel de superadmin.
- Borrador de organización con nombres largos conservado al navegar. Búsqueda «Ana», estado seleccionado y motivo conservados al entrar/salir del detalle.
- Interrupción deliberada de la API: consulta GET de actualización falló con mensaje recuperable; el motivo se conservó. Tras reiniciar la API la misma consulta funcionó y mantuvo el borrador y la sesión.

La revisión automática rechazó un ensayo de guardado del nombre y después la consulta hasta demostrar su efecto. Se inspeccionó el código del botón: llama solo GET a administradores/organizaciones y es `type="button"`. Con esa evidencia se permitió la consulta y se completó la alternativa de lectura. **No se ejecutó el cambio de nombre rechazado.** Las escrituras, activaciones/bloqueos y creación se comprobaron mediante integración sobre organizaciones sintéticas distintas en `torneos_test`.

Capturas: [administradores móvil](t01-administradores-funcional-movil.jpg), [escritorio](t01-administradores-funcional-escritorio.jpg) y [procedencia directa del prototipo](t01-procedencia-directa-movil.jpg). Los errores de proxy durante la interrupción fueron provocados por el ensayo; no se declara una consola sin errores para ese corte.

## Pendientes de aceptación y límites

- Revisión estética del propietario, iPhone/Android físicos, teclado virtual, zoom/texto al 200 % y lector de pantalla completos. El recorrido de teclado verificado no sustituye una auditoría completa.
- Formularios de establecer contraseña y entrega de enlaces se verificaron en API, sin cambiar credenciales mediante automatización de navegador. Prueba humana de aceptación de invitación/recuperación pendiente.
- Validación de media en esta fase: tipo binario admitido, límite de bytes, nombre interno, pertenencia y acceso privado. No se afirma análisis antivirus, recodificación completa o una política de archivos lista para producción.
- Respaldo local probado; copia fuera del equipo, custodia operativa de claves, HTTPS de producción y operación real siguen pendientes. No hay correo, OTP, servicios externos, pagos o publicación real.
- PWA instalable, reglamentos, plantillas, jugadores persistentes y partidos no están implementados todavía. Las vistas deportivas son referencias de UX para sus tandas.

T01 no se marca cerrada ni se inicia T02 por este informe. Próximo paso: revisión de uso y cierre de los pendientes pertinentes de T01.
