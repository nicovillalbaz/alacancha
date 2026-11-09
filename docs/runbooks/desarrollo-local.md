# Desarrollo local — T01 sin contenedores

## Requisitos y primer arranque

Node 24 o superior y PostgreSQL nativo 16. El lanzador usa el Node 24 disponible en el runtime de Codex cuando el Node del sistema es anterior; no modifica la instalación global. Ver las versiones exactas de dependencias en `package-lock.json`.

Desde la raíz del proyecto:

```powershell
npm install
npm run setup
npm run db:migrate
npm run db:seed
npm run dev
```

`setup` genera `.env` si todavía no existe, con contraseñas y claves aleatorias, y crea una instancia propia en `.local/postgres`. Usa `127.0.0.1:55461`, usuario técnico `torneos_owner` y bases `torneos_local`/`torneos_test`. No usa Docker ni inicia, reconfigura o conecta servicios/bases del gym. `PG_BIN` apunta al PostgreSQL instalado en `C:/Program Files/PostgreSQL/16/bin`; ajustarlo si cambia la ubicación. No copiar `.env.example` encima de una configuración existente.

## Uso diario

```powershell
npm run dev
```

Inicia o comprueba la instancia nativa y arranca API y web. Abrir **http://127.0.0.1:4311**. API: `127.0.0.1:4312`; `/health` comprueba proceso y `/ready` consulta PostgreSQL. Ctrl+C cierra los procesos web/API del lanzador. Para apagar también la instancia propia:

```powershell
npm run db:stop
```

El prototipo deportivo se mantiene separado de las cuentas persistentes:

```powershell
npm run preview:visual
```

Abrir `http://127.0.0.1:4310`. Sus jugadores, fixture y partidos continúan siendo datos de muestra en memoria. La implementación persistente de torneos, categorías y equipos de T02 se prueba en la aplicación principal de `http://127.0.0.1:4311`; este prototipo no demuestra su funcionamiento.

### Recorrido T04 en la aplicación principal

1. Publicar el reglamento de una categoría con fase inicial de liga, grupos o eliminación y cargar los equipos activos.
2. Abrir **Categoría → Fixture**, crear la fase privada y revisar participantes antes de generar cruces. Los partidos borrador T03 compatibles se conservan.
3. Crear **Fecha 1** desde fixture. La Fecha pertenece a la edición y puede reunir varias categorías y días. Agregar al torneo una sede si todavía no existe.
4. Tocar **Programar** en cada cruce, elegir Fecha y sede, completar cancha, día, hora, duración y motivo; revisar conflictos antes de guardar. Cambiar el horario después usa **Reprogramar** y conserva historial.
5. En Fecha, tocar **Revisar publicación**. Se exige categoría/reglamento publicados y autorización pública de ambos equipos de cada partido. Confirmar con motivo; reintentos no crean otra publicación. Ver el resultado en el portal anónimo.

El cuadro eliminatorio conserva ganadores pendientes: T05/T06 ya aportan actas y clasificación oficial, pero su uso para avanzar rondas se implementa en T04. [El acta T04](../evidencias/t04-agenda-publicacion.md) detalla pruebas, respaldos y límites.

### Recorrido T05 en la aplicación principal

Con una Fecha publicada y la última planilla de cada equipo aprobada, abrir **Fixture → Completar partido**. El organizador puede crear un planillero, entregar manualmente su invitación y asignarlo a captura o revisión de ese encuentro. El planillero entra en **Mis partidos**. Abrir carga congela las planillas; equipo, período y tipo son botones visibles y el minuto queda vacío por defecto.

Registrar goles, tarjetas, cambios, incidencias o tanda; **Deshacer último** conserva el original y añade corrección. El contador de eventos pendientes locales debe quedar en cero antes de **Enviar acta**. Cada administrador de equipo puede abrir **Equipo → Partidos, planillas y actas → Ver acta** y dejar conformidad sobre la versión enviada. El revisor aprueba con ambas conformidades o marca la excepción y escribe motivo. El portal muestra provisional tras enviar y oficial tras aprobar. **Rectificar acta** conserva la versión anterior publicada hasta una nueva aprobación. [Pruebas y límites T05](../evidencias/t05-cierre-codigo-local.md).

## Accesos ficticios

Todos estos usuarios se crean solo en la base local de desarrollo. Contraseña de muestra: **TorneoDemo!2026**.

