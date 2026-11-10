# Escudo visible en alta y ficha · 09/11/2026

## Cambio

- El formulario Crear equipo ofrece «Escudo (opcional)» con nombre del archivo elegido y acción Quitar.
- Después de crear el equipo se envía la imagen por la API de escudos existente. La validación de tipo y 2 MB ocurre antes de crear; si el servidor rechaza solo la imagen, el equipo queda creado y se indica cómo reintentar.
- La ficha muestra Añadir/Cambiar escudo junto al emblema. Se retiró la opción escondida en Gestión.

## Capas y comprobación

- Datos/migración: ninguna. API/permisos: sin cambios; sigue exigiendo autorización de organizador y ámbito del equipo. Las pruebas de integración cubren carga permitida, otra organización denegada y archivo falso rechazado.
- Vacío/error: sin archivo se usa el color e iniciales; la imagen es opcional. Se informa si falla su carga después de crear el equipo.
- `npm run typecheck`, `npm run build`, `npm test`: correctos, 83 pruebas.
- Navegador local: botón visible en ficha móvil y en el formulario de alta; el documento no desborda a 320 px. Falta prueba física y selección de archivo en el navegador.
