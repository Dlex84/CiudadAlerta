// HU-2.1 — Panel de operaciones. Solo lectura.
// Los indicadores usan los MISMOS filtros que GET /api/reports (ctx.parseReportFilters), así siempre cuadran.
import { BUCKETS, STATUSES } from '../domain/operations.js';

export function createIndicatorsService({ repos, ctx, clock = () => new Date() }) {
  /** Filtros que se devuelven junto al resultado (criterio: incluir los filtros usados). */
  async function describeFilters(query) {
    const out = {};
    for (const k of ['from', 'to', 'status', 'bucket', 'typeCode', 'assigneeId', 'q', 'overdue']) {
      if (query[k] !== undefined && query[k] !== '') out[k] = String(query[k]);
    }
    if (out.assigneeId && out.assigneeId !== 'me' && out.assigneeId !== 'none') {
      out.assigneeName = (await ctx.userNames([out.assigneeId])).get(out.assigneeId);
    }
    return out;
  }

  return {
    /** HU-2.1: creados, en proceso, completados, rechazados y vencidos + última actualización. */
    async dashboard(actor, query = {}) {
      const now = clock();
      const filters = await ctx.parseReportFilters(actor, query);
      const { byStatus, overdue, lastUpdatedAt } = await repos.reports.summarize(filters, now);
      const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
      const sum = (statuses) => statuses.reduce((s, k) => s + (byStatus[k] ?? 0), 0);
      return {
        generatedAt: now,
        lastUpdatedAt,
        filters: await describeFilters(query),
        indicators: {
          creados: total,
          pendientes: sum(BUCKETS.pendientes.statuses),
          en_proceso: sum(BUCKETS.en_proceso.statuses),
          completados: sum(BUCKETS.completados.statuses),
          rechazados: sum(BUCKETS.rechazados.statuses),
          vencidos: overdue,
        },
        byStatus: STATUSES.map((s) => ({ key: s.key, label: s.label, count: byStatus[s.key] ?? 0 })),
      };
    },
  };
}
