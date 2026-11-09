# T02 — cierre de código local · 28/10/2026

**Resultado:** los seis tickets de T02 tienen implementación local y verificación automatizada. La aceptación física y del propietario sigue abierta. No hubo despliegue ni se avanzó a otra tanda durante este cierre.

## Cambios por capa

| Capa | Entrega |
|---|---|
| Datos | Migración aditiva `009_t02_catalogue_assignments.sql` para sedes/patrocinadores asociados al torneo y revocación de administradores; respaldo cifrado previo. La fase inicial vive en el JSONB versionado, sin reescribir snapshots anteriores. |
| API | El organizador configura liga, grupos o eliminación y rondas; publicación exige una fase válida y grupos compatibles con el límite de equipos. Recursos y revocación verifican organización/recurso en servidor, auditan motivo y bloquean acceso cruzado. |
| UI | Editor móvil con opciones visibles para fase, ruedas y grupos; previa antes de confirmar reglamento; panel de sedes/patrocinadores y publicación explícita del patrocinador; revocación contextual del administrador. |
| Portal | Solo reglas oficiales, equipos autorizados y patrocinadores expresamente visibles en torneo publicado. Sedes siguen privadas hasta que T04 publique su uso en un encuentro. |

## Pruebas y recorrido

- `npm run build`: compilación de TypeScript/Vue y Vite correcta.
- `npm test`: **40/40**. Incluye fase faltante/inválida, límite de grupos, preservación v1/v2, permisos permitidos y denegados entre organizaciones, revocación y reasignación, privacidad/publicación/archivo de recursos y portal.
- `npm run restore:check`: destino nuevo `torneos_restore_20261028_b40a06c9`, **50 archivos**, filas y huellas iguales a la fuente sintética; 4.628 ms. La base original quedó intacta.
- Navegador local con datos sintéticos: se creó categoría de dos grupos, guardó borrador, revisó previa y publicó; el portal la muestra. Se creó sede privada y patrocinador, se autorizó este último y apareció una sola vez en el portal. Se asignó y revocó un administrador de equipo; su historial quedó visible.
- [Matriz de 12 combinaciones de pantalla/ancho](t02-cierre-layout.json): 320, 390, 768 y 1280 px; sin desbordamiento horizontal ni controles visibles menores de 44 px. [Fase inicial](t02-fase-inicial-movil.png) · [previa de publicación](t02-previa-publicacion-movil.png) · [administrador revocado](t02-admin-revocado-movil.png) · [portal público](t02-portal-fase-patrocinador-movil.png).

## Alcance y pendientes reales

- T02 se cierra **en código local**. Faltan pruebas en teléfonos físicos, teclado virtual, red inestable, zoom/texto al 200 %, lector de pantalla y aceptación estética/operativa del propietario. No se reportan como aprobadas.
- Club agrupador era opcional; la identidad de equipo ya puede participar en varias categorías/ediciones. Se difiere hasta contar con un caso de uso distinto. La modalidad volante no tiene definición deportiva confirmada; no se supuso una. Los expedientes/sanciones y multas deportivas corresponden a T06/T07.
- Fixture y uso público de sedes corresponden a T04; elegibilidad aplicada y planilla a T03/T05; acta a T05; clasificación visible a T06. Estas funciones no se atribuyen a T02.
- El respaldo/ensayo es local y sintético; no prueba custodia externa ni recuperación operativa de producción.
