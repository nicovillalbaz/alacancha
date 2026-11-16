# Formatos y flujos reutilizables

## Regla de arquitectura

Una Copa es una **instancia de datos**: organización, edición, categoría, equipos, reglamento versionado, calendario y publicaciones. Su nombre, slug o identificador no puede elegir permisos, eventos, pagos, tablas ni pantallas. Las operaciones se habilitan por capacidades y estado del recurso. Si aparece una modalidad deportiva nueva, se añade un **formato reutilizable**, no una rama para esa Copa.

## Capas compartidas

| Capa | Fuente | Uso común |
|---|---|---|
| Identidad y acceso | Organización, membresía y alcance del recurso | Crear equipos, jugadores, jornadas y actas; denegar acceso cruzado. |
| Reglamento | Versión publicada de la categoría | Puntos, períodos, tarjetas personalizadas, elegibilidad, sustituciones y camino al título. El acta conserva la versión usada. |
| Participantes | Equipos inscritos en la categoría | Un partido determina sus dos equipos; el alta rápida de un jugador debe vincularse al equipo elegido en ese partido, nunca a una Copa codificada. |
| Calendario | Fase, plan y jornadas versionados | Anunciar, preparar, programar y publicar partidos sin inventar fechas. El tamaño de una jornada sale de sus cruces. |
| Acta | Eventos oficiales con historial | Goles, tarjetas, penales, cambios y correcciones; marcadores y estadísticas se derivan. |
| Presentación | Estado público y datos autorizados | Misma navegación, detalle y flyers para cualquier torneo compatible con el formato. |

## Formatos presentes y sus límites

- El motor estándar admite liga, grupos y eliminación, una o dos ruedas, descansos y cuadros configurados por reglamento. Es la primera opción para un torneo nuevo.
- Un calendario anunciado de **rueda única** permite pares o impares de equipos, calcula jornadas y cruces desde los inscritos y deja la programación pendiente. El cuadro de consulta toma su tamaño de la cantidad de clasificados. Es un modo compartido, no una función exclusiva de Sanber.
- El formato por posiciones/interserial/cuadrangular que usa Caacupé admite dos grupos de 4 a 8 equipos mediante `groupSize`. Exige cada cruce interno y un interserial por posición, ocho clasificados sin repetición en cuartos y un cuadrangular completo de los cuatro ganadores. No se selecciona por nombre o ID de Copa. Conserva dos partidos en la primera jornada de apertura; otras topologías deportivas requieren un formato propio.
- El alta rápida desde el acta usa organización, partido, lado/equipo y versión del reglamento, sin nombres ni identificadores de Copas. La creación del jugador, su inscripción, la planilla congelada y el evento se guardan en una sola transacción. Un fallo de validación revierte todo; un reintento con el mismo identificador no duplica jugador ni evento. La publicación y pruebas se registran en la evidencia de T03/T05.

## Condición para incorporar una Copa

Antes de usar un formato, comprobar que sus entradas y reglas representan la competición real. Si no, ampliar el formato con parámetros o crear otro motor reutilizable. Cargar los datos de la nueva Copa no debe añadir comparaciones contra su nombre o ID en `apps/` ni `packages/`. Probar al menos dos instancias del mismo formato con diferente cantidad de equipos, además de permisos entre organizaciones, actas, resultados y la vista pública. Nunca publicar jornadas o resultados reales como parte de la prueba.
