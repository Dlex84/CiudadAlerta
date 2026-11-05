# Épica 1 — Configuración: Gestión de Usuarios y Acceso

Fuente: `docs/backlog/backlog-original.docx` (análisis del 2026-06-16, pendiente de refinamiento con el Product Owner).
Las historias están desglosadas como issues en `docs/backlog/issues/` (se publican con `scripts/crear-issues.sh`).

## Resumen

| HU | Historia | SP | Prioridad | Sprint propuesto | Pruebas |
|---|---|---|---|---|---|
| HU-1.1 | Autenticación de Usuarios | 8 | Crítica | Sprint 1 | `backend/test/hu-1.1-login.test.js` |
| HU-1.2 | Registro de Usuarios por Administrador | 5 | Alta | Sprint 1 | `backend/test/hu-1.2-usuarios.test.js` |
| HU-1.3 | Gestión de Roles | 8 | Crítica | Sprint 1 | `backend/test/hu-1.3-roles-permisos.test.js` |
| HU-1.4 | Gestión de permisos | 8 | Crítica | Sprint 1 | `backend/test/hu-1.3-roles-permisos.test.js` (describe HU-1.4) |
| HU-1.5 | Recuperación de Contraseña | 5 | Alta | Sprint 2 | `backend/test/hu-1.5-recuperacion.test.js` |
| HU-1.6 | Bloqueo de usuarios | 3 | Media | Sprint 2 | `backend/test/hu-1.2-usuarios.test.js` (describe HU-1.6) |
| HU-1.7 | Administración de Perfil | 5 | Media | Sprint 2 | `backend/test/hu-1.7-perfil.test.js` |
| HU-1.8 | Auditoría de Accesos | 5 | Media | Sprint 2 | `backend/test/hu-1.8-auditoria.test.js` |

**Total: 47 SP.** El backlog original ubica las 8 historias en un solo sprint; se propone dividirlas:
- **Sprint 1 (29 SP):** base de seguridad — roles, permisos, login y alta de usuarios.
- **Sprint 2 (18 SP):** recuperación, bloqueo, perfil y auditoría.

## Orden de implementación recomendado
1. Modelo de datos y roles/permisos (HU-1.3, HU-1.4): todo lo demás los consulta.
2. Login y sesión (HU-1.1).
3. Alta de usuarios (HU-1.2), que reutiliza el flujo de enlaces de HU-1.5.
4. Recuperación (HU-1.5), bloqueo (HU-1.6), perfil (HU-1.7), auditoría (HU-1.8).

## Resumen de entregables (del backlog)

| Funcionalidad | Resultado esperado | Dónde |
|---|---|---|
| Login | Usuarios autenticados | `POST /api/auth/login` |
| Usuarios | CRUD de usuarios | `/api/users` |
| Roles | CRUD de roles | `/api/roles` |
| Permisos | Asignación de permisos | `/api/roles/:id/permissions` |
| Recuperación de contraseña | Restablecimiento seguro | `/api/auth/forgot-password`, `/reset-password` |
| Bloqueo de usuarios | Control de acceso | `/api/users/:id/block` |
| Perfil de usuario | Actualización de datos | `/api/me` |
| Auditoría | Trazabilidad de accesos | `/api/audit/access` |

## Historia adicional propuesta (no está en el backlog)
**HU-1.9 — Registro de ciudadano.** El prototipo incluye «Crear cuenta» (pantalla 03) pero ninguna historia lo cubre. Está implementada (`POST /api/auth/register`, rol Ciudadano fijo) a la espera de que el PO la apruebe.
