// Persona A — HU-2.2 Registro y seguimiento de operaciones · HU-2.8 Bitácora de cambios
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { redact } from '../src/services/changelog.service.js';
import { PASSWORD } from './helpers/app.js';
import { newReport, opsWorld, reportBody } from './helpers/ops.js';

describe('HU-2.2 Registro y seguimiento de reportes', () => {
  let w;
  before(async () => { w = await opsWorld(); });
  after(() => w.app.close());

  test('crea un reporte con código único, tipo, descripción, fecha, estado inicial y fecha límite', async () => {
    const res = await w.citizen.c.post('/api/reports', reportBody());
    assert.equal(res.status, 201);
    const r = res.data;
    assert.match(r.code, /^CA-\d{4}$/);
    assert.equal(r.typeCode, 'alumbrado');
    assert.equal(r.typeName, 'Alumbrado');
    assert.equal(r.status, 'reportado');
    assert.equal(r.statusLabel, 'Reportado');
    assert.equal(r.createdBy.id, w.citizen.user.id);
    assert.equal(r.createdAt, w.time.now.toISOString());
    assert.equal(new Date(r.dueAt) - new Date(r.createdAt), 72 * 3_600_000, 'plazo de Alumbrado: 72 h');
    assert.equal(r.assignee, null);

    const other = await newReport(w.citizen.c, { typeCode: 'agua' });
    assert.notEqual(other.code, r.code);
    assert.equal(Number(other.code.slice(3)), Number(r.code.slice(3)) + 1, 'códigos consecutivos');
  });

  test('valida campos y reglas antes de guardar, con mensajes claros', async () => {
    const cases = [
      [{ typeCode: 'inexistente' }, 'invalid_type'],
      [{ typeCode: undefined }, 'invalid_type'],
      [{ title: 'ab' }, 'invalid_title'],
      [{ description: 'corta' }, 'invalid_description'],
      [{ location: '' }, 'invalid_location'],
    ];
    for (const [over, code] of cases) {
      const res = await w.citizen.c.post('/api/reports', reportBody(over));
      assert.equal(res.status, 400, code);
      assert.equal(res.data.error.code, code);
      assert.match(res.data.error.message, /[a-zá-ú]/i);
    }
    const msg = (await w.citizen.c.post('/api/reports', reportBody({ title: 'ab' }))).data.error.message;
    assert.equal(msg, 'El título debe tener entre 3 y 120 caracteres.');
  });

  test('el ciudadano solo ve y consulta sus propios reportes', async () => {
    const mine = await newReport(w.citizen.c, { title: 'Bache frente a la escuela', typeCode: 'vias' });
    const list = await w.citizen2.c.get('/api/reports');
    assert.equal(list.status, 200);
    assert.ok(!list.data.items.some((i) => i.id === mine.id));
    assert.equal((await w.citizen2.c.get(`/api/reports/${mine.id}`)).status, 404, 'no revela que existe');
    assert.equal((await w.citizen2.c.get(`/api/reports/${mine.code}`)).status, 404);

    const own = await w.citizen.c.get(`/api/reports/${mine.code}`);
    assert.equal(own.status, 200, 'se puede consultar por código (#CA-0001)');
    assert.equal(own.data.report.id, mine.id);
    // ?mine=1 o no, un ciudadano nunca ve los de otros
    const all = await w.citizen2.c.get('/api/reports?mine=0');
    assert.ok(all.data.items.every((i) => i.createdBy.id === w.citizen2.user.id));
    // El personal sí ve todos
    assert.ok((await w.sup.c.get('/api/reports')).data.items.some((i) => i.id === mine.id));
  });

  test('aplica solo las transiciones permitidas y rechaza las demás', async () => {
    const r = await newReport(w.citizen.c);
    const go = (to, extra = {}) => w.sup.c.post(`/api/reports/${r.id}/transitions`, { to, ...extra });

    const skip = await go('resuelto');
    assert.equal(skip.status, 409);
    assert.equal(skip.data.error.code, 'invalid_transition');
    assert.deepEqual(skip.data.error.details.allowed, ['validado', 'rechazado']);
    assert.match(skip.data.error.message, /No se puede pasar de «Reportado» a «Resuelto»/);

    assert.equal((await go('inventado')).data.error.code, 'invalid_status');
    assert.equal((await go('validado')).status, 200);
    assert.equal((await go('en_revision')).status, 200);
    const noAssignee = await go('en_proceso');
    assert.equal(noAssignee.data.error.code, 'assignee_required');

    const reject = await go('rechazado');
    assert.equal(reject.data.error.code, 'invalid_reason', 'rechazar exige motivo');
    const rejected = await go('rechazado', { reason: 'Duplicado del CA-0001' });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.report.status, 'rechazado');
    assert.ok(rejected.data.report.closedAt);
    assert.deepEqual(rejected.data.allowedTransitions, [], 'estado final');
    assert.equal((await go('validado')).data.error.code, 'invalid_transition');
  });

  test('seguimiento: estado actual e historial (pantalla 13), sin exponer nombres internos al ciudadano', async () => {
    const r = await newReport(w.citizen.c);
    await w.sup.c.post(`/api/reports/${r.id}/transitions`, { to: 'validado' });
    w.time.advanceHours(1);
    await w.sup.c.post(`/api/reports/${r.id}/transitions`, { to: 'en_revision', reason: 'Se programa visita' });

    const view = await w.citizen.c.get(`/api/reports/${r.id}`);
    assert.equal(view.data.report.status, 'en_revision');
    assert.deepEqual(view.data.history.map((h) => h.label), ['Reportado', 'Validado', 'En revisión']);
    assert.equal(view.data.history[2].reason, 'Se programa visita');
    assert.ok(view.data.history.every((h) => h.changedBy === null), 'el ciudadano no ve quién del equipo cambió el estado');
    assert.deepEqual(view.data.allowedTransitions, []);

    const staff = await w.sup.c.get(`/api/reports/${r.id}`);
    assert.equal(staff.data.history[1].changedBy, 'Prueba supervisor');
    assert.deepEqual(staff.data.allowedTransitions.map((t) => t.to), ['en_proceso', 'rechazado']);
  });

  test('avisa al ciudadano cuando su reporte cambia de estado (pantalla 14)', async () => {
    const r = await newReport(w.citizen.c);
    await w.sup.c.post(`/api/reports/${r.id}/transitions`, { to: 'validado' });
    const n = await w.citizen.c.get('/api/notifications');
    assert.equal(n.data.items[0].title, `Tu reporte ${r.code} está validado`);
    assert.equal(n.data.items[0].reportId, r.id);
  });

  test('permisos: el ciudadano no cambia estados y el operador solo trabaja en lo que tiene asignado', async () => {
    const r = await newReport(w.citizen.c);
    assert.equal((await w.citizen.c.post(`/api/reports/${r.id}/transitions`, { to: 'validado' })).status, 403);
    const op = await w.op.c.post(`/api/reports/${r.id}/transitions`, { to: 'validado' });
    assert.equal(op.status, 403);
    assert.equal(op.data.error.code, 'not_assignee');
    assert.equal((await w.manager.c.post('/api/reports', reportBody())).status, 403, 'el gerente no crea reportes');
    assert.equal((await w.app.client().get('/api/reports')).status, 401);
  });

  test('filtra y pagina', async () => {
    await newReport(w.citizen2.c, { typeCode: 'basura', title: 'Acumulación de basura' });
    const byType = await w.sup.c.get('/api/reports?typeCode=basura');
    assert.ok(byType.data.items.length >= 1);
    assert.ok(byType.data.items.every((i) => i.typeCode === 'basura'));
    assert.ok((await w.sup.c.get('/api/reports?q=acumulaci')).data.total >= 1);
    assert.equal((await w.sup.c.get('/api/reports?status=rechazado')).data.items.every((i) => i.status === 'rechazado'), true);
    assert.equal((await w.sup.c.get('/api/reports?status=xx')).data.error.code, 'invalid_status');
    assert.equal((await w.sup.c.get('/api/reports?from=ayer')).data.error.code, 'invalid_date');
    const p = await w.sup.c.get('/api/reports?limit=2&page=1');
    assert.equal(p.data.items.length, 2);
    assert.ok(p.data.total > 2);
  });
});

