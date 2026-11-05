# HU-2.6 — Incidencias operativas

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.4 + HU-2.6 = 13 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona C

## Historia de usuario
Como técnico quiero registrar los problemas que encuentro al atender un reporte para que el equipo los resuelva.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Registrar incidencias con categoría, descripción, prioridad y responsable.
- [ ] Vincular cada incidencia a un reporte.
- [ ] Cambiar el estado de la incidencia y documentar su resolución.
- [ ] Historial de cambios y comentarios de cada incidencia.

## Notas técnicas
- `POST /api/reports/:id/incidents` · `GET /api/incidents?report&status&priority&category&assigneeId` · `GET|PATCH /api/incidents/:id` · `POST /api/incidents/:id/comments`.
- Estados: Abierta → En atención → Resuelta → Cerrada (con vuelta atrás limitada). Pasar a «Resuelta» exige documentar la resolución.
- Una incidencia no es el reporte del ciudadano: el ciudadano no las ve.

## Referencias
- Pantalla del prototipo: Pantalla nueva
- Código: `backend/src/services/incidents.service.js` · `frontend/src/pages/` (admin/Incidents.jsx, admin/ReportDetail.jsx)
- Pruebas automatizadas: `backend/test/hu-2.4-2.6.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