| Usuario | Recorrido |
|---|---|
| `superadmin@ejemplo.test` | Organizaciones, administradores, estado manual, invitaciones, recuperación y actividad. |
| `ana@ejemplo.test` | Administradora activa de Liga de la Comunidad. |
| `carlos@ejemplo.test` | Cuenta pendiente de Liga del Río; puede ver su estado, sin operar. |
| `equipo@ejemplo.test` | Lectura de su organización; no administra configuración ni accesos. |
| `multiple@ejemplo.test` | Dos membresías activas y selector de organización. |

El seed conserva cuentas y estados existentes: no reinicia contraseñas ni reemplaza decisiones. Rechaza ejecución en producción y fuera de las bases locales nombradas. Si una cuenta ya fue modificada durante la revisión, su estado real prevalece sobre esta tabla inicial.

## Invitaciones y recuperación

Superadmin agrega organización y responsable; obtiene un enlace temporal de un uso, válido 48 horas, y lo entrega fuera del sistema. La aceptación no habilita la membresía: se activa por decisión explícita. Una cuenta existente debe ingresar con la identidad destinataria para aceptar otra asignación.

Al generar otro enlace se revoca el anterior. La recuperación permite al destinatario establecer una contraseña y revoca sus sesiones previas, sin modificar el estado de sus accesos. Los enlaces completos se muestran en la interfaz al generarse; en PostgreSQL se almacena el hash del token. No hay envío de correo, SMS, OTP ni integración externa.

La creación de organización incluye una clave de solicitud. Un reintento con la misma clave y datos no duplica la organización; emite un enlace nuevo, revocando el anterior. Cambiar los datos de una solicitud ya creada se rechaza para que se revise la organización existente.

## Verificación

```powershell
npm run typecheck
npm test
npm run build
npm run backup
npm run restore:check
npm run perf:check
npm run ops:check
npm run worker:once
```

Las pruebas solo admiten `torneos_test` en la instancia propia. Crean datos sintéticos con identificadores nuevos, sin vaciar ni sobrescribir bases. Se prueban permisos permitidos/denegados, CSRF/origen, versiones, revocación, invitaciones, recuperación, archivos y reintentos. El worker marca sesiones/invitaciones vencidas sin borrar registros ni cambiar accesos administrativos.

`backup` usa snapshot consistente de PostgreSQL y los archivos referenciados de `media`, `player_documents` y `flyer_exports` listos; cifra el conjunto con AES-256-GCM y `BACKUP_KEY`. La versión 2 registra huellas de **todas las tablas públicas**. `restore:check` respalda la base sintética y restaura en una **base nueva** `torneos_restore_*`, nunca sobre una existente. Compara conteos, huellas de cada tabla y bytes de archivos. Resultado en `.local/restore-check.json`. Para comprobar un archivo cifrado ya copiado, configurar `BACKUP_FILE` antes de `npm run restore:check`; el destino sigue siendo una base nueva en la instancia de pruebas. `BACKUP_OUTPUT_DIR` permite elegir el directorio del respaldo local. El formato de esta fase limita el dump a 64 MiB en memoria; antes de volúmenes grandes se necesitará procesamiento por flujo.

`perf:check` mide 20 consultas locales por ruta con cuatro solicitudes concurrentes sobre `torneos_test`; `perf:load` mide 200 con concurrencia ocho. Ambos son de solo lectura, guardan tamaño del conjunto y percentiles en `.local/perf-check.json` o `.local/perf-load.json`. No extrapolarlos a producción. La cola local de eventos pertenece al usuario que capturó y persiste tras cerrar sesión. Hay que sincronizarla antes de enviar el acta; una revocación de acceso deja el evento pendiente y muestra el error.

`ops:check` lee atrasos de flyers/difusión, antigüedad del último respaldo local y espacio para archivos; devuelve JSON y código 2 si necesita atención. No se ejecuta automáticamente. [Incidentes y recuperación T09](t09-incidentes-y-recuperacion.md).

Los respaldos, claves y archivos privados están ignorados por Git. El ensayo local no equivale a una copia externa: custodia de la clave, copia cifrada fuera del servidor y restauración desde esa copia siguen pendientes para operación real. Este proyecto no está desplegado.

## Migraciones y recuperación

Las migraciones SQL son aditivas, con checksum y bloqueo de aplicación concurrente. No modificar una ya aplicada ni usar el SQL ilustrativo de la especificación maestra. Antes de migraciones futuras: respaldo, ensayo y revisión del cambio. Ante un fallo no se ejecuta un `down` destructivo: conservar el respaldo y restaurar primero en destino nuevo para inspección.
