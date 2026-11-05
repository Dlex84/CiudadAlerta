# HU-2.7 — Reportes operativos

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.1 + HU-2.7 = 10 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona D

## Historia de usuario
Como gerente quiero generar reportes con métricas de la operación para tomar decisiones y rendir cuentas.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Reportes con métricas y la definición escrita de cada métrica.
- [ ] Exportar resultados (por ejemplo a CSV), solo para quien tenga permiso.
- [ ] Incluir en cada reporte la fecha de generación y los filtros usados.

## Notas técnicas
- `GET /api/indicators/report` (permiso `indicadores.read`) y `GET /api/indicators/report.csv` (permiso `indicadores.create`).
- Métricas: creados, abiertos, resueltos, rechazados, tasa de resolución, tiempo promedio de resolución, cumplimiento del plazo, vencidos abiertos, incidencias abiertas; desglose por tipo y por responsable.
- El CSV lleva BOM (tildes en Excel), neutraliza fórmulas (`=`, `+`, `-`, `@`) y queda registrado en la bitácora.

## Referencias
- Pantalla del prototipo: Pantalla nueva
- Código: `backend/src/services/indicators.service.js` · `frontend/src/pages/` (admin/OpsReport.jsx)
- Pruebas automatizadas: `backend/test/hu-2.1-2.7.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
