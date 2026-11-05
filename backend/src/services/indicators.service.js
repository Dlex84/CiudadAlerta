// HU-2.1 — Panel de operaciones y HU-2.7 — Reportes operativos. Solo lectura.
// Los indicadores usan los MISMOS filtros que GET /api/reports (ctx.parseReportFilters), así siempre cuadran.
import { BUCKETS, STATUSES, isOverdue, statusLabel } from '../domain/operations.js';
import { hoursBetween } from '../lib/dates.js';

const EXPORT_CAP = 5000;
const round1 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

/** Definición escrita de cada métrica (criterio de HU-2.7). La muestra el frontend y va en el CSV. */
export const METRIC_DEFINITIONS = {
  created: { label: 'Reportes creados', unit: 'reportes', definition: 'Reportes con fecha de creación dentro del periodo que cumplen los filtros.' },
  open: { label: 'Abiertos', unit: 'reportes', definition: 'De los creados, los que no están Resueltos ni Rechazados al generar el reporte.' },
  resolved: { label: 'Resueltos', unit: 'reportes', definition: 'De los creados, los que están en estado Resuelto.' },
  rejected: { label: 'Rechazados', unit: 'reportes', definition: 'De los creados, los que están en estado Rechazado.' },
  resolutionRate: { label: 'Tasa de resolución', unit: '%', definition: 'Resueltos ÷ (creados − rechazados) × 100. Los rechazados no cuentan porque no debían atenderse.' },
  avgResolutionHours: { label: 'Tiempo promedio de resolución', unit: 'horas', definition: 'Promedio de horas entre la creación y el paso a Resuelto, solo de los resueltos.' },
  onTimeRate: { label: 'Cumplimiento del plazo', unit: '%', definition: 'Resueltos con fecha de resolución igual o anterior a su fecha límite ÷ resueltos × 100.' },
  overdueOpen: { label: 'Vencidos abiertos', unit: 'reportes', definition: 'Abiertos cuya fecha límite (creación + plazo del tipo) ya pasó al generar el reporte.' },
  openIncidents: { label: 'Incidencias abiertas', unit: 'incidencias', definition: 'Incidencias «Abierta» o «En atención» vinculadas a los reportes del resultado.' },
};

function computeMetrics(reports, now, openIncidents) {
  const resolved = reports.filter((r) => r.status === 'resuelto');
  const rejected = reports.filter((r) => r.status === 'rechazado').length;
  const open = reports.filter((r) => !['resuelto', 'rechazado'].includes(r.status));
  const attendable = reports.length - rejected;
  const values = {
    created: reports.length,
    open: open.length,
    resolved: resolved.length,
    rejected,
    resolutionRate: attendable ? round1((resolved.length / attendable) * 100) : null,
    avgResolutionHours: resolved.length
      ? round1(resolved.reduce((s, r) => s + hoursBetween(r.createdAt, r.resolvedAt), 0) / resolved.length)
      : null,
    onTimeRate: resolved.length
      ? round1((resolved.filter((r) => new Date(r.resolvedAt) <= new Date(r.dueAt)).length / resolved.length) * 100)
      : null,
    overdueOpen: open.filter((r) => isOverdue(r, now)).length,
    openIncidents,
  };
  return values;
}

/** CSV seguro: escapa comillas y neutraliza fórmulas (=, +, -, @) para Excel/LibreOffice. */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells) => cells.map(csvCell).join(',');

export function createIndicatorsService({ repos, ctx, changeLog, clock = () => new Date() }) {
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

  async function collect(actor, query) {
    const filters = await ctx.parseReportFilters(actor, query);
    const { items, total } = await repos.reports.list({ ...filters, limit: EXPORT_CAP, offset: 0 });
    let openIncidents = 0;
    for (const r of items) {
      openIncidents += (await repos.incidents.list({ reportId: r.id, statuses: ['abierta', 'en_atencion'], limit: 1, offset: 0 })).total;
    }
    return { filters, items, total, openIncidents };
  }

  async function operationalReport(actor, query = {}) {
    const now = clock();
    const { items, total, openIncidents } = await collect(actor, query);
    const values = computeMetrics(items, now, openIncidents);
    const types = await ctx.typeMap();
    const group = (keyFn, labelFn) => {
      const map = new Map();
      for (const r of items) {
        const k = keyFn(r) ?? '—';
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
      }
      return [...map.entries()].map(([key, list]) => {
        const m = computeMetrics(list, now, null);
        return { key, label: labelFn(key), created: m.created, resolved: m.resolved, open: m.open, overdueOpen: m.overdueOpen, avgResolutionHours: m.avgResolutionHours, onTimeRate: m.onTimeRate };
      }).sort((a, b) => b.created - a.created);
    };
    const names = await ctx.userNames(items.map((r) => r.assigneeId));
    return {
      generatedAt: now,
      filters: await describeFilters(query),
      truncated: total > items.length,
      metrics: Object.entries(METRIC_DEFINITIONS).map(([key, d]) => ({ key, ...d, value: values[key] })),
      byType: group((r) => r.typeCode, (k) => types.get(k)?.name ?? k),
      byAssignee: group((r) => r.assigneeId, (k) => (k === '—' ? 'Sin responsable' : names.get(k))),
      byStatus: STATUSES.map((s) => ({ key: s.key, label: s.label, count: items.filter((r) => r.status === s.key).length })),
      rows: items,
    };
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

    async report(actor, query = {}) {
      const { rows, ...rest } = await operationalReport(actor, query);
      return rest;
    },

    /** Exportación CSV (solo con permiso indicadores.create). Incluye fecha de generación y filtros. */
    async exportCsv(actor, query = {}) {
      const r = await operationalReport(actor, query);
      const types = await ctx.typeMap();
      const names = await ctx.userNames(r.rows.map((x) => x.assigneeId));
      const lines = [
        csvRow(['Reporte operativo de CiudadAlerta']),
        csvRow(['Generado', r.generatedAt.toISOString()]),
        csvRow(['Generado por', actor.user.fullName]),
        csvRow(['Filtros', Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join('; ') || 'ninguno']),
        ...(r.truncated ? [csvRow(['Aviso', `Se exportaron los primeros ${EXPORT_CAP} reportes`])] : []),
        '',
        csvRow(['Métrica', 'Valor', 'Unidad', 'Definición']),
        ...r.metrics.map((m) => csvRow([m.label, m.value ?? 'n/d', m.unit, m.definition])),
        '',
        csvRow(['Código', 'Tipo', 'Título', 'Ubicación', 'Estado', 'Responsable', 'Creado', 'Fecha límite', 'Resuelto', 'Vencido']),
        ...r.rows.map((x) => csvRow([
          x.code, types.get(x.typeCode)?.name ?? x.typeCode, x.title, x.location, statusLabel(x.status),
          x.assigneeId ? names.get(x.assigneeId) : '', x.createdAt, x.dueAt, x.resolvedAt ?? '', isOverdue(x, r.generatedAt) ? 'sí' : 'no',
        ])),
      ];
      await changeLog.record({ actor, entity: 'export', action: 'export_csv', newValues: { filters: r.filters, rows: r.rows.length } });
      const stamp = r.generatedAt.toISOString().slice(0, 16).replace(/[:T]/g, '-');
      // BOM para que Excel abra el UTF-8 con tildes correctamente.
      return { filename: `reporte-operativo-${stamp}.csv`, csv: `﻿${lines.join('\r\n')}\r\n` };
    },
  };
}
