# T03-01 — Borrador privado de jugadores y procedencia · 28/10/2026

**Estado:** primer incremento local de T03 verificado. T03 y T02 siguen abiertas; no es una lista presentada, aprobada ni una planilla de partido.

## Datos y migración

La migración aditiva `007_players_drafts.sql` separa identidad `players` de inscripción `player_registrations` por participación de equipo. Guarda nombres, apellidos, tipo/número de documento, fecha de nacimiento y número de ficha distinto del documento. La inscripción tiene origen interno, externo, sin equipo previo o desconocido. El externo conserva nombre, ciudad y liga opcional como declaración; no crea un equipo competidor. Se respeta el cupo máximo de nómina del reglamento, si existe.

El número completo de documento se cifra en la aplicación con AES-256-GCM y se deduplica con una huella HMAC ligada a organización y tipo. La lista privada devuelve solo su terminación, nunca el número o el texto cifrado. La clave de aplicación debe custodiarse y conservarse para recuperar documentos; rotación de clave queda pendiente de diseño operativo. No se usaron datos reales.

## API, permisos y estados

`GET/POST /api/v1/organizations/:id/entries/:entryId/players` requieren organización activa y equipo asignado o administrador del torneo. La API verifica el alcance por servidor y rechaza cruces de organización/equipo. El alta bloquea documento repetido, fecha futura, origen interno inexistente y nómina llena; el SQL impide duplicados de documento, jugador o ficha dentro de sus ámbitos. Los registros nuevos quedan en `draft`. `GET /origin-teams` muestra solo nombres e IDs de equipos activos de la organización a usuarios autorizados, para elegir procedencia interna.

## UI móvil

Desde cada participación del equipo se abre «Lista de buena fe», con búsqueda por nombre/ficha y cédula enmascarada. «Agregar jugador» tiene dos pasos: identidad privada y ficha/procedencia. Tipo de documento y tipo de origen usan botones visibles. «Guardar y agregar otro» limpia identidad y procedencia tras guardar; un error conserva los datos del formulario. [Lista a 390 px](t03-buena-fe-borrador-movil.jpg) · [identidad](t03-alta-identidad-movil.jpg) · [origen externo](t03-alta-origen-movil.jpg).

## Verificación

- Respaldo cifrado de la base local sintética antes de migrar: `torneos-1793204173103-bb904242.backup`. Migración 007 aplicada sin borrar datos.
- `npm test`: **36/36**. Nuevo caso: alta permitida para organizador y administrador asignado, acceso ajeno denegado, cifrado reversible con clave, número completo ausente de lista, origen externo sin equipo creado, duplicado normalizado, origen interno inválido, fecha futura y bloqueo al llegar al cupo de doce. La migración repetida también pasa.
- `npm run build`: API, Vue/TypeScript y Vite correctos.
- `npm run restore:check` tras la prueba final: destino nuevo `torneos_restore_20261028_2d74f229`, **34 archivos**, filas y checksums iguales a la fuente sintética, 2.183 ms.
- Navegador local: alta de un jugador sintético por ambos pasos, origen externo declarado, búsqueda por ficha y vista privada con documento enmascarado. [Matriz de doce combinaciones](t03-borrador-layout.json): 320/390/768/1280 px, un H1, sin scroll horizontal ni controles visibles menores de 44 px.

## Pendiente para T03

Editar identidad con historial, reutilizar identidad para transferencias, ficha y emisor externo, archivos/documentos privados, presentar/aprobar/observar versiones de buena fe, cálculo de elegibilidad, excepciones, planilla, importación/exportación y pruebas de concurrencia. Faltan teclado virtual, red inestable, zoom/texto al 200 %, lector de pantalla, teléfonos físicos y aceptación del propietario.
