# HU-2.1 — Panel de operaciones

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.1 + HU-2.7 = 10 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona D

## Historia de usuario
Como gerente o supervisor quiero ver un panel con el estado de las operaciones para saber cuántas hay en cada etapa y cuáles están vencidas.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Panel con los reportes creados, en proceso, completados, rechazados y vencidos.
- [ ] Filtros por periodo, estado, responsable y tipo.
- [ ] Mostrar la fecha de la última actualización.
- [ ] Comprobar que los indicadores cuadren con los registros consultables (con una prueba).

## Notas técnicas
- `GET /api/dashboard?from&to&status&assigneeId&typeCode` (permiso `indicadores.read`).
- Los indicadores usan los **mismos filtros** que `GET /api/reports` (`parseReportFilters`). Cada tarjeta abre la lista con el filtro `bucket` equivalente.
- Se agrega «Pendientes de validar» para que creados = pendientes + en proceso + completados + rechazados. «Vencidos» es un subconjunto de los abiertos.
- La prueba «los indicadores cuadran con los registros consultables» recorre 7 combinaciones de filtros.

## Referencias
- Pantalla del prototipo: Pantalla nueva (estilo del panel de la Épica 1)
- Código: `backend/src/services/indicators.service.js` · `frontend/src/pages/` (admin/Dashboard.jsx)
- Pruebas automatizadas: `backend/test/hu-2.1-2.7.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
