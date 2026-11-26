// Épica 4 — Gestión de licenciamientos de software. Cada ruta declara el permiso que exige.
import { created, ok } from '../router.js';

const MAX_UPLOAD = 5 * 1024 * 1024;
const csv = ({ filename, csv: body }) => ({
  status: 200,
  raw: body,
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' },
});

export function licenciamientosRoutes(r, { services, needs, needsAny }) {
  const sw = services.software;
  const lic = services.licenses;
  const comp = services.compliance;

  r.get('/api/licensing/meta', ...needsAny(['licencias', 'read'], ['software', 'read']), async () =>
    ok({ ...(await sw.meta()), ...lic.meta(), ...(await comp.meta()) }),
  );

  // HU-4.1 Catálogo de licencias
  r.get('/api/license-types', ...needsAny(['licencias', 'read'], ['software', 'read']), async (ctx) => ok(await sw.listLicenseTypes(ctx.query)));
  r.get('/api/license-types/:id', ...needsAny(['licencias', 'read'], ['software', 'read']), async (ctx) => ok(await sw.getLicenseType(ctx.params.id)));
  r.post('/api/license-types', ...needs('licencias', 'create'), async (ctx) => created(await sw.createLicenseType(ctx.principal, await ctx.json())));
  r.patch('/api/license-types/:id', ...needs('licencias', 'update'), async (ctx) =>
    ok(await sw.updateLicenseType(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // HU-4.2 Inventario de software · HU-4.5 Revisión de obligaciones
  r.get('/api/software/components', ...needs('software', 'read'), async (ctx) => ok(await sw.listComponents(ctx.query)));
  r.post('/api/software/components', ...needs('software', 'create'), async (ctx) => created(await sw.createComponent(ctx.principal, await ctx.json())));
  r.post('/api/software/import', ...needs('software', 'create'), async (ctx) => ok(await sw.importLockfile(ctx.principal, await ctx.json())));
  r.get('/api/software/components/:id', ...needs('software', 'read'), async (ctx) => ok(await sw.getComponent(ctx.params.id)));
  r.patch('/api/software/components/:id', ...needs('software', 'update'), async (ctx) =>
    ok(await sw.updateComponent(ctx.principal, ctx.params.id, await ctx.json())),
  );
  r.post('/api/software/components/:id/reviews', ...needs('software', 'update'), async (ctx) =>
    created(await sw.review(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // HU-4.3 Licencias adquiridas · HU-4.4 Asignación y conciliación
  r.get('/api/licenses', ...needs('licencias', 'read'), async (ctx) => ok(await lic.list(ctx.principal, ctx.query)));
  r.get('/api/licenses/reconciliation', ...needs('licencias', 'read'), async (ctx) => ok(await lic.reconciliation(ctx.principal)));
  r.post('/api/licenses', ...needs('licencias', 'create'), async (ctx) => created(await lic.create(ctx.principal, await ctx.json())));
  r.get('/api/licenses/:id', ...needs('licencias', 'read'), async (ctx) => ok(await lic.get(ctx.principal, ctx.params.id)));
  r.patch('/api/licenses/:id', ...needs('licencias', 'update'), async (ctx) => ok(await lic.update(ctx.principal, ctx.params.id, await ctx.json())));
  r.post('/api/licenses/:id/assignments', ...needs('licencias', 'update'), async (ctx) =>
    created(await lic.assign(ctx.principal, ctx.params.id, await ctx.json())),
  );
  r.post('/api/license-assignments/:id/release', ...needs('licencias', 'update'), async (ctx) =>
    ok(await lic.release(ctx.principal, ctx.params.id, await ctx.json())),
  );
  r.post('/api/license-assignments/:id/reassign', ...needs('licencias', 'update'), async (ctx) =>
    created(await lic.reassign(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // HU-4.6 Alertas de cumplimiento
  r.get('/api/compliance/rules', ...needs('cumplimiento', 'read'), async () => ok(await comp.listRules()));
  r.patch('/api/compliance/rules/:kind', ...needs('cumplimiento', 'update'), async (ctx) =>
    ok(await comp.updateRule(ctx.principal, ctx.params.kind, await ctx.json())),
  );
  r.post('/api/compliance/scan', ...needs('cumplimiento', 'update'), async () => ok(await comp.scan()));
  r.get('/api/compliance/alerts', ...needs('cumplimiento', 'read'), async (ctx) => ok(await comp.listAlerts(ctx.query)));
  r.get('/api/compliance/alerts/:id', ...needs('cumplimiento', 'read'), async (ctx) => ok(await comp.getAlert(ctx.params.id)));
  r.post('/api/compliance/alerts/:id/actions', ...needs('cumplimiento', 'update'), async (ctx) =>
    ok(await comp.actOnAlert(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // HU-4.7 Evidencias (la clasificación «confidencial» exige además el permiso confidencial.read)
  r.get('/api/evidences', ...needs('evidencias', 'read'), async (ctx) => ok(await comp.listEvidences(ctx.principal, ctx.query)));
  r.post('/api/evidences', ...needs('evidencias', 'create'), async (ctx) => created(await comp.createEvidenceLink(ctx.principal, await ctx.json())));
  r.post('/api/evidences/upload', ...needs('evidencias', 'create'), async (ctx) =>
    created(await comp.uploadEvidence(ctx.principal, ctx.query, await ctx.raw(MAX_UPLOAD), ctx.query.fileName)),
  );
  r.get('/api/evidences/:id', ...needs('evidencias', 'read'), async (ctx) => ok(await comp.getEvidence(ctx.principal, ctx.params.id)));
  r.get('/api/evidences/:id/file', ...needs('evidencias', 'read'), async (ctx) => {
    const { data, mime, fileName } = await comp.downloadEvidence(ctx.principal, ctx.params.id);
    return {
      status: 200,
      raw: data,
      headers: {
        'content-type': mime,
        'content-disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'cache-control': 'no-store',
      },
    };
  });

  // HU-4.8 Reportes de inventario y cumplimiento (exportar = cumplimiento.create)
  r.get('/api/compliance/report', ...needs('cumplimiento', 'read'), async (ctx) => ok(await comp.report(ctx.principal, ctx.query)));
  r.get('/api/compliance/report.csv', ...needs('cumplimiento', 'create'), async (ctx) => csv(await comp.exportCsv(ctx.principal, ctx.query)));
}
