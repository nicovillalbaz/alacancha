# T01 — Cimientos, cuentas y acceso multiorganizador

**Objetivo:** dos organizaciones aisladas y un superadmin que habilita, suspende o bloquea manualmente administradores de torneos desde teléfono. Sin torneos funcionales todavía.

**Estado vigente 28/10/2026:** implementación técnica local y verificaciones completadas en el alcance del [acta funcional](../evidencias/t01-base-funcional.md). Aceptación de uso/física y puertas operativas abiertas; T01 no cerrada. [Arranque y accesos de muestra](../runbooks/desarrollo-local.md).

**Incremento 11/11/2026:** cambio directo de contraseña propia y por superadmin en código local, con revocación de sesiones y auditoría. [Evidencia y límites](../evidencias/t01-cambio-contrasena-2026-11-11.md).

| Ticket | Estado local | Evidencia/pendiente |
|---|---|---|
| T01-01 | Implementado | Monorepo, lockfile, Git local, configuración, PostgreSQL nativo y health/readiness; sin contenedores. |
| T01-02 | Implementado | Migraciones 001–002, claves compuestas, checks y migrador con checksum. |
| T01-03 | Implementado y probado | Sesiones, Argon2id, invitaciones y recuperación; aceptación humana de enlaces pendiente. |
| T01-04 | Implementado y probado | Casos permitidos/denegados entre organizaciones, revocación y contexto múltiple. |
| T01-05 | Implementado y revisado en navegador | Web funcional móvil, 32 combinaciones de pantalla/ancho; aceptación estética, zoom completo y dispositivos pendientes. |
| T01-06 | Implementado en alcance mínimo | Nombre, acento y logo privado con validación básica; no se declara endurecimiento de archivos de producción. |
| T01-07 | Verificación técnica realizada | 20 pruebas, tipos/build y respaldo cifrado con restauración de tablas/archivos; copia externa y operación real pendientes. |

**Antecedente del primer corte del mismo día:** [prototipo navegable](../../prototipos/01-direccion-visual/README.md) y [acta inicial](../evidencias/t01-prototipo-visual.md). La exploración de equipos, buena fe, fixture y partido continúa siendo visual; no implementa sus tandas.

## Dependencias

Ninguna. Revisar decisiones P01–P06 y P10, y fijar versiones/lockfile antes de instalar dependencias. Usar almacenamiento y DB exclusivos de este proyecto. Al comenzar la preparación visual, presentar el prototipo revisable indicado en la guía de diseño, registrar correcciones del propietario y evitar extender un patrón que siga objetado.

## Tickets en orden

1. **T01-01 Repositorio y entornos.** Crear monorepo web/API/worker/shared/db/ui, scripts de desarrollo, configuración validada, `.env.example`, procesos locales y PostgreSQL nativo propio, health/readiness. Sin Docker ni contenedores por decisión del propietario. Secretos fuera de Git. Reproducir arranque desde instalación limpia.
2. **T01-02 Migración inicial.** Usuarios, sesiones, organizaciones, membresías, invitaciones, grants y auditoría; índices y pertenencia compuesta. Seed solo ficticio y rechazado en producción.
3. **T01-03 Auth.** Alta interna por invitación de un uso con expiración; contraseña Argon2id; login/logout; sesión revocable; límite de intentos; recuperación asistida por administrador con enlace temporal, sin OTP/correo/SMS. Tokens solo como hash en DB.
4. **T01-04 Acceso.** Roles superadmin/admin de torneo/admin de equipo/operador, selector de contexto y middleware de alcance. Superadmin crea organización, invita administrador, activa/suspende/bloquea con motivo y revoca sesiones efectivamente.
5. **T01-05 Interfaz base.** Shell móvil por rol, acceso, invitación, selector, lista de organizaciones/administradores, estado manual y página de revisión del bloqueo; carga/vacío/error/denegado a 320/390/768/1280 px. Aplicar composición compacta, título único, navegación directa, retorno contextual y controles alineados según la revisión del gym; registrar la revisión del prototipo antes de repetir componentes por todas las rutas.
6. **T01-06 Media mínima y marca provisional.** Nombre/logo configurable de organización, carga validada y almacenamiento privado/público explícito; no fijar marca del producto.
7. **T01-07 Respaldo y QA.** Backup cifrado de DB/archivos, ensayo de restauración sintética, guía de desarrollo y soporte. Tests de sesión/invitación, acceso cruzado, revocación y recorrido E2E.

## Aceptación

- Superadmin crea Org A y B; habilita Admin A y deja Admin B pendiente. Solo A opera. Un usuario con dos membresías cambia contexto sin datos residuales.
- Administrador de equipo A no lee ni modifica recurso B al cambiar URL/ID. Cuenta suspendida o sesión revocada deja de operar.
- Invitación usada/vencida se rechaza; recuperar cuenta revoca sesiones previas y no envía OTP.
- UI funciona a 320/390/1280 px con marca provisional configurable y mensajes legibles.
- Acceso y revisión de bloqueo sin ventanas sobredimensionadas; sin encabezados repetidos ni barras que tapen campos. Registrar revisión estética del propietario y prueba física como evidencias distintas de la compilación o el reflujo.
- Base y un archivo ficticio se restauran desde backup; se documentan tiempos y límites.

## Demostración de salida

Crear dos organizaciones y administradores ficticios, aceptar invitaciones, habilitar A, suspender B, probar acceso prohibido, reactivar con motivo y restaurar copia en entorno aislado. Registrar comandos, resultados y capturas móviles. **Puerta:** aislamiento, bloqueo y recuperación demostrados.
