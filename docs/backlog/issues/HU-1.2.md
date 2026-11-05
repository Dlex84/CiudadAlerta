# HU-1.2 — Registro de Usuarios por Administrador

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 5
**Prioridad:** Alta
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 1

## Historia de usuario
Como administrador quiero crear usuarios internos del sistema para asignar accesos según las funciones organizacionales.

## Criterios de aceptación
- [ ] Permitir registrar nombre completo.
- [ ] Permitir registrar correo electrónico.
- [ ] Permitir registrar teléfono.
- [ ] El correo electrónico debe ser único.
- [ ] El usuario debe crearse inicialmente en estado Activo.

## Notas técnicas
- `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id`, `POST /api/users/:id/resend-invitation`
- Correo único sin distinguir mayúsculas (índice parcial `lower(email) WHERE deleted_at IS NULL`).
- El admin no define contraseña: el usuario recibe un enlace de invitación (reutiliza el flujo de HU-1.5).
- Eliminación lógica (`deleted_at`) para conservar trazabilidad.
- Un Administrador no puede crear/gestionar Super Administradores.

## Referencias
- Pantalla del prototipo: No existe en el prototipo (propuesta: panel de administración)
- Código inicial: `backend/src/services/users.service.js`, `frontend/src/pages/admin/Users.jsx`
- Pruebas automatizadas: `backend/test/hu-1.2-usuarios.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
