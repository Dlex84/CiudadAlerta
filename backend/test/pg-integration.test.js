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
});