describe('HU-2.8 Bitácora de cambios', () => {
  let w, report;
  before(async () => {
    w = await opsWorld();
    report = await newReport(w.citizen.c);
    await w.sup.c.post(`/api/reports/${report.id}/transitions`, { to: 'validado' });
    await w.sup.c.post(`/api/reports/${report.id}/transitions`, { to: 'resuelto' }); // intento inválido
  });
  after(() => w.app.close());

  test('registra actor, fecha y hora, entidad, acción y resultado de cada cambio', async () => {
    const res = await w.auditor.c.get(`/api/changelog?report=${report.code}`);
    assert.equal(res.status, 200);
    const [rejected, change, create] = res.data.items;
    assert.equal(create.action, 'create');
    assert.equal(create.entity, 'report');
    assert.equal(create.actorName, 'Prueba ciudadano');
    assert.equal(create.result, 'success');
    assert.equal(create.reportCode, report.code);
    assert.ok(create.createdAt);

    assert.equal(change.action, 'status_change');
    assert.equal(change.actorId, w.sup.user.id);
    assert.deepEqual(change.oldValues, { status: 'reportado' }, 'guarda el valor anterior');
    assert.deepEqual(change.newValues, { status: 'validado' }, 'y el nuevo');

    assert.equal(rejected.result, 'rejected', 'también registra los intentos que las reglas rechazan');
    assert.equal(rejected.newValues.error, 'invalid_transition');
  });

  test('busca por reporte, usuario y periodo', async () => {
    const other = await newReport(w.citizen2.c);
    const byReport = await w.auditor.c.get(`/api/changelog?report=${other.code}`);
    assert.equal(byReport.data.total, 1);
    const byUser = await w.auditor.c.get(`/api/changelog?actorId=${w.sup.user.id}`);
    assert.ok(byUser.data.items.length >= 2);
    assert.ok(byUser.data.items.every((i) => i.actorId === w.sup.user.id));
    const day = w.time.now.toISOString().slice(0, 10);
    assert.ok((await w.auditor.c.get(`/api/changelog?from=${day}&to=${day}`)).data.total >= 4);
    assert.equal((await w.auditor.c.get('/api/changelog?from=2020-01-01&to=2020-01-02')).data.total, 0);
    assert.equal((await w.auditor.c.get('/api/changelog?entity=report&action=create')).data.total, 2);
    assert.equal((await w.auditor.c.get('/api/changelog?report=CA-9999')).data.total, 0);
    assert.equal((await w.auditor.c.get('/api/changelog?entity=otra')).data.error.code, 'invalid_entity');
    assert.equal((await w.auditor.c.get('/api/changelog?from=2026-02-01&to=2026-01-01')).data.error.code, 'invalid_period');
  });

  test('no se puede modificar ni eliminar: no hay endpoints y el repositorio no lo permite', async () => {
    const { items } = (await w.auditor.c.get('/api/changelog')).data;
    const id = items[0].id;
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      const res = await w.auditor.c.request(m, `/api/changelog/${id}`, { body: {} });
      assert.equal(res.status, 404, `${m} no existe`);
    }
    assert.equal((await w.auditor.c.request('DELETE', '/api/changelog')).status, 404);
    assert.deepEqual(Object.keys(w.app.repos.changeLog).sort(), ['append', 'search']);
  });

  test('no guarda contraseñas ni tokens', async () => {
    assert.deepEqual(redact({ password: 'x', nested: { resetToken: 'y', ok: 1 }, passwordHash: 'z' }),
      { password: '[oculto]', nested: { resetToken: '[oculto]', ok: 1 }, passwordHash: '[oculto]' });
    const dump = JSON.stringify((await w.auditor.c.get('/api/changelog?limit=100')).data);
    assert.ok(!dump.includes(PASSWORD));
  });

  test('solo quien tiene permiso de bitácora la consulta', async () => {
    assert.equal((await w.op.c.get('/api/changelog')).status, 403);
    assert.equal((await w.citizen.c.get('/api/changelog')).status, 403);
    assert.equal((await w.manager.c.get('/api/changelog')).status, 200);
  });
});
