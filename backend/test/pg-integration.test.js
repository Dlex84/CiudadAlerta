// Mismos flujos clave pero contra PostgreSQL real (valida migración + repositorios SQL).
// Se omite si no hay TEST_DATABASE_URL. CUIDADO: reinicia el esquema "public" de esa base.
//   TEST_DATABASE_URL=postgres://ciudadalerta:ciudadalerta@localhost:5432/ciudadalerta_test npm test
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { createPgRepos } from '../src/repositories/pg/index.js';
import { PASSWORD, startTestApp } from './helpers/app.js';

const url = process.env.TEST_DATABASE_URL;
const safe = url && /test/i.test(new URL(url).pathname);

describe('PostgreSQL (integración)', { skip: !url ? 'define TEST_DATABASE_URL para ejecutar' : !safe ? 'el nombre de la base debe contener "test"' : false }, () => {
  let pool, app, admin;
  before(async () => {
    pool = await createPool(url);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
    app = await startTestApp({ repos: createPgRepos(pool) });
    await app.addUser({ email: 'root@test.do', roleCode: 'super_admin', fullName: 'Root' });
    admin = app.client();
    assert.equal((await admin.login('root@test.do')).status, 200);
  });
  after(async () => { await app?.close(); await pool?.end(); });

  test('roles del sistema sembrados con su matriz de permisos', async () => {
    const res = await admin.get('/api/roles');
    assert.deepEqual(res.data.items.map((r) => r.code), ['super_admin', 'admin', 'supervisor', 'operador', 'gerente', 'auditor', 'ciudadano']);
    const sup = res.data.items.find((r) => r.code === 'supervisor');
    const perms = await admin.get(`/api/roles/${sup.id}/permissions`);
    assert.equal(perms.data.permissions.find((p) => p.module === 'auditoria').read, true);
  });

  test('usuarios: alta, correo único (índice), búsqueda, bloqueo, eliminación lógica', async () => {
    const role = await app.role('ciudadano');
    const body = { fullName: 'Pedro Pérez', email: 'Pedro@test.do', phone: '809-555-0101', roleId: role.id };
    const c = await admin.post('/api/users', body);
    assert.equal(c.status, 201);
    assert.equal((await admin.post('/api/users', { ...body, email: 'pedro@TEST.do' })).data.error.code, 'email_taken');
    const list = await admin.get('/api/users?q=ped%25&status=active');
    assert.equal(list.data.total, 0, 'el % se escapa y no actúa como comodín');
    const found = await admin.get('/api/users?q=pedro');
    assert.equal(found.data.items[0].roleName, 'Ciudadano');
    const id = found.data.items[0].id;
    assert.equal((await admin.post(`/api/users/${id}/block`, { reason: 'Prueba' })).data.status, 'blocked');
    assert.equal((await admin.post(`/api/users/${id}/unblock`)).data.status, 'active');
    assert.equal((await admin.delete(`/api/users/${id}`)).status, 204);
    assert.equal((await admin.post('/api/users', body)).status, 201, 'correo liberado tras eliminar');
  });

  test('roles: creación, permisos transaccionales, protección de rol en uso', async () => {
    const r = await admin.post('/api/roles', { name: 'Inspector', dashboardPath: '/admin' });
    assert.equal(r.status, 201);
    assert.equal((await admin.post('/api/roles', { name: 'inspector' })).data.error.code, 'role_name_taken');
    const put = await admin.put(`/api/roles/${r.data.id}/permissions`, { permissions: [{ module: 'reportes', read: true, update: true }] });
    assert.equal(put.data.permissions.find((p) => p.module === 'reportes').update, true);
    await admin.post('/api/users', { fullName: 'Ins Pector', email: 'ins@test.do', roleId: r.data.id });
    assert.equal((await admin.delete(`/api/roles/${r.data.id}`)).data.error.code, 'role_in_use');
  });

  test('recuperación de contraseña: token de un solo uso y sesiones revocadas', async () => {
    await app.addUser({ email: 'olvido@test.do' });
    const c = app.client();
    await c.login('olvido@test.do');
    await c.post('/api/auth/forgot-password', { email: 'olvido@test.do' });
    const token = app.sent.at(-1).text.match(/token=([\w-]+)/)[1];
    assert.equal((await c.post('/api/auth/reset-password', { token, password: 'Nueva-clave-9' })).status, 200);
    assert.equal((await c.post('/api/auth/reset-password', { token, password: 'Otra-clave-99' })).status, 400);
    assert.equal((await c.get('/api/me')).status, 401);
    assert.equal((await app.client().login('olvido@test.do', 'Nueva-clave-9')).status, 200);
    assert.equal((await app.client().login('olvido@test.do', PASSWORD)).status, 401);
  });

  test('Épica 2: ciclo completo de un reporte (código, estados, asignación, aprobación, incidencias)', async () => {
    const { loggedIn } = await import('./helpers/app.js');
    const vecino = (await loggedIn(app, 'ciudadano', 'vecino-pg@test.do')).c;
    const sup = (await loggedIn(app, 'supervisor', 'sup-pg@test.do')).c;
    const op = await loggedIn(app, 'operador', 'op-pg@test.do');
    const body = { typeCode: 'alumbrado', title: 'Poste apagado', description: 'Sin luz desde el lunes en la esquina.', location: 'Calle 10' };
    const r1 = (await vecino.post('/api/reports', body)).data;
    const r2 = (await vecino.post('/api/reports', { ...body, typeCode: 'agua' })).data;
    assert.equal(r1.code, 'CA-0001', 'código desde la secuencia de PostgreSQL');
    assert.equal(r2.code, 'CA-0002');
    assert.equal((await vecino.get('/api/reports/ca-0001')).data.report.id, r1.id, 'búsqueda por código sin distinguir mayúsculas');

    for (const to of ['validado', 'en_revision']) assert.equal((await sup.post(`/api/reports/${r1.id}/transitions`, { to })).status, 200);
    assert.equal((await sup.put(`/api/reports/${r1.id}/assignee`, { assigneeId: op.user.id })).status, 200);
    assert.equal((await sup.post(`/api/reports/${r1.id}/transitions`, { to: 'en_proceso' })).status, 200);
    assert.equal((await sup.get(`/api/reports?assigneeId=${op.user.id}&status=en_proceso&q=poste`)).data.total, 1);

    const inc = await op.c.post(`/api/reports/${r1.id}/incidents`, { category: 'material', description: 'Falta bombilla', priority: 'alta' });
    assert.equal(inc.status, 201);
    assert.equal((await op.c.patch(`/api/incidents/${inc.data.incident.id}`, { status: 'resuelta', resolution: 'Comprada en ferretería' })).status, 200);
    assert.equal((await sup.get(`/api/incidents/${inc.data.incident.id}`)).data.events.length, 2);

    assert.equal((await op.c.post(`/api/reports/${r1.id}/transitions`, { to: 'resuelto' })).data.error.code, 'approval_required');
    const req = await op.c.post(`/api/reports/${r1.id}/approvals`);
    assert.equal(req.status, 201);
    const step = req.data.rounds[0].steps[0];
    assert.equal((await sup.post(`/api/reports/${r1.id}/approvals/${step.id}/decision`, { decision: 'approved' })).status, 200);
    assert.equal((await op.c.post(`/api/reports/${r1.id}/transitions`, { to: 'resuelto' })).data.report.status, 'resuelto');

    const dash = (await sup.get('/api/dashboard')).data.indicators;
    assert.equal(dash.creados, 2);
    assert.equal(dash.completados, 1);
    assert.equal(dash.pendientes, (await sup.get('/api/reports?bucket=pendientes')).data.total);
    const metrics = (await sup.get('/api/indicators/report')).data.metrics;
    assert.equal(metrics.find((m) => m.key === 'resolutionRate').value, 50);
    assert.equal((await sup.get('/api/indicators/report.csv')).status, 200);

    assert.equal((await vecino.get('/api/notifications')).data.unread >= 1, true);
    const scan = await app.services.alerts.scan();
    assert.equal(scan.checked, 1, 'solo revisa los abiertos');
  });

  test('Épica 2: la bitácora es de solo inserción también en la base de datos', async () => {
    const log = await admin.get('/api/changelog?report=CA-0001');
    assert.ok(log.data.total >= 8);
    assert.ok(log.data.items.some((i) => i.action === 'status_change' && i.oldValues.status === 'en_proceso'));
    await assert.rejects(pool.query("UPDATE change_log SET action = 'x'"), /solo inserción/);
    await assert.rejects(pool.query('DELETE FROM change_log'), /solo inserción/);
    await assert.rejects(pool.query('TRUNCATE change_log'), /solo inserción/);
    assert.equal((await admin.get('/api/changelog?report=CA-0001')).data.total, log.data.total);
  });

  test('perfil y auditoría con filtros', async () => {
    const { data } = await admin.patch('/api/me', { phone: '829-555-0000' });
    assert.equal(data.user.phone, '829-555-0000');
    assert.ok(data.user.profileUpdatedAt);
    const today = new Date().toISOString().slice(0, 10);
    const a = await admin.get(`/api/audit/access?event=login_failed&from=${today}&to=${today}`);
    assert.ok(a.data.total >= 1);
    assert.ok(a.data.items[0].createdAt);
    assert.equal((await admin.get('/api/audit/access?email=olvido&event=login_success')).data.total >= 1, true);
  });
  test('Épica 3: existencia atómica, saldo por movimiento, equipos prestados e historial inmutable', async () => {
    const { loggedIn } = await import('./helpers/app.js');
    const sup = (await loggedIn(app, 'supervisor', 'sup-inv@test.do')).c;
    const op = await loggedIn(app, 'operador', 'op-inv@test.do');
    const mat = (await sup.post('/api/resources', { name: 'Cemento gris', kind: 'material', unit: 'sacos', minStock: 2 })).data;
    assert.match(mat.code, /^REC-\d{4}$/, 'código desde la secuencia');
    const moves = (r) => `/api/resources/${r.id}/movements`;
    await sup.post(moves(mat), { type: 'entrada', quantity: 5, reason: 'Compra' });
    // Diez salidas de 1 al mismo tiempo sobre 5 sacos: solo 5 pueden pasar y la existencia nunca queda negativa.
    const tries = await Promise.all(Array.from({ length: 10 }, () =>
      op.c.post(moves(mat), { type: 'salida', quantity: 1, report: 'CA-0001' })));
    assert.equal(tries.filter((r) => r.status === 201).length, 5);
    assert.equal(tries.filter((r) => r.data?.error?.code === 'insufficient_stock').length, 5);
    assert.equal((await sup.get(`/api/resources/${mat.id}`)).data.resource.stock, 0);

    const eq = (await sup.post('/api/resources', { name: 'Taladro', kind: 'equipo', unit: 'unidades' })).data;
    await sup.post(moves(eq), { type: 'entrada', quantity: 2, reason: 'Compra' });
    await sup.post(moves(eq), { type: 'asignacion', quantity: 2, assigneeId: op.user.id });
    await sup.post(moves(eq), { type: 'devolucion', quantity: 1, assigneeId: op.user.id });
    assert.deepEqual((await sup.get(`/api/resources/${eq.id}`)).data.outstanding.map((x) => x.quantity), [1]);

    const s = (await sup.get('/api/inventory/summary')).data.rows.find((r) => r.id === mat.id);
    assert.deepEqual([s.entradas, s.salidas, s.stockStatus], [5, 5, 'agotado']);
    await assert.rejects(pool.query('UPDATE inventory_movements SET quantity = 99'), /solo inserción/);
    await assert.rejects(pool.query('DELETE FROM inventory_movements'), /solo inserción/);
  });

});
