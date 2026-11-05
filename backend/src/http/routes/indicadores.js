// Persona D — HU-2.1 Panel de operaciones · HU-2.7 Reportes operativos (solo lectura)
import { ok } from '../router.js';

export function indicadoresRoutes(r, { services, needs }) {
  r.get('/api/dashboard', ...needs('indicadores', 'read'), async (ctx) => ok(await services.indicators.dashboard(ctx.principal, ctx.query)));
}
