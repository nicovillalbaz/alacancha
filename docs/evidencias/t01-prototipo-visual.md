# T01 — Primer prototipo visual · 28/10/2026

**Estado:** preparación visual revisable; T01 no cerrada. Se creó un [prototipo local](../../prototipos/01-direccion-visual/README.md) siguiendo las observaciones del gym registradas en la guía visual. No se inició una tanda funcional posterior: las vistas de jugadores, fixture y partido son exploraciones de diseño con datos sintéticos.

**Revisión posterior del propietario:** la [corrección de contadores y tiempos](t01-ajuste-contadores-y-tiempos.md) reemplaza los bloques de totales y el minuto prefijado visibles en las capturas iniciales de esta acta. Estas últimas se conservan como antecedente.

## Alcance del incremento

| Área | Entrega o límite |
|---|---|
| Datos/migración | Datos sintéticos en memoria de la página. Sin base, migraciones, almacenamiento persistente ni importación. |
| API | Sin API de producto. Servidor estático opcional de Node que escucha en `127.0.0.1` y solo sirve el prototipo. |
| UI | Acceso de muestra, shell por perfil, superadmin, equipos, buena fe y alta, ficha/comisión/técnicos, horarios, partido/acta y portal público. |
| Permisos | Navegación por perfiles simulados y vista privada no disponible desde ruta pública. No acredita aislamiento, autorización en servidor ni revocación; las pruebas reales permitido/denegado entre organizaciones quedan pendientes en T01. |
| Estados | Vacío de búsqueda/sanciones/historial, inscripción observada, borrador, conflicto horario, ruta no disponible y marcador provisional. Carga real, respuestas de API y fallos de sincronización no se simulan como implementados. |
| Evidencia | [Matriz de anchos y comprobaciones](t01-prototipo-layout.json), [escritorio](t01-prototipo-escritorio.jpg), [partido móvil](t01-prototipo-partido-movil.jpg). |

## Comprobaciones ejecutadas

- `node --check prototipos/01-direccion-visual/app.js` y `node --check scripts/ver-prototipo.mjs`: sintaxis aprobada con Node 20.20.1; esto no fija la versión futura del stack.
- Navegador integrado: siete pantallas por cuatro anchos (320, 390, 768 y 1280 CSS px), **28 combinaciones sin desbordamiento horizontal**, un título principal por pantalla. Un enlace de marca de escritorio medía 21 px de alto: se corrigió a 44 px y se revisó de forma dirigida. El resto de los controles medidos cumplía 44 px.
- Alta móvil: nombre largo «Javier Alejandro Fernández de la Comunidad», ficha, nacimiento y procedencia externa guardados como borrador de muestra; aparece en buena fe sin crear un equipo participante. Búsqueda «Fernandez» encuentra el apellido acentuado.
- Gol a los 43 minutos: marcador de muestra 2–1 → 3–1; deshacer restaura 2–1. Los eventos iniciales permanecen.
- Acceso simulado: Ana Martínez cambia de Activo a Bloqueado y se registra el motivo en su historial de muestra. Esto no bloquea una sesión real ni permite afirmar aislamiento entre organizaciones.
- Fixture: intentar 17:15 en la cancha ya ocupada muestra error; 16:30 se acepta y conserva jornada. El motivo queda en el detalle del encuentro. Tras una corrección dirigida, el motivo también se conserva en el formulario cuando hay error.
- Retorno desde ficha de jugador conserva la búsqueda «Diego». Una búsqueda sin coincidencias muestra el estado vacío.
- Teclado: desde el motivo del formulario, Tab alcanza Cancelar con foco visible. No se completó un recorrido de teclado por todas las vistas.
- Revisión final dirigida: «Ir al contenido» enfoca el contenido sin cambiar de ruta; el enlace del próximo partido abre su encuentro programado, separado del encuentro en juego.
- Ruta pública a un jugador privado presenta «Vista no disponible». Solo acredita presentación del prototipo en cliente.
- Consola del recorrido sin errores ni advertencias observadas.

## Límites y pendientes

No hay comprobación de red inestable de una API, sincronización, autenticación ni permisos reales. La página ya cargada no necesita peticiones de datos; eso no acredita una PWA instalable u operación offline de la aplicación final. No se ha realizado revisión completa con lector de pantalla, zoom/texto al 200 %, orientación o teclado virtual físico. Uso en iOS/Android reales y **aceptación estética del propietario pendientes**. Los contrastes de cada combinación real siguen sujetos a la puerta visual.

La apertura `file:` fue rechazada por la política del navegador integrado. La revisión se hizo mediante HTTP local; el archivo sigue disponible para apertura manual en un navegador convencional. El servidor de revisión es temporal y se detiene al terminar la comprobación.

## Próximo incremento

Revisar esta dirección con el propietario y registrar ajustes. Después, consolidar los patrones aceptados en los cimientos de T01 con versiones fijadas, cuentas, API y permisos verificables. El prototipo estático no sustituye las puertas de seguridad, respaldo y restauración de esa tanda.
