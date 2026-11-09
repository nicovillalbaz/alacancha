# Primera dirección visual — preparación de T01

Prototipo navegable con datos ficticios, aislado de la futura aplicación. Permite revisar composición, navegación y formularios antes de implementar cuentas y permisos reales. La marca comercial sigue pendiente; los escudos de muestra son SVG originales y los nombres son sintéticos.

## Abrir

Abrir [index.html](index.html) en un navegador convencional. Los archivos `styles.css` y `app.js` deben permanecer a su lado. El navegador integrado de Codex restringe la apertura de direcciones `file:`; para verlo allí, usar la vista previa HTTP local:

```powershell
node scripts\ver-prototipo.mjs
```

Ejecutar desde la raíz del proyecto y abrir `http://127.0.0.1:4310`. El servidor escucha únicamente en este PC y sirve tres archivos del prototipo; Ctrl+C lo detiene. No requiere instalación de paquetes, base de datos ni servicios del gym. Para cambiar el puerto, definir `TORNEOS_PREVIEW_PORT` antes de ejecutarlo.

## Recorridos disponibles

| Perfil | Qué se puede revisar |
|---|---|
| Administrador de torneo | Inicio, equipos, ficha, buena fe, fixture y cambios de horario con motivo; control de partido, acta y consulta pública. |
| Administrador de equipo | Ficha de equipo, comisión, cuerpo técnico, lista de buena fe, alta de jugador por tres pasos, procedencia interna/externa, detalle de inscripción y estado vacío de sanciones. |
| Planillero | Partido de muestra, goles y tarjetas, marcador derivado de eventos, deshacer y revisión del acta. |
| Superadmin | Dos administradores de organizaciones ficticias, revisión de activación/suspensión/bloqueo con motivo e historial en memoria. |
| Público | Torneo, fixture, resultados, clasificación y goleadores sin introducir credenciales. |

El enlace **Cambiar perfil** abre el acceso simulado. El primer acceso directo muestra el resumen del organizador. La navegación usa enlaces internos con historial del navegador; la búsqueda de jugadores/equipos y el borrador de alta se conservan durante esta sesión.

La selección de perfil ahora se hace con tarjetas directas, sin credenciales ficticias ni desplegable. El acceso de cuentas funcionales vive en la web T01 de `http://127.0.0.1:4311`; ver [desarrollo local](../../docs/runbooks/desarrollo-local.md).

## Límites del prototipo

Todos los cambios se reinician al recargar o abrir otra pestaña. Los perfiles son una herramienta de revisión y no autentican a personas. La restricción de vistas privadas es solo una demostración en el cliente; no existe servidor de autorización, aislamiento multiempresa, revocación de sesiones, auditoría durable, carga de documentos, exportación de flyers ni publicación real.

El fixture prueba el rechazo de dos encuentros a la misma hora y cancha. Descanso, duración y conflictos por intervalos requieren el motor de reglamento de T04. El marcador de muestra deriva de sus eventos; tablas y goleadores públicos usan otro conjunto de resultados oficiales ficticios y no se recalculan todavía. Finalizar la captura no aprueba el acta.

**Ajuste del 28/10 tras revisión:** retirados los bloques de totales del inicio y de superadmin. El registro de gol/tarjeta permite primer tiempo, segundo tiempo o tiempo extra; puede dejarse sin especificar. El minuto comienza vacío y se agrega opcionalmente al desplegar «Agregar minuto». El marcador no simula un reloj. Acta y eventos no muestran minutos que no se informaron; los períodos definitivos serán configurables por reglamento.

**Carga continua, revisión posterior del 28/10:** los equipos se eligen por escudo/nombre y los períodos mediante PT/ST/TE, sin desplegables. Tocar un jugador agrega el evento y deja la carga abierta con equipo/período conservados. Se puede alternar entre Gol/Amarilla/Roja en la misma pantalla, cargar varios eventos y deshacer los agregados de esta sesión. Un minuto escrito se limpia después de cada evento. El doble toque accidental se filtra; los registros deliberados posteriores siguen habilitados. Estas acciones siguen siendo locales y no aprueban el acta ni aplican sanciones automáticamente.

**Criterio extendido al resto:** procedencia en botones Externo/Del torneo/Sin anterior y equipos internos por escudo/nombre, sin selección silenciosa de origen. Borrador de jugador en dos pasos, revisión opcional y «Guardar y agregar otro». Jornadas visibles y cancha única como dato, sin desplegable. [Verificación de este corte](../../docs/evidencias/t01-base-funcional.md).

## Verificación y siguiente paso

Ver la [carga continua vigente](../../docs/evidencias/t01-carga-continua.md), [captura móvil](../../docs/evidencias/t01-carga-continua-movil.jpg) y [captura de escritorio](../../docs/evidencias/t01-carga-continua-escritorio.jpg). La [corrección de contadores y tiempos](../../docs/evidencias/t01-ajuste-contadores-y-tiempos.md) y el [acta inicial](../../docs/evidencias/t01-prototipo-visual.md) conservan su historial. T01 permanece abierta. La revisión estética del propietario y el uso físico siguen pendientes antes de consolidar estos patrones en la aplicación.
