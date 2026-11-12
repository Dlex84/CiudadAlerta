// HU-1.3 — Gestión de roles  |  HU-1.4 — Gestión de permisos
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn, startTestApp } from './helpers/app.js';

describe('HU-1.3 Roles', () => {
  let app, root;
  before(async () => {
    app = await startTestApp();
    root = (await loggedIn(app, 'super_admin', 'root@test.do')).c;
  });
  after(() => app.close());

  test('lista los roles disponibles (incluye los del sistema y conteo de usuarios)', async () => {
    const res = await root.get('/api/roles');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.items.map((r) => r.code), ['super_admin', 'admin', 'supervisor', 'operador', 'gerente', 'auditor', 'ciudadano']);
    assert.equal(res.data.items[0].userCount, 1);
  });

  test('crea, modifica y desactiva roles', async () => {
    const c = await root.post('/api/roles', { name: 'Inspector de Campo', description: 'Verifica reportes en sitio', dashboardPath: '/admin' });
    assert.equal(c.status, 201);
    assert.equal(c.data.isSystem, false);
    const id = c.data.id;
    assert.equal((await root.post('/api/roles', { name: 'inspector de campo' })).data.error.code, 'role_name_taken');
    assert.equal((await root.post('/api/roles', { name: 'Otro', dashboardPath: '/hackeo' })).data.error.code, 'invalid_dashboard');
    const u = await root.patch(`/api/roles/${id}`, { name: 'Inspector', description: 'Nuevo texto' });
    assert.equal(u.data.name, 'Inspector');
    const off = await root.patch(`/api/roles/${id}`, { isActive: false });
    assert.equal(off.data.isActive, false);
    // un rol inactivo no puede asignarse
    const res = await root.post('/api/users', { fullName: 'Nuevo Usuario', email: 'n@test.do', roleId: id });
    assert.equal(res.data.error.code, 'invalid_role');
    assert.equal((await root.delete(`/api/roles/${id}`)).status, 204);
    assert.equal((await root.get(`/api/roles/${id}`)).status, 404);
  });

  test('no permite eliminar ni desactivar un rol asociado a usuarios activos', async () => {
    const r = await root.post('/api/roles', { name: 'Rol en uso' });
    await root.post('/api/users', { fullName: 'Con Rol', email: 'conrol@test.do', roleId: r.data.id });
    const del = await root.delete(`/api/roles/${r.data.id}`);
    assert.equal(del.status, 409);
    assert.equal(del.data.error.code, 'role_in_use');
    assert.equal((await root.patch(`/api/roles/${r.data.id}`, { isActive: false })).data.error.code, 'role_in_use');
  });

  test('los roles del sistema no se eliminan ni se renombran (solo la descripción)', async () => {
    const admin = await app.role('admin');
    assert.equal((await root.delete(`/api/roles/${admin.id}`)).data.error.code, 'role_is_system');
    assert.equal((await root.patch(`/api/roles/${admin.id}`, { name: 'Jefe' })).data.error.code, 'role_is_system');
    assert.equal((await root.patch(`/api/roles/${admin.id}`, { description: 'Texto' })).status, 200);
  });

  test('un administrador (solo lectura de roles) no puede crear roles', async () => {
    const { c } = await loggedIn(app, 'admin', 'admin@test.do');
    assert.equal((await c.get('/api/roles')).status, 200);
    assert.equal((await c.post('/api/roles', { name: 'Intruso' })).status, 403);
  });
});

describe('HU-1.4 Permisos por módulo', () => {
  let app, root;
  before(async () => {
    app = await startTestApp();
    root = (await loggedIn(app, 'super_admin', 'root@test.do')).c;
  });
  after(() => app.close());

  test('devuelve la matriz módulo x crear/consultar/modificar/eliminar', async () => {
    const sup = await app.role('supervisor');
    const res = await root.get(`/api/roles/${sup.id}/permissions`);
    assert.equal(res.status, 200);
    const aud = res.data.permissions.find((p) => p.module === 'auditoria');
    assert.deepEqual([aud.create, aud.read, aud.update, aud.delete], [false, true, false, false]);
    assert.equal(res.data.permissions.length, 14); // 5 de la Épica 1 + 7 de la Épica 2 + 2 de la Épica 3
  });

  test('los cambios aplican de inmediato, incluso a sesiones ya abiertas', async () => {
    const { c: sup } = await loggedIn(app, 'supervisor', 'sup@test.do');
    assert.equal((await sup.get('/api/audit/access')).status, 200);
    const role = await app.role('supervisor');
    const matrix = (await root.get(`/api/roles/${role.id}/permissions`)).data.permissions;
    matrix.find((p) => p.module === 'auditoria').read = false;
    const put = await root.put(`/api/roles/${role.id}/permissions`, { permissions: matrix });
    assert.equal(put.status, 200);
    assert.equal((await sup.get('/api/audit/access')).status, 403, 'misma sesión, permiso retirado');
    matrix.find((p) => p.module === 'auditoria').read = true;
    await root.put(`/api/roles/${role.id}/permissions`, { permissions: matrix });
    assert.equal((await sup.get('/api/audit/access')).status, 200, 'y se restituye al instante');
  });

  test('módulos omitidos quedan sin permisos; valida módulo, duplicados y tipos', async () => {
    const r = await root.post('/api/roles', { name: 'Auditor externo' });
    const ok = await root.put(`/api/roles/${r.data.id}/permissions`, { permissions: [{ module: 'auditoria', read: true }] });
    const flags = ok.data.permissions.find((p) => p.module === 'usuarios');
    assert.equal(flags.read, false);
    assert.equal(ok.data.permissions.find((p) => p.module === 'auditoria').read, true);
    const put = (permissions) => root.put(`/api/roles/${r.data.id}/permissions`, { permissions });
    assert.equal((await put([{ module: 'inventado', read: true }])).data.error.code, 'invalid_module');
    assert.equal((await put([{ module: 'roles' }, { module: 'roles' }])).data.error.code, 'duplicate_module');
    assert.equal((await put([{ module: 'roles', read: 'si' }])).data.error.code, 'invalid_permissions');
  });

  test('el Super Administrador es inmutable y nadie edita los permisos de su propio rol', async () => {
    const sup = await app.role('super_admin');
    assert.equal((await root.put(`/api/roles/${sup.id}/permissions`, { permissions: [] })).data.error.code, 'role_locked');
    assert.equal((await root.get(`/api/roles/${sup.id}/permissions`)).data.locked, true);
    const r = await root.post('/api/roles', { name: 'Gestor de permisos', dashboardPath: '/admin' });
    await root.put(`/api/roles/${r.data.id}/permissions`, { permissions: [{ module: 'permisos', read: true, update: true }] });
    await app.addUser({ email: 'gp@test.do', roleCode: 'ciudadano' });
    const user = await app.repos.users.findByEmail('gp@test.do');
    await app.repos.users.update(user.id, { roleId: r.data.id });
    const gp = app.client();
    await gp.login('gp@test.do');
    const own = await gp.put(`/api/roles/${r.data.id}/permissions`, { permissions: [{ module: 'permisos', read: true, update: true, create: true }] });
    assert.equal(own.data.error.code, 'cannot_edit_own_role');
  });

  test('el Administrador por defecto no puede ver ni editar permisos', async () => {
    const { c } = await loggedIn(app, 'admin', 'admin@test.do');
    const role = await app.role('ciudadano');
    assert.equal((await c.get(`/api/roles/${role.id}/permissions`)).status, 403);
  });
});
