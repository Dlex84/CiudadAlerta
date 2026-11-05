# HU-1.6 — Bloqueo de usuarios

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 3
**Prioridad:** Media
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 2

## Historia de usuario
Como administrador quiero bloquear usuarios temporalmente para evitar accesos no autorizados o incumplimientos internos.

## Criterios de aceptación
- [ ] Permitir bloquear usuarios activos.
- [ ] Registrar motivo del bloqueo.
- [ ] Impedir el inicio de sesión mientras esté bloqueado.
- [ ] Permitir reactivar usuarios bloqueados.

## Notas técnicas
- `POST /api/users/:id/block` (motivo obligatorio), `POST /api/users/:id/unblock`
- Bloquear cierra las sesiones activas. No se puede bloquear a uno mismo ni a un Super Administrador (salvo otro Super Administrador).
- El intento de acceso bloqueado queda en la auditoría (`login_blocked`).

## Referencias
- Pantalla del prototipo: No existe en el prototipo
- Código inicial: `backend/src/services/users.service.js`, `frontend/src/pages/admin/Users.jsx`
- Pruebas automatizadas: `backend/test/hu-1.2-usuarios.test.js` (describe HU-1.6)

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
