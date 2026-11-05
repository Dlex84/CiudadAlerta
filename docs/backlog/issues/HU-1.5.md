# HU-1.5 — Recuperación de Contraseña

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 5
**Prioridad:** Alta
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 2

## Historia de usuario
Como usuario quiero recuperar mi contraseña de acceso al sistema para acceder según mi perfil.

## Criterios de aceptación
- [ ] Permitir solicitar recuperación mediante correo electrónico.
- [ ] Generar enlace temporal de recuperación.
- [ ] El enlace debe expirar después de un tiempo configurable.
- [ ] Permitir establecer una nueva contraseña.
- [ ] Invalidar enlaces utilizados previamente.

## Notas técnicas
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- Expiración: `PASSWORD_RESET_TTL_MINUTES` (30 por defecto). Token de un solo uso (marcado atómico); un enlace nuevo invalida los anteriores.
- Respuesta idéntica exista o no el correo. Al restablecer se cierran todas las sesiones.
- Desarrollo: correos visibles en Mailpit (http://localhost:8025).

## Referencias
- Pantalla del prototipo: 02 (enlace «¿Olvidaste tu contraseña?»); las pantallas de solicitud y nueva contraseña no existen en el prototipo
- Código inicial: `backend/src/services/auth.service.js`, `frontend/src/pages/ForgotPassword.jsx`, `ResetPassword.jsx`
- Pruebas automatizadas: `backend/test/hu-1.5-recuperacion.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
