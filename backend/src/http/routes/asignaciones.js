// Persona B — HU-2.3 Asignación de responsables · HU-2.5 Alertas y vencimientos (+ notificaciones)
import { noContent, ok } from '../router.js';

export function asignacionesRoutes(r, { services, auth, needs }) {
  r.get('/api/assignees', ...needs('asignaciones', 'read'), async () => ok(await services.assignments.listEligible()));
  r.put('/api/reports/:id/assignee', ...needs('asignaciones', 'update'), async (ctx) =>
    ok(await services.assignments.assign(ctx.principal, ctx.params.id, await ctx.json())),
  );
  r.get('/api/reports/:id/assignments', ...needs('operaciones', 'read'), async (ctx) =>
    ok(await services.assignments.history(ctx.principal, ctx.params.id)),
  );

  // Notificaciones propias (pantalla 14): cualquier usuario con sesión.
  r.get('/api/notifications', auth, async (ctx) => ok(await services.notifications.listMine(ctx.principal, ctx.query)));
  r.post('/api/notifications/read-all', auth, async (ctx) => {
    await services.notifications.markAllRead(ctx.principal);
    return noContent();
  });
  r.post('/api/notifications/:id/read', auth, async (ctx) => {
    await services.notifications.markRead(ctx.principal, ctx.params.id);
    return noContent();
  });

  // Plazos por tipo y alertas
  r.get('/api/config/report-types', ...needs('configuracion', 'read'), async () => ok(await services.alerts.listTypes()));
  r.patch('/api/config/report-types/:code', ...needs('configuracion', 'update'), async (ctx) =>
    ok(await services.alerts.updateType(ctx.principal, ctx.params.code, await ctx.json())),
  );
  r.get('/api/alerts/upcoming', ...needs('operaciones', 'read'), async (ctx) => ok(await services.alerts.upcoming(ctx.principal)));
  r.post('/api/alerts/run', ...needs('configuracion', 'update'), async () => ok(await services.alerts.scan()));
  r.get('/api/alerts/deliveries', ...needs('configuracion', 'read'), async (ctx) => ok(await services.alerts.deliveries(ctx.query)));
}
