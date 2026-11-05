// Persona D — HU-2.1 Panel de operaciones · HU-2.7 Reportes operativos (solo lectura)
import { ok } from '../router.js';

export function indicadoresRoutes(r, { services, needs }) {
  r.get('/api/dashboard', ...needs('indicadores', 'read'), async (ctx) => ok(await services.indicators.dashboard(ctx.principal, ctx.query)));
  r.get('/api/indicators/report', ...needs('indicadores', 'read'), async (ctx) =>
    ok(await services.indicators.report(ctx.principal, ctx.query)),
  );
  // Exportar es una acción aparte: requiere indicadores.create ("generar" el archivo).
  r.get('/api/indicators/report.csv', ...needs('indicadores', 'create'), async (ctx) => {
    const { filename, csv } = await services.indicators.exportCsv(ctx.principal, ctx.query);
    return {
      status: 200,
      raw: csv,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    };
  });
}
