# Reglas de trabajo para agentes y desarrolladores

## Fuentes y estado

Leer `README.md`, `docs/README.md`, `docs/01-decisiones.md`, `docs/avances.md` y la guía de la tanda activa antes de implementar. La especificación maestra de la raíz conserva el antecedente completo; su modelo comercial fue reemplazado el 27/10/2026. Ante contradicción prevalece la decisión más reciente del propietario registrada en `docs/01-decisiones.md`. No marcar como hecho algo solo planificado.

## Límites de producto

- Nombre comercial pendiente. No convertir `alacancha` ni un candidato en marca, dominio, logo o slug fijo.
- Móvil primero para superadmin, organizador, administrador de equipo, planillero y público.
- No usar Docker ni contenedores. Desarrollo con procesos locales y PostgreSQL exclusivo de este proyecto, sin tocar servicios ni bases de gym.
- El superadmin habilita o bloquea manualmente a administradores de torneos. La tarifa inicial única es Gs. 20.000 por jornada oficial publicada, sin planes ni cargos por usuario, equipo, jugador o reprogramación. No introducir pasarela ni correo transaccional en esta fase; separar esa regla comercial de las finanzas internas del torneo.
- Sin IA, OTP de cualquier tipo, SMS ni integraciones/API de terceros en esta fase. Sin correo transaccional. Invitaciones y recuperación son administradas dentro del sistema y entregadas fuera de él por la administración.
- No codificar reglas deportivas universales según la etiqueta F5/F7/F11/futsal. Usar reglamentos configurables y versionados.
- El evento/acta oficial es fuente deportiva; tabla, goleadores y tarjetas se derivan. Las correcciones preservan historial y motivo.
- El organizador crea equipos y administradores de equipo; cada equipo conserva comisión, cuerpo técnico, jugadores, lista de buena fe, multas y sanciones propias.
- La procedencia de un jugador puede ser un equipo interno o uno externo declarado; no crear cuenta ni importar datos del externo por ese solo dato.
- Cédula, fecha de nacimiento, documentos y datos de menores son privados; no exponerlos en portal ni flyers.

## Implementación

Trabajar por `docs/tandas/01` a `09`, en incrementos verticales pequeños. Antes de cada cambio, inspeccionar código y migraciones existentes. Para cada ticket registrar datos/migración, API, UI, permisos, estados de error/vacío, pruebas y evidencia pertinente. Los permisos se validan en servidor con alcance de organización y recurso; no aceptar `organization_id` del cliente como autorización. Probar siempre un caso permitido y uno denegado entre organizaciones.

No ejecutar migraciones destructivas, borrar datos reales ni importar en masa sin respaldo y ensayo de restauración. Usar datos sintéticos en desarrollo y pruebas. Documentar cualquier cambio de arquitectura o regla en `docs/01-decisiones.md`, y actualizar `docs/avances.md` al cerrar un incremento. No avanzar silenciosamente de tanda.

La guía visual de `docs/10-guia-visual.md` aplica a cada pantalla nueva. Toda función móvil crítica debe probarse con teclado, red inestable, texto largo y al menos los anchos indicados. La aceptación física en dispositivos reales se registra como pendiente hasta ejecutarse.
