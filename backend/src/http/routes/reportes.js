// Persona A — HU-2.2 Registro y seguimiento · HU-2.8 Bitácora de cambios
import { created, ok } from '../router.js';

export function reportesRoutes(r, { services, auth, needs, needsAny }) {
  const canRead = needsAny(['reportes', 'read'], ['operaciones', 'read']);

  r.get('/api/meta/operations', auth, async () => ok(await services.reports.meta()));

  r.get('/api/reports', ...canRead, async (ctx) => ok(await services.reports.list(ctx.principal, ctx.query)));
  r.post('/api/reports', ...needs('reportes', 'create'), async (ctx) =>
    created(await services.reports.create(ctx.principal, await ctx.json())),
  );
  r.get('/api/reports/:id', ...canRead, async (ctx) => ok(await services.reports.get(ctx.principal, ctx.params.id)));
  r.post('/api/reports/:id/transitions', ...needs('operaciones', 'update'), async (ctx) =>
    ok(await services.reports.transition(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // Bitácora: solo consulta. No existen rutas para modificarla ni borrarla.
  r.get('/api/changelog', ...needs('bitacora', 'read'), async (ctx) => ok(await services.changeLog.search(ctx.query)));
}
