# HU-1.8 — Auditoría de Accesos

**Épica 1:** Configuración – Gestión de Usuarios y Acceso
**Story Points:** 5
**Prioridad:** Media
**Sprint sugerido (backlog original):** Sprint 1 · **Propuesta de reparto:** Sprint 2

## Historia de usuario
Como administrador quiero visualizar el historial de accesos al sistema para monitorear las actividades de los usuarios.

## Criterios de aceptación
- [ ] Registrar usuario que inicia sesión.
- [ ] Registrar fecha y hora de acceso.
- [ ] Registrar dirección IP.
- [ ] Registrar cierre de sesión.
- [ ] Permitir consultar historial mediante filtros.
- [ ] Registrar localización usando la IP.

## Notas técnicas
- `GET /api/audit/access?email=&event=&ip=&userId=&from=&to=&page=&limit=`
- Eventos: `login_success`, `login_failed`, `login_blocked`, `logout`.
- Localización con `geoip-lite` (base local, sin enviar IPs a terceros). IPs privadas → «Red local».
- Detrás de un proxy/Nginx activar `TRUST_PROXY=true` para registrar la IP real.
- Privacidad: mencionar el registro de IP en la política que acepta el usuario al registrarse.

## Referencias
- Pantalla del prototipo: No existe en el prototipo
- Código inicial: `backend/src/services/audit.service.js`, `frontend/src/pages/admin/Audit.jsx`
- Pruebas automatizadas: `backend/test/hu-1.8-auditoria.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
