# HU-1.3 — Gestión de Roles

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 8
**Prioridad:** Crítica
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 1

## Historia de usuario
Como administrador quiero crear y administrar roles para controlar los niveles de acceso dentro de la plataforma.

## Criterios de aceptación
- [ ] Permitir crear nuevos roles.
- [ ] Permitir modificar roles existentes.
- [ ] Permitir desactivar roles no utilizados.
- [ ] Evitar eliminar roles asociados a usuarios activos.
- [ ] Mostrar listado de roles disponibles.

## Notas técnicas
- `GET/POST /api/roles`, `GET/PATCH/DELETE /api/roles/:id`
- Roles del sistema (`is_system`): `super_admin`, `admin`, `supervisor`, `ciudadano`. No se eliminan ni renombran.
- No se desactiva un rol con usuarios activos; no se elimina un rol con cualquier usuario asociado.
- **Pendiente de decisión con el PO:** la nota del backlog lista roles de otro dominio (Agente Inmobiliario, Arquitecto, Ingeniero, Cliente). Ver `docs/preguntas-abiertas.md`.

## Referencias
- Pantalla del prototipo: No existe en el prototipo
- Código inicial: `backend/src/services/roles.service.js`, `frontend/src/pages/admin/Roles.jsx`
- Pruebas automatizadas: `backend/test/hu-1.3-roles-permisos.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
