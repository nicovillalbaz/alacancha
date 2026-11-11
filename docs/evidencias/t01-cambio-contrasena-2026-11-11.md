# T01 — cambio directo de contraseña (11/11/2026)

**Alcance:** código local. No se modificó la base de producción ni se desplegó este incremento.

- **Datos y migración:** se reutiliza `users.password_hash`, `sessions` y `audit_logs`; no hay migración. La contraseña se almacena con Argon2id y nunca se devuelve ni se escribe en la auditoría.
- **API:** `POST /api/v1/auth/password` toma solo la contraseña nueva de la sesión actual; conserva esa sesión, revoca las otras de la misma cuenta y los enlaces de recuperación pendientes. `POST /api/v1/admin/users/:id/password` exige superadmin, no acepta la cuenta propia por esta ruta y revoca todas las sesiones del destinatario. Ambos validan 12–128 caracteres, CSRF, origen y límite de intentos.
- **UI:** Cuenta muestra un botón que abre un solo campo; la ficha de cada administrador ofrece la misma acción al superadmin. No hay acción para el visitante del portal público. El secreto se borra del estado al guardar, cancelar o navegar. La recuperación por enlace sigue disponible en la API, pero se retiró el acceso redundante de la ficha.
- **Permisos y estados:** la ruta propia no admite `organization_id` ni otro usuario; un organizador recibió 403 al intentar cambiar la clave de otra cuenta. Una solicitud anónima recibió 401. Una clave corta o un campo extra recibió 400. La sesión actual se conservó tras cambio propio, las demás recibieron 401; tras cambio por superadmin todas las sesiones del destinatario recibieron 401. Otra organización y la sesión del superadmin quedaron intactas.
- **Verificación:** `npm run typecheck`, `npm run build` y `npm test` correctos; **94/94 pruebas**. Revisión visual en navegador local a 320 y 390 px de Cuenta y ficha de administrador; medición sin desborde a 768 y 1280 px y recorrido con Tab del campo al botón Guardar. Se corrigió la navegación general para que no encime etiquetas a 320 px y centre la pestaña activa. No se ingresó ni cambió una contraseña real durante la revisión visual.

**Pendiente:** aceptación en Android e iOS físicos, prueba de teclado y red inestable en un dispositivo real, y despliegue controlado.
