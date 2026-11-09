# 12. Catálogo funcional y trazabilidad

Este catálogo evita que una entrega parcial se confunda con el destino del producto. Las decisiones del 27/10/2026 prevalecen sobre la especificación histórica. La columna de tanda indica la **primera** entrega principal, con mejoras transversales posteriores. El estado de implementación vigente se consulta en [avances](avances.md); T06 está cerrada en código local con aceptación física pendiente.

| Capacidad | Tanda principal | Regla/resultado verificable |
|---|---|---|
| Identidad, contraseña, invitación, recuperación asistida y sesión revocable | 01 | Sin OTP/correo automático; revocación efectiva. |
| Organizaciones, roles y superadmin | 01 | Dos tenants aislados; activar/suspender/bloquear administradores manualmente. |
| Branding configurable y base responsive/PWA | 01–02 | Nombre comercial variable; marcas no alteran semántica ni permisos. |
| Torneos, ediciones, categorías, equipos, administradores de equipo y comisión | 02 | Historial por edición y permisos propios; título de comisión no concede acceso. |
| Reglamento por categoría/edición | 02 | Preset editable y versión/snapshot publicado. |
| Jugadores, C.I. privada, ficha, origen interno/externo, buena fe y staff | 03 | Lista versionada, edad calculada y revisión motivada. |
| Transferencias/préstamos declarados y elegibilidad | 03 | Origen externo no se convierte automáticamente en equipo participante. |
| Planilla de partido y convocados | 03 | Titulares/banco/no convocados, límites, arquero y elegibilidad. |
| Fixture, fases, sedes, horarios y conflictos | 04 | Round robin y programación revisable. |
| Publicación de jornada, horarios y cuadros | 04 | Orden por hora/cancha; reintento no duplica partidos ni publicación. |
| Captura en vivo y completar partido | 05 | Pocos toques, evento idempotente, offline limitado. |
| Acta, aprobación, corrección y resultado provisional/oficial | 05 | Historial y proyecciones desde fuente oficial. |
| Tabla, goleadores, tarjetas y estadísticas | 06 | Reconstrucción coherente tras corrección. |
| Suspensiones, protestas, sanciones, apelaciones y multas deportivas | 06 | Decisión autorizada antes de efecto oficial; sin cobro/saldo. |
| Bandeja de revisión y exportaciones privadas | 07 | PDF/CSV versionado de buena fe, acta y disciplina con alcance. |
| Flyers, PDF, sponsors y noticias | 08 | Render local y snapshots versionados. |
| Portal público completo y resultados en directo | 02/04/05/08 | Sin login y sin datos privados; etiqueta provisional. |
| Backups, seguridad, carga, dispositivos y soporte | 01–09 | Puertas continuas y cierre integral en 09. |

## Fuera del MVP

Boletería, apps nativas, streaming, multideporte, portal de jugador y transferencia de datos entre organizaciones quedan para evaluación posterior. **Cobros, facturación, créditos y pasarelas están fuera del alcance vigente.** IA, OTP, SMS e integraciones externas también están excluidos en esta fase.
