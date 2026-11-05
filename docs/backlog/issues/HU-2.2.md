# HU-2.2 — Registro y seguimiento de operaciones

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.2 + HU-2.8 = 13 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona A

## Historia de usuario
Como ciudadano quiero registrar un reporte y seguir su estado, y como equipo operativo quiero moverlo por su ciclo de vida con reglas claras.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Crear un reporte con código único (#CA-0001), tipo, descripción, responsable, fecha y estado.
- [ ] Validar campos y reglas antes de guardar, con mensajes de error claros.
- [ ] Definir las transiciones permitidas entre estados y rechazar las demás.
- [ ] Pantalla de seguimiento con el estado actual y el historial (pantalla 13 del prototipo).

## Notas técnicas
- `POST /api/reports` · `GET /api/reports` · `GET /api/reports/:id` (id o código) · `POST /api/reports/:id/transitions {to, reason?}`.
- Transiciones en `domain/operations.js`. Rechazar o devolver a revisión exige motivo; «En proceso» exige responsable; «Resuelto» exige aprobación (HU-2.4).
- El ciudadano solo ve sus reportes (los demás responden 404) y no ve los nombres del equipo interno.
- El operador solo cambia el estado de los reportes que tiene asignados.
- Cambio de estado con control de concurrencia (`expectedStatus`): si otro lo cambió antes, `409 status_changed`.

## Referencias
- Pantalla del prototipo: Pantallas 07, 08, 10, 11, 12 y 13
- Código: `backend/src/services/reports.service.js` · `frontend/src/pages/` (NewReport.jsx, MyReports.jsx, Tracking.jsx, admin/ReportDetail.jsx)
- Pruebas automatizadas: `backend/test/hu-2.2-2.8.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
