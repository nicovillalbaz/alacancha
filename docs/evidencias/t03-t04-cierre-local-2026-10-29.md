# T03 y T04 — incremento local del 29/10/2026

## Alcance implementado

- T03: reglamento versionado con ventana de inscripción, campos privados adicionales y comprobante de pase exigible por procedencia. El alta manual, la reutilización de identidad y el compromiso de importación validan la política en servidor. La revisión de buena fe y la elegibilidad comprueban evidencia aprobada. El CSV admite columnas privadas opcionales `dato_<clave>` configuradas por reglamento. Migración aditiva 027 para datos privados por inscripción.
- T04: avance transaccional de liga/grupos a cuadro desde todas las actas oficiales y la tabla documentada; avance de rondas eliminatorias por global de ida/vuelta y tanda, sorteos posteriores auditados y sin rivales ficticios. Los cruces de eliminación no inflan la tabla de la fase inicial. El empate de mejores restantes entre grupos se ordena por el organizador con motivo y huella de la tabla cuando el reglamento admite sorteo manual. Una rectificación que cambia al ganador reasigna y audita cruces posteriores privados sin horario, planilla ni acta; si alguno ya avanzó operativamente, bloquea esa aprobación para revisión humana. Migración aditiva 028 para distinguir fase inicial/eliminatoria.
- T04: catálogo privado de árbitros por organización, con asignación por identidad, detección de solapes y archivo auditado; se conservan nombres libres históricos. Migración aditiva 029.

## Comprobación y límites

- Antes de 027, 028 y 029 se generaron respaldos locales cifrados. La restauración de ensayo posterior a 029 verificó 60 tablas y 371 archivos con filas y huellas iguales en 18,7 s.
- `npm test`: 68/68 tras la rectificación y el desempate entre grupos. Incluye clasificación de liga desde seis actas sintéticas coherentes, corte de mejores restantes con huella vigente, avance de copa directa, reasignación de ida/vuelta posterior al corregir un ganador, acceso permitido y denegado entre organizaciones y catálogo privado de árbitros. `npm run typecheck` y `npm run build`: aprobados.
- Las pantallas usan los controles móviles existentes. Falta inspección visual específica de los campos T03, avance T04 y catálogo de árbitros en los cuatro anchos de la guía, teclado virtual, texto largo y red inestable. El acceso del navegador a `127.0.0.1:4311` fue rechazado por la revisión automática: el modelo revisor estaba sin capacidad; no fue una evaluación de seguridad del sitio. No se usó una vía alternativa. La aceptación física/humana sigue pendiente.
- El avance ante desempate dentro de un mismo grupo no resuelto se detiene hasta usar la decisión documentada de T06. Una rectificación de ganador con un cruce posterior que ya tenga planilla o acta sigue bloqueada: requiere intervención del organizador para revisar sus consecuencias antes de aprobarla.

## Incremento posterior: cruce programado y Fecha publicada

- Migración aditiva 030 tras respaldo cifrado local: el outbox de fixture admite `matchday.corrected`.
- Al aprobar una rectificación que cambia al clasificado, el servidor verifica que los cruces posteriores no tengan planilla ni acta, recalcula conflictos de horario para el nuevo equipo, reasigna ida y vuelta y audita la operación en una transacción. Incrementa la revisión de cada Fecha afectada y republica las Fechas públicas con un nuevo snapshot y outbox. Si hay planilla, acta o conflicto duro, la operación devuelve 409 sin aprobar el acta corregida.
- La prueba de copa directa cubre Fecha posterior publicada, acceso ajeno denegado y bloqueo ante planilla ya aprobada. `npm test -- --test-force-exit`: 68/68; `npm run typecheck` y `npm run build`: aprobados. `npm run restore:check`: 60 tablas y 411 archivos con filas y huellas iguales en 14,8 s. La prueba física en teléfonos sigue pendiente.
