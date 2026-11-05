# HU-2.4 — Flujos de aprobación

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.4 + HU-2.6 = 13 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona C

## Historia de usuario
Como supervisor quiero aprobar o devolver un reporte antes de que se marque como resuelto para asegurar la calidad del trabajo.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Configurar los pasos de aprobación por tipo de reporte.
- [ ] Registrar aprobador, decisión, fecha y comentarios.
- [ ] Impedir avanzar si hay una aprobación obligatoria pendiente o rechazada.
- [ ] Devolver un reporte para corrección, indicando el motivo.

## Notas técnicas
- Pasos: `GET|PUT /api/config/report-types/:code/approval-steps` (hasta 5; rol aprobador y obligatorio/opcional).
- Solicitud: `POST /api/reports/:id/approvals` (abre una «ronda»). Decisión: `POST /api/reports/:id/approvals/:approvalId/decision {decision: approved|rejected|returned, comment}`.
- Los pasos se deciden en orden; nadie aprueba un reporte que él mismo atiende; cada paso lo decide su rol.
- Rechazar o devolver exige comentario y obliga a pedir una nueva ronda. Si el reporte vuelve a «En revisión», la ronda pendiente se cancela.
- Bandeja: `GET /api/approvals/pending`.

## Referencias
- Pantalla del prototipo: Pantalla nueva
- Código: `backend/src/services/approvals.service.js` · `frontend/src/pages/` (admin/ReportDetail.jsx, admin/Approvals.jsx, admin/OpsConfig.jsx)
- Pruebas automatizadas: `backend/test/hu-2.4-2.6.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
