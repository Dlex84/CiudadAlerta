// Persona D — HU-2.1 Panel de operaciones · HU-2.7 Reportes operativos
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { csvCell } from '../src/services/indicators.service.js';
import { approveClosure, newReport, opsWorld, toInProcess } from './helpers/ops.js';

/**
 * Escenario: 6 reportes en todos los estados.
 *  alumbrado: reportado · validado · en_proceso (op) · resuelto (op, 5 h) · rechazado
 *  agua:      en_revision (op2) → vence (plazo 24 h)
 */
async function scenario(w) {
  const t0 = w.time.now;
  const mk = (over) => newReport(w.citizen.c, over);
  const pending = await mk({ title: 'Lámpara apagada' });
  const validated = await mk({ title: 'Poste inclinado' });
  await w.sup.c.post(`/api/reports/${validated.id}/transitions`, { to: 'validado' });
  const working = await mk({ title: 'Cable suelto' });
  await toInProcess(w.sup.c, working.id, w.op.user.id);
  const solved = await mk({ title: 'Luminaria rota' });
  await toInProcess(w.sup.c, solved.id, w.op.user.id);
  w.time.advanceHours(5);
  await approveClosure(w.op.c, w.sup.c, solved.id);
  await w.op.c.post(`/api/reports/${solved.id}/transitions`, { to: 'resuelto' });
  const rejected = await mk({ title: 'Reporte duplicado' });
  await w.sup.c.post(`/api/reports/${rejected.id}/transitions`, { to: 'rechazado', reason: 'Duplicado' });
  const water = await mk({ typeCode: 'agua', title: 'Fuga de agua' });
  await w.sup.c.post(`/api/reports/${water.id}/transitions`, { to: 'validado' });
  await w.sup.c.post(`/api/reports/${water.id}/transitions`, { to: 'en_revision' });
  await w.sup.c.put(`/api/reports/${water.id}/assignee`, { assigneeId: w.op2.user.id });
  await w.op.c.post(`/api/reports/${working.id}/incidents`, { category: 'material', description: 'Falta cable de cobre', priority: 'media' });
  w.time.advanceHours(25); // la fuga (24 h desde su creación) ya venció
  return { t0, pending, validated, working, solved, rejected, water };
}

describe('HU-2.1 Panel de operaciones', () => {
  let w, s;
  before(async () => { w = await opsWorld(); s = await scenario(w); });
  after(() => w.app.close());

  test('muestra creados, en proceso, completados, rechazados y vencidos, con la última actualización', async () => {
    const res = await w.manager.c.get('/api/dashboard');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.indicators, { creados: 6, pendientes: 1, en_proceso: 3, completados: 1, rechazados: 1, vencidos: 1 });
    const latest = (await w.sup.c.get('/api/reports?limit=100')).data.items.map((i) => i.updatedAt).sort().at(-1);
    assert.equal(res.data.lastUpdatedAt, latest, 'fecha de la última actualización de los reportes');
    assert.equal(res.data.generatedAt, w.time.now.toISOString());
    assert.equal(res.data.byStatus.reduce((a, b) => a + b.count, 0), 6);
  });

  test('los indicadores cuadran con los registros consultables (con y sin filtros)', async () => {
    const filterSets = [
      {},
      { typeCode: 'alumbrado' },
      { typeCode: 'agua' },
      { assigneeId: w.op.user.id },
      { assigneeId: 'none' },
      { from: s.t0.toISOString().slice(0, 10), to: w.time.now.toISOString().slice(0, 10) },
      { status: 'en_proceso,resuelto' },
    ];
    for (const f of filterSets) {
      const q = new URLSearchParams(f).toString();
      const { indicators } = (await w.manager.c.get(`/api/dashboard?${q}`)).data;
      const count = async (extra) => (await w.manager.c.get(`/api/reports?${q}&${extra}`)).data.total;
      assert.equal(indicators.creados, await count(''), `creados ${q}`);
      for (const bucket of ['pendientes', 'en_proceso', 'completados', 'rechazados']) {
        assert.equal(indicators[bucket], await count(`bucket=${bucket}`), `${bucket} ${q}`);
      }
      assert.equal(indicators.vencidos, await count('overdue=1'), `vencidos ${q}`);
    }
  });

  test('filtra por periodo, estado, responsable y tipo; valida los filtros', async () => {
    assert.equal((await w.manager.c.get('/api/dashboard?typeCode=agua')).data.indicators.creados, 1);
    assert.equal((await w.manager.c.get(`/api/dashboard?assigneeId=${w.op.user.id}`)).data.indicators.creados, 2);
    assert.equal((await w.manager.c.get('/api/dashboard?status=rechazado')).data.indicators.rechazados, 1);
    const future = (await w.manager.c.get('/api/dashboard?from=2030-01-01')).data;
    assert.equal(future.indicators.creados, 0);
    assert.equal(future.lastUpdatedAt, null);
    assert.equal((await w.manager.c.get('/api/dashboard?from=ayer')).data.error.code, 'invalid_date');
    assert.equal((await w.manager.c.get('/api/dashboard?typeCode=x')).data.error.code, 'invalid_type');
    const f = (await w.manager.c.get(`/api/dashboard?typeCode=alumbrado&assigneeId=${w.op.user.id}`)).data.filters;
    assert.deepEqual(f, { typeCode: 'alumbrado', assigneeId: w.op.user.id, assigneeName: 'Prueba operador' });
  });

  test('solo con permiso de indicadores', async () => {
    assert.equal((await w.citizen.c.get('/api/dashboard')).status, 403);
    assert.equal((await w.op.c.get('/api/dashboard')).status, 200);
    assert.equal((await w.auditor.c.get('/api/dashboard')).status, 200);
  });
});

