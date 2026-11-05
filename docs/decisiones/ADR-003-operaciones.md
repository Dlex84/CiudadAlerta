# ADR-003 — Modelo de operaciones de la Épica 2

**Estado:** propuesta · **Fecha:** 2026-11-05

## Contexto
La Épica 2 pide ciclo de vida, responsables, aprobaciones, alertas, incidencias, reportes y bitácora. El plan propuso Node.js + Express + SQLite, pero el repositorio ya trae la base de la Épica 1 con Node sin framework y PostgreSQL ([ADR-001](ADR-001-stack-tecnologico.md)).

## Decisiones

1. **Mismo stack que la Épica 1.** Node `http` + router propio, PostgreSQL, repositorios PG con gemelos en memoria. Cambiar a Express/SQLite habría duplicado la base y la sesión.
2. **«Vencido» es una condición, no un estado.** Un reporte puede estar «En proceso» *y* vencido. Si fuera un estado se perdería en qué etapa quedó y habría que inventar cómo «salir» de Vencido. Se calcula como: no cerrado y `due_at < ahora`.
3. **Fecha límite fija al crear el reporte** (`due_at = created_at + plazo del tipo`). Cambiar el plazo de un tipo no mueve las fechas de reportes existentes: el compromiso con el ciudadano no cambia a mitad de camino.
4. **Aprobaciones por rondas.** Cada solicitud copia los pasos configurados en ese momento (`report_approvals`); cambiar la configuración no altera rondas en curso. Rechazar o devolver cierra la ronda; hay que pedir otra.
5. **Separación de funciones:** quien atiende un reporte no puede aprobar su cierre, aunque tenga el rol aprobador.
6. **Bitácora de solo inserción en tres capas:** sin rutas de edición, repositorio solo con `append`/`search`, y trigger de PostgreSQL que rechaza UPDATE, DELETE y TRUNCATE. Guarda también los intentos rechazados por reglas (resultado `rejected`).
7. **Los indicadores reutilizan los filtros de la lista** (`parseReportFilters`). Así «cuadran con los registros consultables» por construcción, y una prueba lo verifica.
8. **Permisos por módulo, no por acción fina.** Se agregan módulos (`operaciones`, `asignaciones`, `aprobaciones`, `incidencias`, `configuracion`, `indicadores`, `bitacora`) a la matriz existente. Exportar CSV se mapea a `indicadores.create`.
9. **Control de concurrencia optimista** en cambios de estado: `UPDATE … WHERE status = <esperado>`. Si dos personas cambian el mismo reporte, la segunda recibe `409 status_changed`.
10. **Alertas con temporizador en el proceso** (`ALERT_SCAN_MINUTES`). Con varias instancias debe activarse en una sola (o moverse a un cron).

## Costos y pendientes
- Las escrituras de una acción (reporte + historial + bitácora) no van en una sola transacción, igual que en la Épica 1. Un fallo a mitad puede dejar el historial incompleto. Si se vuelve un problema: `repos.withTransaction(fn)`.
- El panel y los reportes operativos calculan sobre hasta 5000 reportes por consulta; más allá conviene agregar en SQL o con vistas materializadas.
