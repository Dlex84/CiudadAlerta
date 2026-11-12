// Épica 3 — Gestión de recursos e inventario (HU-3.1 a HU-3.6), contra la API HTTP real.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { newReport, opsWorld } from './helpers/ops.js';

describe('Épica 3: recursos e inventario', () => {
  let w, bulbs, ladder, report;
  before(async () => {
    w = await opsWorld();
    report = await newReport(w.citizen.c);
  });
  after(() => w.app.close());

  test('HU-3.1: registrar y consultar recursos; nombre único; la existencia no se edita a mano', async () => {
    const res = await w.sup.c.post('/api/resources', { name: 'Bombilla LED 100 W', kind: 'material', unit: 'unidades', minStock: 5, location: 'Almacén central' });
    assert.equal(res.status, 201);
    bulbs = res.data;
    assert.equal(bulbs.code, 'REC-0001');
    assert.equal(bulbs.stock, 0);
    assert.equal(bulbs.stockStatus, 'agotado');
    assert.equal((await w.sup.c.post('/api/resources', { name: 'bombilla led 100 w', kind: 'material', unit: 'u' })).data.error.code, 'resource_name_taken');
    assert.equal((await w.sup.c.post('/api/resources', { name: 'X', kind: 'otro', unit: 'u' })).status, 400);
    ladder = (await w.sup.c.post('/api/resources', { name: 'Escalera telescópica', kind: 'equipo', unit: 'unidades', minStock: 1 })).data;
    assert.equal((await w.sup.c.patch(`/api/resources/${bulbs.id}`, { stock: 999 })).data.error.code, 'stock_read_only');

    const list = await w.op.c.get('/api/resources?q=bombilla');
    assert.equal(list.data.total, 1);
    assert.equal((await w.op.c.get('/api/resources/REC-0001')).data.resource.id, bulbs.id, 'se consulta por código');
  });

  test('permisos: el ciudadano no ve el inventario; el gerente consulta pero no registra movimientos', async () => {
    assert.equal((await w.citizen.c.get('/api/resources')).status, 403);
    assert.equal((await w.manager.c.get('/api/resources')).status, 200);
    assert.equal((await w.manager.c.post(`/api/resources/${bulbs.id}/movements`, { type: 'entrada', quantity: 1, reason: 'x' })).status, 403);
    assert.equal((await w.op.c.post('/api/resources', { name: 'Cemento', kind: 'material', unit: 'sacos' })).status, 403);
  });

  test('HU-3.2: entradas suman a la existencia y exigen el origen', async () => {
    assert.equal((await w.sup.c.post(`/api/resources/${bulbs.id}/movements`, { type: 'entrada', quantity: 10 })).data.error.code, 'invalid_reason');
    const res = await w.sup.c.post(`/api/resources/${bulbs.id}/movements`, { type: 'entrada', quantity: 10, reason: 'Compra OC-118' });
    assert.equal(res.status, 201);
    assert.equal(res.data.movement.balanceAfter, 10);
    assert.equal(res.data.resource.stockStatus, 'ok');
    await w.sup.c.post(`/api/resources/${ladder.id}/movements`, { type: 'entrada', quantity: 2, reason: 'Donación de la junta de vecinos' });
    assert.equal((await w.sup.c.post(`/api/resources/${bulbs.id}/movements`, { type: 'entrada', quantity: 0, reason: 'x' })).data.error.code, 'invalid_quantity');
  });

  test('HU-3.3 y HU-3.4: salida vinculada a un reporte; nunca deja la existencia negativa', async () => {
    const path = `/api/resources/${bulbs.id}/movements`;
    assert.equal((await w.op.c.post(path, { type: 'salida', quantity: 2 })).data.error.code, 'report_required');
    assert.equal((await w.op.c.post(path, { type: 'salida', quantity: 2, report: 'CA-9999' })).data.error.code, 'invalid_report');

    const check = await w.op.c.get(`/api/resources/${bulbs.id}/availability?quantity=50`);
    assert.equal(check.data.available, 10);
    assert.equal(check.data.sufficient, false);

    const tooMuch = await w.op.c.post(path, { type: 'salida', quantity: 50, report: report.code });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.data.error.code, 'insufficient_stock');
    assert.equal(tooMuch.data.error.details.available, 10);

    const out = await w.op.c.post(path, { type: 'salida', quantity: 6, report: report.code, reason: 'Cambio de luminarias' });
    assert.equal(out.status, 201);
    assert.equal(out.data.movement.balanceAfter, 4);
    assert.equal(out.data.movement.reportCode, report.code);
    assert.equal(out.data.resource.stockStatus, 'bajo');
    assert.equal((await w.op.c.post(`/api/resources/${ladder.id}/movements`, { type: 'salida', quantity: 1, report: report.code })).data.error.code, 'wrong_kind');
  });

  test('HU-3.4: al quedar bajo el mínimo se avisa a quien gestiona el inventario', async () => {
    const n = await w.sup.c.get('/api/notifications');
    assert.ok(n.data.items.some((x) => x.kind === 'low_stock' && x.title.includes('Bombilla')));
  });

  test('HU-3.3: asignación y devolución de equipos con control de lo que tiene cada persona', async () => {
    const path = `/api/resources/${ladder.id}/movements`;
    assert.equal((await w.sup.c.post(path, { type: 'asignacion', quantity: 1, assigneeId: w.citizen.user.id })).data.error.code, 'invalid_assignee');
    const a = await w.sup.c.post(path, { type: 'asignacion', quantity: 1, assigneeId: w.op.user.id, report: report.code });
    assert.equal(a.status, 201);
    assert.equal(a.data.resource.stock, 1);
    const detail = await w.sup.c.get(`/api/resources/${ladder.id}`);
    assert.deepEqual(detail.data.outstanding.map((x) => [x.assigneeId, x.quantity]), [[w.op.user.id, 1]]);
    assert.equal((await w.sup.c.post(path, { type: 'devolucion', quantity: 2, assigneeId: w.op.user.id })).data.error.code, 'return_exceeds_assigned');
    assert.equal((await w.sup.c.post(path, { type: 'devolucion', quantity: 1, assigneeId: w.op2.user.id })).data.error.code, 'return_exceeds_assigned');
    const back = await w.sup.c.post(path, { type: 'devolucion', quantity: 1, assigneeId: w.op.user.id });
    assert.equal(back.data.resource.stock, 2);
    assert.equal((await w.sup.c.get(`/api/resources/${ladder.id}`)).data.outstanding.length, 0);
  });

  test('HU-3.5: historial de movimientos con filtros, saldo y autor', async () => {
    const all = await w.auditor.c.get('/api/movements');
    assert.equal(all.status, 200);
    assert.equal(all.data.total, 5); // 2 entradas, 1 salida, 1 asignación, 1 devolución
    const byRes = await w.auditor.c.get(`/api/movements?resource=${bulbs.code}`);
    assert.deepEqual(byRes.data.items.map((m) => [m.type, m.quantity, m.balanceAfter]), [['salida', 6, 4], ['entrada', 10, 10]]);
    assert.equal(byRes.data.items[0].actorName, 'Prueba operador');
    assert.equal((await w.auditor.c.get(`/api/movements?report=${report.code}`)).data.total, 2);
    assert.equal((await w.auditor.c.get('/api/movements?type=devolucion')).data.total, 1);
    assert.equal((await w.auditor.c.get('/api/movements?type=robo')).status, 400);
  });

  test('HU-3.6: reporte de existencias y movimientos, y exportación CSV', async () => {
    const s = await w.manager.c.get('/api/inventory/summary');
    assert.equal(s.data.totals.recursos, 2);
    assert.equal(s.data.totals.bajoMinimo, 1);
    assert.equal(s.data.totals.movimientos, 5);
    const b = s.data.rows.find((r) => r.code === 'REC-0001');
    assert.deepEqual([b.stock, b.entradas, b.salidas], [4, 10, 6]);
    assert.ok(s.data.generatedAt);

    const csv = await w.manager.c.get('/api/inventory/summary.csv');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.data, /Bombilla LED 100 W,material,unidades,4,5,Bajo mínimo,10,6/);
    assert.equal((await w.citizen.c.get('/api/inventory/summary.csv')).status, 403);
  });

  test('desactivar un recurso impide entregarlo, pero se puede seguir consultando', async () => {
    await w.sup.c.patch(`/api/resources/${ladder.id}`, { isActive: false });
    const r = await w.sup.c.post(`/api/resources/${ladder.id}/movements`, { type: 'asignacion', quantity: 1, assigneeId: w.op.user.id });
    assert.equal(r.data.error.code, 'resource_inactive');
    assert.equal((await w.sup.c.get('/api/resources')).data.total, 1, 'por defecto solo activos');
    assert.equal((await w.sup.c.get('/api/resources?active=all')).data.total, 2);
  });
});
