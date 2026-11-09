# T03 — Jugadores, lista de buena fe, procedencia y planilla

**Objetivo:** el administrador de equipo carga jugadores y presenta lista de buena fe con ficha, C.I. privada y origen interno o externo; luego elige titulares y suplentes desde habilitados.

**Estado al 29/10/2026:** código local implementado con [acta inicial](../evidencias/t03-cierre-codigo-local.md) e [incremento de políticas](../evidencias/t03-t04-cierre-local-2026-10-29.md). Identidad cifrada y reutilizable, documentos privados, procedencia, movimientos, restricciones, elegibilidad por fecha, buena fe y planilla versionadas, importación reversible y PDF privado. El reglamento versiona campos privados adicionales, ventana de inscripción y comprobante de pase según procedencia. La aceptación visual/física y por el propietario sigue abierta.

## Dependencias

T02: categoría, equipo participante, reglamento versionado y administrador de equipo asignado. Crear en esta tanda un partido mínimo **solo en borrador** para armar su planilla; T04 añade fase, jornada, programación y publicación. Ningún partido de prueba es oficial.

## Tickets en orden

1. **T03-01 Identidad privada.** UUID, nombres/apellidos, tipo/número de documento, fecha de nacimiento, ficha por torneo, datos opcionales definidos por reglamento, documentos privados y pertenencia temporal. No usar C.I./ficha/dorsal como ID. Añadir partido mínimo en borrador para planillas.
2. **T03-02 Buena fe.** Admin de equipo carga borrador, detecta posibles duplicados, ve cupos y presenta versión; organizador observa/aprueba/rechaza con motivo. Importación CSV con vista previa y reversión de lote; PDF privado de versión aprobada.
3. **T03-03 Procedencia/movimientos.** Origen interno con referencia o externo declarado con nombre, ciudad y liga opcional; transferencia/préstamo con vigencia y evidencia si reglamento exige. El externo no se crea como equipo participante ni se considera verificado automáticamente.
4. **T03-04 Elegibilidad.** Servicio que responde para jugador/equipo/categoría/fecha de partido: permitido, advertencia o bloqueo con causa. Admitir restricciones manuales auditadas para ensayar suspensión; T06 incorporará expedientes y cálculo automático sin inventar una decisión ahora.
5. **T03-05 Planilla móvil.** Desde buena fe aprobada, búsqueda por dorsal/apellido/ficha, 1 toque titular/suplente/no convocado, `X/N`, `Y/B`, `Z/R`, arquero/capitán/staff. Borrador, presentación, aprobación y snapshot congelado; copiar previa con nueva validación.
6. **T03-06 QA.** Límites, duplicados, edad a fecha de corte, origen interno/externo, préstamo vencido, suspensión, acceso a C.I./documentos, concurrencia entre admins y recorrido móvil. [Resultados y pendientes](../evidencias/t03-cierre-codigo-local.md).

## Aceptación

- Configuración F7 `N=7, B=8, R=15, G=30`: se eligen 7+8; el resto continúa como no convocado. Octavo titular/noveno suplente muestran límite exacto.
- Jugador de otro equipo, no aprobado o suspendido no puede convocarse normalmente. Excepción deja rastro.
- Dos administradores no pisan una lista/planilla aprobada; el snapshot sigue legible después de una baja.
- Origen externo se conserva como declaración revisable, sin consulta ni cuenta de tercero.
- Selección usable a 320 px sin scroll horizontal y con estado de guardado inequívoco.

## Demostración de salida

Crear 30 jugadores ficticios con ficha y C.I. sintética, uno con origen externo y otro interno; presentar/aprobar buena fe, bloquear uno y armar planilla F7 desde móvil. Probar intento cruzado, préstamo vencido y copia de planilla antigua. **Puerta:** datos privados, elegibilidad y límites protegidos en servidor.

**Evidencia técnica:** el escenario F7 de 30 jugadores, 7 titulares y 8 suplentes, préstamo vencido, excepción, copia y aislamiento entre organizaciones corre en la suite de integración. Alta y revisión de buena fe se inspeccionaron en navegador móvil. La demostración presencial completa en teléfono físico está pendiente; no se marca como realizada.
