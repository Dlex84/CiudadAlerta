// Épica 3 — Gestión de recursos e inventario
import { created, ok } from '../router.js';

export function inventarioRoutes(r, { services, needs }) {
  const inv = services.inventory;
  r.get('/api/inventory/meta', ...needs('recursos', 'read'), () => ok(inv.meta()));

  // HU-3.1 catálogo
  r.get('/api/resources', ...needs('recursos', 'read'), async (ctx) => ok(await inv.list(ctx.query)));
  r.post('/api/resources', ...needs('recursos', 'create'), async (ctx) => created(await inv.create(ctx.principal, await ctx.json())));
  r.get('/api/resources/:id', ...needs('recursos', 'read'), async (ctx) => ok(await inv.get(ctx.params.id)));
  r.patch('/api/resources/:id', ...needs('recursos', 'update'), async (ctx) => ok(await inv.update(ctx.principal, ctx.params.id, await ctx.json())));

  // HU-3.4 disponibilidad
  r.get('/api/resources/:id/availability', ...needs('recursos', 'read'), async (ctx) => ok(await inv.availability(ctx.params.id, ctx.query)));

  // HU-3.2 / HU-3.3 entradas, salidas, asignaciones y devoluciones
  r.post('/api/resources/:id/movements', ...needs('movimientos', 'create'), async (ctx) =>
    created(await inv.move(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // HU-3.5 historial
  r.get('/api/movements', ...needs('movimientos', 'read'), async (ctx) => ok(await inv.movements(ctx.query)));

  // HU-3.6 reportes de existencias y movimientos
  r.get('/api/inventory/summary', ...needs('recursos', 'read'), async (ctx) => ok(await inv.summary(ctx.query)));
  r.get('/api/inventory/summary.csv', ...needs('movimientos', 'read'), async (ctx) => {
    const { filename, csv } = await inv.exportCsv(ctx.principal, ctx.query);
    return {
      status: 200,
      raw: csv,
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' },
    };
  });
}
