# HU-2.8 — Bitácora de cambios

**Épica 2:** Gestión de Operaciones
**Story Points:** HU-2.2 + HU-2.8 = 13 (el plan reparte por pareja de historias)
**Prioridad:** Por definir
**Responsable en el plan:** Persona A

## Historia de usuario
Como auditor quiero consultar quién cambió qué y cuándo para tener trazabilidad completa de la operación.

> Redacción provisional: el plan no trae el texto exacto. Reemplázala con la de `backlog-gaps-experiencia-gestion-operativa.docx`.

## Criterios de aceptación
- [ ] Registrar actor, fecha y hora, entidad, acción y resultado de cada cambio.
- [ ] Guardar los valores anteriores y los nuevos en cada modificación.
- [ ] Impedir modificar o eliminar registros de la bitácora (sin endpoints de edición).
- [ ] Buscar en la bitácora por reporte, usuario y periodo.

## Notas técnicas
- `GET /api/changelog?report&actorId&entity&action&result&from&to` (permiso `bitacora.read`).
- Se registran también los intentos rechazados por una regla (resultado `rejected` con el código de error).
- Inmutable en tres capas: no hay rutas de edición, el repositorio solo tiene `append`/`search` y un trigger de PostgreSQL bloquea UPDATE, DELETE y TRUNCATE.
- No guarda contraseñas ni tokens (`redact()`).

## Referencias
- Pantalla del prototipo: Pantalla nueva
- Código: `backend/src/services/changelog.service.js` · `frontend/src/pages/` (admin/ChangeLog.jsx)
- Pruebas automatizadas: `backend/test/hu-2.2-2.8.test.js`

## Definición de hecho
- [ ] Criterios de aceptación verificados por el equipo
- [ ] Pruebas automatizadas en verde (`npm test` en `backend/`)
- [ ] Probado manualmente con PostgreSQL y la interfaz
- [ ] Revisado en Pull Request (mínimo 1 aprobación)
- [ ] Documentación actualizada (`docs/`)
- [ ] Validado con el Product Owner
