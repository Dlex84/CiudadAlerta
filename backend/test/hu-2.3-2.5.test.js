// Persona B — HU-2.3 Asignación de responsables · HU-2.5 Alertas y vencimientos
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn } from './helpers/app.js';
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

describe('HU-2.5 Alertas y vencimientos', () => {
  let w;
  const failing = new Set();
  before(async () => {
    w = await opsWorld({
      env: { ALERT_DEDUPE_HOURS: '6' },
      mailer: { async send(m) { if (failing.has(m.to)) throw new Error('SMTP caído'); } },
    });
  });
  after(() => w.app.close());

  test('configura un plazo por tipo; aplica a los reportes nuevos', async () => {
    const types = await w.sup.c.get('/api/config/report-types');
    assert.equal(types.status, 200);
    assert.deepEqual(types.data.items.map((t) => [t.code, t.slaHours]).sort(), [['agua', 24], ['alumbrado', 72], ['basura', 48], ['vias', 168]]);

    const old = await newReport(w.citizen.c, { typeCode: 'basura' });
    assert.equal((await w.sup.c.patch('/api/config/report-types/basura', { slaHours: 10 })).status, 403, 'el supervisor solo consulta la configuración');
    const { c: adm } = await loggedIn(w.app, 'admin', 'adm@test.do');
    const upd = await adm.patch('/api/config/report-types/basura', { slaHours: 10, warnBeforeHours: 2 });
    assert.equal(upd.status, 200);
    assert.equal(upd.data.slaHours, 10);

    const fresh = await newReport(w.citizen.c, { typeCode: 'basura' });
    assert.equal(new Date(fresh.dueAt) - new Date(fresh.createdAt), 10 * 3_600_000);
    const still = await w.sup.c.get(`/api/reports/${old.id}`);
    assert.equal(new Date(still.data.report.dueAt) - new Date(still.data.report.createdAt), 48 * 3_600_000, 'los existentes conservan su fecha límite');

    assert.equal((await adm.patch('/api/config/report-types/basura', { slaHours: 0 })).data.error.code, 'invalid_sla_hours');
    assert.equal((await adm.patch('/api/config/report-types/basura', { slaHours: 1.5 })).data.error.code, 'invalid_sla_hours');
    assert.equal((await adm.patch('/api/config/report-types/basura', { warnBeforeHours: 10 })).data.error.code, 'invalid_warn_before_hours');
    assert.equal((await adm.patch('/api/config/report-types/nada', { slaHours: 5 })).status, 404);
    const log = await w.auditor.c.get('/api/changelog?entity=report_type');
    assert.deepEqual(log.data.items.find((i) => i.result === 'success').oldValues, { slaHours: 48, warnBeforeHours: 8, isActive: true });
  });

  test('marca los reportes vencidos y los próximos a vencer, y envía alertas sin repetirlas dentro de la ventana', async () => {
    const r = await newReport(w.citizen.c, { typeCode: 'agua' }); // 24 h, aviso 4 h antes
    await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op.user.id });

    let view = (await w.sup.c.get(`/api/reports/${r.id}`)).data.report;
    assert.equal(view.overdue, false);
    assert.equal(view.dueSoon, false);

    w.time.advanceHours(21); // faltan 3 h
    view = (await w.sup.c.get(`/api/reports/${r.id}`)).data.report;
    assert.equal(view.dueSoon, true);
    let s = await w.app.services.alerts.scan();
    assert.ok(s.dueSoon >= 1);
    let inbox = (await w.op.c.get('/api/notifications')).data.items;
    assert.equal(inbox[0].title, `El reporte ${r.code} vence pronto`);

    w.time.advanceHours(4); // venció hace 1 h
    view = (await w.sup.c.get(`/api/reports/${r.id}`)).data.report;
    assert.equal(view.overdue, true);
    assert.ok((await w.sup.c.get('/api/reports?overdue=1')).data.items.some((i) => i.id === r.id));
    assert.ok((await w.op.c.get('/api/alerts/upcoming')).data.items.some((i) => i.id === r.id));

    s = await w.app.services.alerts.scan();
    inbox = (await w.op.c.get('/api/notifications')).data.items;
    assert.equal(inbox[0].title, `El reporte ${r.code} está vencido`);
    const countOverdue = async () => (await w.op.c.get('/api/notifications?limit=100')).data.items.filter((n) => n.kind === 'alert_overdue' && n.reportId === r.id).length;
    assert.equal(await countOverdue(), 1);

    w.time.advanceHours(2);
    s = await w.app.services.alerts.scan();
    assert.ok(s.skipped >= 1, 'dentro de la ventana de 6 h no se repite');
    assert.equal(await countOverdue(), 1);

    w.time.advanceHours(5); // 7 h después del primer aviso
    await w.app.services.alerts.scan();
    assert.equal(await countOverdue(), 2, 'pasada la ventana se vuelve a avisar');
  });

  test('sin responsable, la alerta va a quienes pueden asignar', async () => {
    const r = await newReport(w.citizen.c, { typeCode: 'agua' });
    w.time.advanceHours(25);
    await w.app.services.alerts.scan();
    const sup = (await w.sup.c.get('/api/notifications?limit=100')).data.items;
    assert.ok(sup.some((n) => n.reportId === r.id && n.kind === 'alert_overdue'));
    const op = (await w.op2.c.get('/api/notifications?limit=100')).data.items;
    assert.ok(!op.some((n) => n.reportId === r.id), 'un operador sin asignación no recibe la alerta');
  });

  test('registra el resultado de cada envío, también los fallidos', async () => {
    failing.add('op2@test.do');
    const r = await newReport(w.citizen.c, { typeCode: 'agua' });
    await w.sup.c.put(`/api/reports/${r.id}/assignee`, { assigneeId: w.op2.user.id });
    w.time.advanceHours(25);
    await w.app.services.alerts.scan();
    const { c: adm } = await loggedIn(w.app, 'admin', 'adm2@test.do');
    const log = await adm.get(`/api/alerts/deliveries?report=${r.code}`);
    assert.equal(log.status, 200);
    const byChannel = Object.fromEntries(log.data.items.map((d) => [d.channel, d]));
    assert.equal(byChannel.in_app.status, 'sent');
    assert.equal(byChannel.email.status, 'failed');
    assert.equal(byChannel.email.error, 'SMTP caído');
    assert.equal(byChannel.email.userName, 'Prueba operador');
    assert.equal(byChannel.email.kind, 'overdue');
    assert.equal((await adm.get('/api/alerts/deliveries?status=failed')).data.items.every((d) => d.status === 'failed'), true);
    assert.equal((await adm.post('/api/alerts/run')).status, 200, 'también se puede lanzar a mano');
    assert.equal((await w.op.c.post('/api/alerts/run')).status, 403);
  });
});
