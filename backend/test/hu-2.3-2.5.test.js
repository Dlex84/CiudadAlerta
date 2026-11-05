// Persona B — HU-2.3 Asignación de responsables · HU-2.5 Alertas y vencimientos
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { newReport, opsWorld } from './helpers/ops.js';

describe('HU-2.3 Asignación de responsables', () => {
  let w, blocked;
  before(async () => {
    w = await opsWorld();
    blocked = await w.app.addUser({ email: 'bloqueado@test.do', roleCode: 'operador', status: 'blocked', fullName: 'Op Bloqueado' });
  });
  after(() => w.app.close());

  test('solo se puede asignar a usuarios autorizados (activos y con permiso para atender reportes)', async () => {
    const res = await w.sup.c.get('/api/assignees');
    assert.equal(res.status, 200);
    const ids = res.data.items.map((u) => u.id);
    assert.ok(ids.includes(w.op.user.id) && ids.includes(w.sup.user.id));
    assert.ok(!ids.includes(w.citizen.user.id), 'un ciudadano no atiende reportes');
    assert.ok(!ids.includes(w.manager.user.id), 'el gerente solo consulta');
    assert.ok(!ids.includes(blocked.id), 'un usuario bloqueado no recibe asignaciones');

    const r = await newReport(w.citizen.c);
    for (const id of [w.citizen.user.id, blocked.id, 'no-es-uuid']) {
      const bad = await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: id });
      assert.equal(bad.status, 400);
      assert.equal(bad.data.error.code, 'invalid_assignee');
    }
  });

  test('asigna, registra quién y cuándo, y notifica al responsable (en la app y por correo)', async () => {
    const r = await newReport(w.citizen.c);
    const res = await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op.user.id });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.assignee, { id: w.op.user.id, name: 'Prueba operador' });
    assert.equal(res.data.assignedAt, w.time.now.toISOString());

    const inbox = await w.op.c.get('/api/notifications');
    assert.equal(inbox.data.items[0].title, `Se te asignó el reporte ${r.code}`);
    assert.equal(inbox.data.unread >= 1, true);
    const mail = w.app.sent.at(-1);
    assert.equal(mail.to, 'op@test.do');
    assert.match(mail.subject, new RegExp(r.code));

    const again = await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op.user.id });
    assert.equal(again.data.error.code, 'already_assigned');
  });

  test('reasignar exige motivo y queda registrado quién, cuándo y por qué', async () => {
    const r = await newReport(w.citizen.c);
    await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op.user.id });
    w.time.advanceHours(2);
    const noReason = await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op2.user.id });
    assert.equal(noReason.data.error.code, 'invalid_reason');
    const ok = await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op2.user.id, reason: 'Carga de trabajo' });
    assert.equal(ok.status, 200);

    const h = await w.sup.c.get(`/api/reports/${r.id}/assignments`);
    assert.equal(h.data.items.length, 2);
    const [first, second] = h.data.items;
    assert.equal(first.reason, null);
    assert.equal(second.assignedBy.name, 'Prueba supervisor');
    assert.equal(second.previousAssignee.id, w.op.user.id);
    assert.equal(second.assignee.id, w.op2.user.id);
    assert.equal(second.reason, 'Carga de trabajo');
    assert.equal(new Date(second.createdAt) - new Date(first.createdAt), 2 * 3_600_000);

    const prev = await w.op.c.get('/api/notifications');
    assert.equal(prev.data.items[0].title, `El reporte ${r.code} fue reasignado`);

    const log = await w.auditor.c.get(`/api/changelog?report=${r.code}&action=assign`);
    assert.equal(log.data.items[0].oldValues.assigneeName, 'Prueba operador');
    assert.equal(log.data.items[0].newValues.reason, 'Carga de trabajo');
  });

  test('filtra reportes por responsable', async () => {
    const mine = await newReport(w.citizen.c, { title: 'Fuga en la acera' });
    await w.sup.c.put(`/api/reports/${mine.id}/assignee`, { assigneeId: w.op2.user.id });
    const list = await w.sup.c.get(`/api/reports?assigneeId=${w.op2.user.id}`);
    assert.ok(list.data.items.length >= 1);
    assert.ok(list.data.items.every((i) => i.assignee.id === w.op2.user.id));
    const me = await w.op2.c.get('/api/reports?assigneeId=me');
    assert.equal(me.data.total, list.data.total);
    const none = await w.sup.c.get('/api/reports?assigneeId=none');
    assert.ok(none.data.items.every((i) => i.assignee === null));
    assert.equal((await w.sup.c.get('/api/reports?assigneeId=xx')).data.error.code, 'invalid_assignee');
  });

  test('permisos y reglas: el operador no asigna y un reporte cerrado no se reasigna', async () => {
    const r = await newReport(w.citizen.c);
    assert.equal((await w.op.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op.user.id })).status, 403);
    await w.sup.c.post(`/api/reports/${r.id}/transitions`, { to: 'rechazado', reason: 'No procede' });
    const closed = await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op.user.id });
    assert.equal(closed.data.error.code, 'report_closed');
  });

  test('notificaciones: marcar una o todas como leídas, solo las propias', async () => {
    const before = (await w.op.c.get('/api/notifications')).data;
    assert.ok(before.unread > 0);
    const id = before.items[0].id;
    assert.equal((await w.op2.c.post(`/api/notifications/${id}/read`)).status, 404, 'no puede tocar las de otro');
    assert.equal((await w.op.c.post(`/api/notifications/${id}/read`)).status, 204);
    assert.equal((await w.op.c.get('/api/notifications')).data.unread, before.unread - 1);
    assert.equal((await w.op.c.post('/api/notifications/read-all')).status, 204);
    assert.equal((await w.op.c.get('/api/notifications')).data.unread, 0);
    assert.equal((await w.op.c.get('/api/notifications?unread=1')).data.total, 0);
  });
});
