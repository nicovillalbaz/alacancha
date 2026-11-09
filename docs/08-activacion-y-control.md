# 08. Activación y control manual de acceso

**Alcance:** operación del superadmin. Este módulo no calcula precios, pagos, deudas, créditos ni facturas. La habilitación o el bloqueo es una decisión administrativa manual.

## Estados propuestos

| Estado | Acceso del administrador de torneo | Datos del torneo |
|---|---|---|
| `pending` | No puede operar; ve motivo/estado de solicitud si inicia sesión | Conservados, sin publicación nueva. |
| `active` | Puede operar dentro de sus organizaciones y torneos asignados | Conforme a permisos por recurso. |
| `suspended` | No puede crear ni modificar; lectura/exportación propia según política de soporte | Se conservan historial y portal ya publicado, salvo decisión explícita. |
| `blocked` | Sesiones revocadas y nuevas operaciones denegadas | Nunca se borra automáticamente el torneo. |

La suspensión es reversible; el bloqueo exige motivo y revisión. Una cuenta puede administrar varios torneos: separar el **estado global de usuario** de la **asignación a cada organización/torneo**. El superadmin puede suspender una organización o revocar una asignación específica sin afectar otras por accidente.

## Acciones del panel

1. Consultar organizadores, administradores, torneos y estado de acceso, con filtros y búsqueda móvil.
2. Crear/invitar administrador de torneo, asignar organización/torneo y rol.
3. Habilitar, suspender, bloquear o reactivar con confirmación y motivo. Mostrar alcance exacto antes de aplicar.
4. Revocar sesiones y permisos afectados de inmediato; una cola offline no puede sincronizar cambios después de revocación.
5. Consultar bitácora de actor, hora, estado anterior/nuevo, alcance y motivo.

## Reglas de seguridad

- El administrador de torneo no se autoactiva ni modifica su propio estado de acceso.
- Un administrador de equipo no hereda acceso de organizador. Su permiso solo cubre equipos asignados.
- El estado se comprueba en cada request del servidor, también en WebSocket/SSE y sincronización diferida.
- Cambiar estado no borra eventos, actas, jugadores ni contenido público ya publicado. Retirar una publicación exige otra decisión autorizada.
- Si el superadmin necesita soporte sobre datos personales, el acceso especial requiere causa, duración y auditoría.

## Aceptación de planificación

- Habilitar a Admin A no habilita a Admin B ni a un torneo ajeno.
- Suspender A bloquea nuevas escrituras y sincronización pendiente; reactivarlo conserva historial.
- Bloquear una organización no elimina su información; el superadmin puede revisar y revertir con motivo.
- La interfaz muestra estado y alcance en teléfono a 320/390 px, con confirmaciones legibles.