describe('HU-2.7 Reportes operativos', () => {
  let w, s;
  before(async () => { w = await opsWorld(); s = await scenario(w); });
  after(() => w.app.close());

  test('calcula métricas, cada una con su definición escrita', async () => {
    const res = await w.manager.c.get('/api/indicators/report');
    assert.equal(res.status, 200);
    const m = Object.fromEntries(res.data.metrics.map((x) => [x.key, x]));
    for (const x of res.data.metrics) {
      assert.ok(x.label && x.unit && x.definition.length > 20, `${x.key} tiene definición`);
    }
    assert.equal(m.created.value, 6);
    assert.equal(m.resolved.value, 1);
    assert.equal(m.rejected.value, 1);
    assert.equal(m.open.value, 4);
    assert.equal(m.resolutionRate.value, 20, '1 ÷ (6 − 1) × 100');
    assert.equal(m.avgResolutionHours.value, 5);
    assert.equal(m.onTimeRate.value, 100);
    assert.equal(m.overdueOpen.value, 1);
    assert.equal(m.openIncidents.value, 1);

    const types = Object.fromEntries(res.data.byType.map((t) => [t.key, t]));
    assert.equal(types.alumbrado.created, 5);
    assert.equal(types.agua.overdueOpen, 1);
    assert.equal(res.data.byAssignee.find((a) => a.key === w.op.user.id).label, 'Prueba operador');
    assert.equal(res.data.byAssignee.find((a) => a.key === '—').label, 'Sin responsable');
  });

  test('incluye la fecha de generación y los filtros usados', async () => {
    const day = s.t0.toISOString().slice(0, 10);
    const res = await w.manager.c.get(`/api/indicators/report?from=${day}&typeCode=agua`);
    assert.equal(res.data.generatedAt, w.time.now.toISOString());
    assert.deepEqual(res.data.filters, { from: day, typeCode: 'agua' });
    assert.equal(res.data.metrics.find((x) => x.key === 'created').value, 1);
  });

  test('exporta a CSV solo con permiso, con fecha de generación, filtros, definiciones y filas', async () => {
    assert.equal((await w.op.c.get('/api/indicators/report.csv')).status, 403, 'consultar no implica exportar');
    assert.equal((await w.auditor.c.get('/api/indicators/report.csv')).status, 403);
    const res = await w.manager.c.get('/api/indicators/report.csv?typeCode=alumbrado');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/csv/);
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="reporte-operativo-.*\.csv"$/);
    const csv = res.data;
    assert.ok(csv.startsWith('﻿') || csv.startsWith('Reporte'), 'UTF-8 con BOM para Excel');
    assert.match(csv, new RegExp(`Generado,${w.time.now.toISOString()}`));
    assert.match(csv, /Filtros,typeCode=alumbrado/);
    assert.match(csv, /Tasa de resolución,25,%,/);
    assert.match(csv, /Resueltos ÷ \(creados − rechazados\)/);
    assert.ok(csv.includes(s.solved.code));
    assert.ok(!csv.includes(s.water.code), 'respeta el filtro');

    const log = await w.auditor.c.get('/api/changelog?entity=export');
    assert.equal(log.data.items[0].newValues.filters.typeCode, 'alumbrado', 'la exportación queda registrada');
  });

  test('el CSV neutraliza fórmulas y escapa comillas', async () => {
    assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
    assert.equal(csvCell('+1'), "'+1");
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell(null), '');
    await newReport(w.citizen.c, { title: '=CMD()|calc' });
    const csv = (await w.manager.c.get('/api/indicators/report.csv')).data;
    assert.ok(csv.includes("'=CMD()|calc"));
    assert.ok(!/,=CMD/.test(csv));
  });
});
