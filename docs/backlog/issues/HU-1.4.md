# HU-1.4 — Gestión de permisos

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 8
**Prioridad:** Crítica
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 1

## Historia de usuario
Como administrador quiero asignar permisos a roles para restringir el acceso a funcionalidades específicas.

## Criterios de aceptación
- [ ] Permitir asignar permisos por módulo.
- [ ] Permitir asignar permisos de Crear.
- [ ] Permitir asignar permisos de Consultar.
- [ ] Permitir asignar permisos de Modificar.
- [ ] Permitir asignar permisos de Eliminar.
- [ ] Los cambios deben aplicarse inmediatamente.

## Notas técnicas
- `GET/PUT /api/roles/:id/permissions` (matriz módulo × crear/consultar/modificar/eliminar).
- Tabla `role_permissions`. Los permisos se leen de BD en cada request → efecto inmediato, incluso en sesiones abiertas.
- Super Administrador: acceso total e inmutable. Nadie edita los permisos de su propio rol.
- Middleware: `requirePermission(modulo, accion)`.

## Referencias
- Pantalla del prototipo: No existe en el prototipo
- Código inicial: `backend/src/domain/permissions.js`, `backend/src/http/middleware.js`, `frontend/src/pages/admin/Roles.jsx`
- Pruebas automatizadas: `backend/test/hu-1.3-roles-permisos.test.js` (describe HU-1.4)

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
