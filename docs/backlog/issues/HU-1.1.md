# HU-1.1 — Autenticación de Usuarios

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 8
**Prioridad:** Crítica
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 1

## Historia de usuario
Como usuario quiero iniciar sesión con mis credenciales para acceder a las funcionalidades autorizadas de la plataforma.

## Criterios de aceptación
- [ ] El sistema debe validar usuario y contraseña.
- [ ] Debe mostrar mensaje de error cuando las credenciales sean inválidas.
- [ ] Debe generar una sesión segura al autenticarse correctamente.
- [ ] Debe registrar fecha y hora del acceso.
- [ ] Debe redireccionar al dashboard correspondiente según el rol.

## Notas técnicas
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
- Sesión: token aleatorio en cookie `HttpOnly; SameSite=Lax` (+`Secure` en producción); en BD solo se guarda su SHA-256 (`sessions`).
- Mismo mensaje de error exista o no el correo; hash scrypt; límite de intentos por IP.
- Dashboard por rol: columna `roles.dashboard_path` → el frontend navega a `redirectTo`.

## Referencias
- Pantalla del prototipo: 02 Iniciar sesión
- Código inicial: `backend/src/services/auth.service.js`, `frontend/src/pages/Login.jsx`
- Pruebas automatizadas: `backend/test/hu-1.1-login.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
