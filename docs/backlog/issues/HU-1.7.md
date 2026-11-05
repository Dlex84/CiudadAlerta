# HU-1.7 — Administración de Perfil

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 5
**Prioridad:** Media
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 2

## Historia de usuario
Como usuario quiero actualizar mis datos personales para mantener mi información actualizada.

## Criterios de aceptación
- [ ] Permitir actualizar nombre.
- [ ] Permitir actualizar teléfono.
- [ ] Permitir actualizar fotografía.
- [ ] Permitir cambiar contraseña.
- [ ] Registrar fecha de actualización.

## Notas técnicas
- `GET/PATCH /api/me`, `PUT /api/me/password`, `PUT /api/me/photo` (imagen cruda JPG/PNG/WEBP ≤ 2 MB; se valida por contenido, no por extensión).
- Cambiar contraseña exige la actual y cierra las demás sesiones.
- El correo y el rol no se pueden cambiar desde el perfil.
- Fotos: almacenamiento local (`UPLOADS_DIR`), reemplazable por S3/MinIO.

## Referencias
- Pantalla del prototipo: 15 Perfil
- Código inicial: `backend/src/services/profile.service.js`, `frontend/src/pages/Profile.jsx`
- Pruebas automatizadas: `backend/test/hu-1.7-perfil.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
