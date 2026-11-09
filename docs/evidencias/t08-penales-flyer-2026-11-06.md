# Penales en flyer de resultado — 06/11/2026

- **Datos/migración:** ninguna. El tanteo procede del `shootout` del acta oficial aprobada. El snapshot de flyer lo conserva solo si hubo tanda, sin alterar versiones anteriores.
- **API y permisos:** la vista previa y la generación siguen usando la fuente oficial, el permiso de organizador y el alcance de organización ya comprobado por la suite. No se acepta un tanteo enviado por el cliente.
- **UI:** el SVG presenta marcador de juego y «Penales local : visitante» por separado, debajo del resultado. No confunde la tanda con la lista de goleadores. Sin tanda, no aparece la línea.
- **Prueba:** `npm run demo:verify` cotejó las tandas oficiales y el SVG de resultado de las tres copas sintéticas, y comprobó que un partido sin tanda no imprime «Penales». `npm run typecheck`, `npm run build` y `npm test` pasaron (83/83, incluidos acceso permitido y denegado entre organizaciones). Vista previa del resultado de la liguilla y eliminación inspeccionada en el navegador local; la prueba física continúa pendiente.
