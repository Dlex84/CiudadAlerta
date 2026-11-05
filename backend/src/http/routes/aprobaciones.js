// Persona C — HU-2.4 Flujos de aprobación · HU-2.6 Incidencias operativas
import { created, ok } from '../router.js';

export function aprobacionesRoutes(r, { services, needs }) {
  r.get('/api/config/report-types/:code/approval-steps', ...needs('configuracion', 'read'), async (ctx) =>
    ok(await services.approvals.getSteps(ctx.params.code)),
  );
  r.put('/api/config/report-types/:code/approval-steps', ...needs('configuracion', 'update'), async (ctx) =>
    ok(await services.approvals.setSteps(ctx.principal, ctx.params.code, await ctx.json())),
  );

  r.get('/api/approvals/pending', ...needs('aprobaciones', 'read'), async (ctx) => ok(await services.approvals.pendingForMe(ctx.principal)));
  r.get('/api/reports/:id/approvals', ...needs('operaciones', 'read'), async (ctx) =>
    ok(await services.approvals.listForReport(ctx.principal, ctx.params.id)),
  );
  r.post('/api/reports/:id/approvals', ...needs('operaciones', 'update'), async (ctx) =>
    created(await services.approvals.request(ctx.principal, ctx.params.id)),
  );
  r.post('/api/reports/:id/approvals/:approvalId/decision', ...needs('aprobaciones', 'update'), async (ctx) =>
    ok(await services.approvals.decide(ctx.principal, ctx.params.id, ctx.params.approvalId, await ctx.json())),
  );
}
