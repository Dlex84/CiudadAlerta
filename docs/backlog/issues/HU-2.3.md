# HU-2.3 — Asignación de responsables

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.3 + HU-2.5 = 10 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona B

## Historia de usuario
Como supervisor quiero asignar y reasignar responsables para que cada reporte tenga quién lo atienda.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Asignar y reasignar un responsable, solo entre usuarios autorizados.
- [ ] Registrar quién asignó, cuándo y el motivo de una reasignación.
- [ ] Servicio de notificaciones, visible en la pantalla 14 del prototipo, para avisar al responsable.
- [ ] Filtrar reportes por responsable.

## Notas técnicas
- `GET /api/assignees` · `PUT /api/reports/:id/assignee {assigneeId, reason}` · `GET /api/reports/:id/assignments`.
- Autorizados = usuarios activos, con rol activo y permiso `operaciones.update`.
- Reasignar exige motivo; se avisa al nuevo responsable (app + correo) y al anterior (app).
- Filtro `GET /api/reports?assigneeId=<id>|me|none`.
- Notificaciones: `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.

## Referencias
- Pantalla del prototipo: Pantalla 14 (notificaciones)
- Código: `backend/src/services/assignments.service.js`, `backend/src/services/notifications.service.js` · `frontend/src/pages/` (admin/ReportDetail.jsx, Notifications.jsx)
- Pruebas automatizadas: `backend/test/hu-2.3-2.5.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
