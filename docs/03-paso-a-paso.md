# 03. Paso a paso para construir y verificar

## Antes de cada incremento

1. Leer [decisiones](01-decisiones.md), [arquitectura](05-arquitectura-y-datos.md), [reglas deportivas](06-reglas-deportivas.md), [permisos](07-permisos-y-seguridad.md), [guía visual](10-guia-visual.md) y la guía de la tanda que se vaya a implementar. T02 quedó completa en código local; su aceptación física sigue abierta.
2. Confirmar qué existe en el repositorio y el entorno. Al 28/10 T01 tiene cuentas y permisos; T02 tiene torneos, reglas, equipos, fase inicial, sedes/patrocinadores y revocación; T03 tiene núcleo privado de jugadores, buena fe, elegibilidad y planilla con migraciones 007–013. Consultar [evidencia T01](evidencias/t01-base-funcional.md), [cierre técnico T02](evidencias/t02-cierre-codigo-local.md) y [acta T03](evidencias/t03-cierre-codigo-local.md). Fixture oficial, actas y tablas siguen en prototipo o planificación.
3. Respetar las versiones adoptadas y el lockfile. Anotar cambios de arquitectura en [decisiones](01-decisiones.md). No usar Docker ni contenedores.
4. Recorrer la función móvil del incremento activo a 320/390 px y escritorio, con las observaciones de la [guía visual](10-guia-visual.md). Registrar correcciones y aceptación visual como pendientes hasta obtenerlas.
5. Revisar migraciones existentes antes de agregar otra; usar claves compuestas/alcance, datos sintéticos y estrategia de respaldo/restauración.

## Ciclo repetible por ticket

1. Escribir ticket `Txx-nn`: usuario, resultado, dependencias, reglas, datos, API, UI, permisos, aceptación y prueba.
2. Implementar una porción vertical: migración + servicio/API + interfaz + estados + prueba del recorrido. Las tareas solo de infraestructura documentan su comprobación equivalente.
3. Ejecutar pruebas dirigidas: regla de negocio, DB/API, acceso cruzado denegado y flujo de navegador que cambió. No presentar un mock como funcionalidad persistida.
4. Revisar móvil y escritorio según [guía visual](10-guia-visual.md); registrar pendiente físico cuando solo se haya probado emulador.
5. Actualizar documentación, migración, contratos y [avances](avances.md) con evidencia real.
6. Hacer demostración de salida de la tanda y decidir `pasar` o `corregir`.

## Orden de construcción

| Paso | Entrega | Contrato que deja preparado |
|---|---|---|
| 1 | T01 — base, cuentas, organizaciones, permisos y recuperación | Contexto seguro para todo recurso privado. |
| 2 | T02 — torneo, edición, categoría, equipos, comisión, reglamento | Reglas versionadas y administradores de equipo. |
| 3 | T03 — lista de buena fe, procedencia, inscripción y convocatoria | Elegibilidad temporal y planilla aprobada. |
| 4 | T04 — fase, fixture, jornada, cancha y horario | Partido programado y jornada publicada. |
| 5 | T05 — captura rápida, acta y aprobación | Fuente de resultado oficial auditable. |
| 6 | T06 — clasificación, estadísticas, disciplina | Proyecciones reconstruibles y sanciones. |
| 7 | T07 — revisión, comisión y exportaciones privadas | Actas, buena fe y disciplina consultables según permiso. |
| 8 | T08 — flyers y portal público | Publicación y archivos versionados. |
| 9 | T09 — rendimiento, seguridad y piloto | Operación real con soporte y recuperación. |

## Reglas para evitar atajos que generen deuda

- No crear todas las tablas del catálogo maestro en T01: migrar lo necesario por tanda y mantener claves de aislamiento desde el principio.
- No construir una pantalla en vivo sobre jugadores ficticios si se presenta como funcional; primero resolver inscripciones y planilla.
- No guardar marcador, tabla o goleadores como verdades editables separadas del acta/eventos.
- No conectar correo, mapas, IA u otros servicios externos “para salir rápido”. No construir cobros/facturación.
- No arrastrar decisiones del proyecto `gym`: sus planes/correo pertenecen a otro producto.
- No declarar una tanda cerrada con pruebas solo del camino feliz; incluir al menos un acceso prohibido y una condición de error importante.

## Entrega de cada tanda

Informe breve: funcionalidad implementada, migraciones, comandos para reproducir demo, pruebas ejecutadas y resultado, límites/puntos pendientes, capturas pertinentes, respaldo/restauración cuando corresponda y siguiente ticket. El archivo [avances](avances.md) mantiene el estado acumulado.
