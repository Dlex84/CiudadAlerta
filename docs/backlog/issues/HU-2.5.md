# HU-2.5 — Alertas y vencimientos

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.3 + HU-2.5 = 10 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona B

## Historia de usuario
Como responsable quiero recibir avisos de los reportes por vencer o vencidos para atenderlos a tiempo.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Configurar un plazo por tipo de reporte.
- [ ] Marcar los reportes vencidos y los próximos a vencer.
- [ ] No repetir la misma alerta dentro de una ventana de tiempo configurable.
- [ ] Registrar el resultado de cada envío de alerta.

## Notas técnicas
- Plazo y aviso previo por tipo: `PATCH /api/config/report-types/:code {slaHours, warnBeforeHours}`. Aplica a los reportes nuevos.
- Cada reporte expone `overdue` y `dueSoon`; filtro `GET /api/reports?overdue=1`; bandeja `GET /api/alerts/upcoming`.
- Revisión periódica cada `ALERT_SCAN_MINUTES` (también `POST /api/alerts/run`). Ventana anti-repetición: `ALERT_DEDUPE_HOURS`.
- Sin responsable, la alerta va a quienes pueden asignar.
- Registro: `GET /api/alerts/deliveries` (canal app/correo, enviado/fallido y error).

## Referencias
- Pantalla del prototipo: Pantalla 14 (notificaciones)
- Código: `backend/src/services/alerts.service.js` · `frontend/src/pages/` (admin/OpsConfig.jsx, admin/Dashboard.jsx)
- Pruebas automatizadas: `backend/test/hu-2.3-2.5.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
