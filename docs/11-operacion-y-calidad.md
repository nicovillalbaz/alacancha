# 11. Operación, pruebas y criterio de terminado

## Entornos previstos

- **Local:** DB y almacenamiento exclusivos de este proyecto, datos sintéticos, secrets en `.env` fuera de Git. No tocar bases de `../gym` u otros proyectos.
- **Prueba/CI:** base efímera o aislada, migración desde cero y desde versión anterior, seeds ficticios, un navegador por recorrido cuando proceda.
- **Staging:** configuración semejante a producción, datos de prueba, backup y restauración antes de cambios riesgosos.
- **Producción futura:** proxy HTTPS, web/API/worker/DB autohospedados, medios privados, respaldo cifrado fuera del servidor principal bajo control propio. No existe aún despliegue ni dominio aprobado.

## Seguridad operativa

Usar Argon2id, sesiones revocables y cookies seguras; políticas de contraseña e intentos fallidos. CSP, validación/escape de HTML/SVG, límites y validación de archivos, CSRF donde corresponda. Logs estructurados sin tokens, contraseñas, C.I. ni documentos. Cambios críticos de activación, buena fe, procedencia, acta, sanción y permiso incluyen actor, motivo, instante y antes/después redactado. Monitorear errores, jobs fallidos, uso de DB/disco y retraso de difusión.

## Backups y recuperación

Respaldar PostgreSQL y archivos privados como conjunto consistente, cifrar y guardar fuera del servidor principal en medio propio. Documentar frecuencia, retención, responsable y procedimiento al configurar infraestructura. Una copia local en el mismo VPS no prueba recuperación. Antes de desplegar una migración incompatible: respaldo, ensayo en staging y plan de reversión o avance seguro. T01 debe restaurar un conjunto sintético y comparar conteos/archivos; T09 repite una restauración de extremo a extremo.

## Pruebas por capa

| Capa | Casos clave |
|---|---|
| Unitarias | Reglas de planilla, edad a fecha de corte, procedencia, elegibilidad, goles, puntos y validación de reglamento. |
| DB/API | Claves compuestas, transición, idempotencia, concurrencia, transacciones y acceso entre organizaciones. |
| Navegador | Recorrido principal de cada rol **primero a 320/390**, después 768/1280; carga/error/vacío y permisos. |
| Red irregular | Reintentos de publicación/eventos, cola local, reconexión y conflictos sin duplicación. |
| Seguridad | ID/URL manipulados, permisos revocados, documentos privados y respuestas públicas. |
| Operación | Migrar, respaldar, restaurar, reiniciar worker y reconstruir proyecciones. |

Ejecutar las comprobaciones pertinentes al cambio y ampliar solo cuando exista riesgo concreto o puerta de tanda. Guardar comando, fecha, resultado y límite de la evidencia. Un test fallido no se convierte en “aprobado” por quedar documentado.

## Ticket de trabajo

```md
### T05-03 Registrar gol idempotente
Usuario/valor: planillero registra un gol desde teléfono sin duplicados.
Dependencias: planilla aprobada, partido asignado, T05-01.
Datos/API: migración o tabla, comando, request/response, clave idempotente.
UI: 2–3 acciones, guardado local/servidor, error y deshacer.
Permisos: operador del partido; otro operador/tenant denegado.
Aceptación: escenarios observables, incluidos doble clic y reconexión.
Pruebas/evidencia: regla, integración, navegador y captura móvil.
```

Estados: `Backlog → Preparado → En desarrollo → Revisión → QA → Aceptado`. `Desplegado` solo después de despliegue real. Un ticket puede quedar parcialmente implementado; no falsear su estado.

## Definition of Done

1. Regla, dueño del dato, permisos y contrato claros.
2. Migración/servicio/UI y estados de carga, vacío, error y desconexión pertinentes.
3. Caso positivo y negativo de autorización; prueba de regla crítica y e2e del recorrido que cruza módulos.
4. Accesibilidad, mobile y puerta visual de [10](10-guia-visual.md) según pantalla.
5. Auditoría y logs sin secretos; documentación y procedimiento de rollback si aplica.
6. Demo con datos ficticios y evidencia reproducible; aceptación de la puerta de tanda registrada en [avances](avances.md).

No desplegar a usuarios reales sin revisión de privacidad/menores. No suponer disponibilidad de correo ni respaldos de terceros. No hay módulo de cobros en el alcance vigente.
