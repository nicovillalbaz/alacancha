# 07. Permisos, privacidad y seguridad

## Regla de acceso

Permiso efectivo = sesión válida + estado manual de acceso + rol + membresía vigente + alcance del recurso + estado de la operación. La interfaz puede ocultar acciones, pero **cada lectura y escritura se verifica en servidor**. El usuario selecciona organización/torneo/equipo activo cuando pertenece a varios; cambiarlo invalida datos en memoria/cache del anterior.

| Perfil | Puede | No puede |
|---|---|---|
| Superadmin | Crear organizaciones/administradores y habilitar, suspender o bloquear acceso con motivo; soporte auditado | Leer documentos personales indiscriminadamente. |
| Administrador de torneo | Crear equipos/admins de equipo, reglas, fixture, horarios, actas, disciplina y publicaciones de sus torneos | Ver/modificar otra organización o aprobar sin permiso especial. |
| Administrador de equipo | Comisión, cuerpo técnico, jugadores, buena fe, procedencia, planilla y sanciones de sus equipos | Editar rival, aprobar su propia habilitación o cambiar resultado oficial. |
| Miembro de comisión | Solo funciones asignadas explícitamente | Obtener acceso por el mero título de presidente/tesorero. |
| Planillero/árbitro | Eventos/acta de partidos asignados según función | Aprobar transferencias o partidos no asignados. |
| Público | Contenido publicado expresamente | C.I., nacimiento, documentos, contacto privado o expediente interno. |

Una persona puede administrar varios equipos: cada concesión conserva equipo/edición y vigencia. El título dentro de una comisión es un dato organizativo, separado del permiso de cuenta. Revocar una membresía, asignación o activación bloquea operaciones nuevas y colas pendientes; no basta con ocultar un menú.

## Datos sensibles

- Jugadores menores: minimizar datos, documentar autorización de publicación y restringir fotografía/documentos. Portal muestra solo nombre deportivo, dorsal y estadísticas autorizadas.
- C.I./documento, nacimiento completo, contacto, procedencia y evidencias: privados, con permisos específicos; no incluir en HTML público, logs o URLs permanentes.
- Archivos: almacenamiento privado, tipo/tamaño/antivirus según política, acceso autenticado y vencimiento. Logos/flyers explícitamente públicos son una clase distinta.
- Sesiones: contraseña con Argon2id, sesión opaca revocable en cookie segura; protección CSRF donde aplique, límites de intentos, expiración y cierre en dispositivos compartidos.
- Invitaciones/recuperación: token aleatorio de un uso y expiración, guardar hash, nunca contraseña en claro. Entrega fuera del producto por administrador; no es OTP ni correo automático.
- Soporte y operaciones críticas: auditoría de actor, motivo, hora, entidad y cambios relevantes redactados sin secretos.

## Pruebas negativas obligatorias

1. Org A y Org B pueden tener nombres de equipo idénticos sin colisión; admin de equipo A no consulta ni modifica recursos B manipulando ID/URL.
2. Admin de Equipo A no modifica plantel, buena fe, planilla, comisión o documentos de Equipo B aunque comparta torneo.
3. Planillero asignado a Partido 1 no registra evento en Partido 2 ni aprueba acta sin función correspondiente.
4. Revocar membresía o asignación impide siguientes requests y sincronización offline pendiente.
5. Público no recibe documentos, C.I., fecha de nacimiento completa ni procedencia privada en API/respuesta/cache.
6. Superadmin de soporte necesita causa registrada para acceso excepcional y no hereda permisos ilimitados de documentos.

Antes del piloto revisar protección de datos, retención y consentimiento de menores con asesoría local. La [Ley 7593/2025](https://www.bacn.gov.py/leyes-paraguayas/12924/ley-n-7593-proteccion-de-datos-personales) tiene entrada en vigor diferida; verificar fecha de publicación oficial y reglamentación aplicable. Hasta entonces no afirmar cumplimiento legal definitivo.
