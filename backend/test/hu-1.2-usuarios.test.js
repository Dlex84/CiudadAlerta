// HU-1.2 — Registro de usuarios por administrador  |  HU-1.6 — Bloqueo de usuarios
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn, PASSWORD, startTestApp } from './helpers/app.js';

describe('HU-1.2 Alta de usuarios por administrador', () => {
  let app, admin, ciudadanoRole;
  before(async () => {
    app = await startTestApp();
    admin = (await loggedIn(app, 'admin', 'admin@test.do')).c;
    ciudadanoRole = await app.role('ciudadano');
  });
  after(() => app.close());

  const body = (over = {}) => ({ fullName: 'Pedro Pérez', email: 'pedro@test.do', phone: '809-555-0101', roleId: ciudadanoRole.id, ...over });

  test('registra nombre, correo y teléfono; nace Activo y recibe invitación', async () => {
    const res = await admin.post('/api/users', body());
    assert.equal(res.status, 201);
    assert.equal(res.data.user.status, 'active');
    assert.equal(res.data.user.phone, '809-555-0101');
    assert.equal(res.data.invitationSent, true);
    const mail = app.sent.at(-1);
    assert.equal(mail.to, 'pedro@test.do');
    assert.match(mail.text, /#\/restablecer\?token=/);
  });

  test('el correo es único (sin distinguir mayúsculas)', async () => {
    const res = await admin.post('/api/users', body({ email: 'PEDRO@test.do' }));
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, 'email_taken');
  });

  test('el usuario invitado define su contraseña con el enlace y luego inicia sesión', async () => {
    const token = app.sent.at(-1).text.match(/token=([\w-]+)/)[1];
    const set = await app.client().post('/api/auth/reset-password', { token, password: 'Nueva-clave-1' });
    assert.equal(set.status, 200);
    const login = await app.client().login('pedro@test.do', 'Nueva-clave-1');
    assert.equal(login.status, 200);
  });

  test('valida campos obligatorios y rol', async () => {
    assert.equal((await admin.post('/api/users', body({ fullName: '' }))).status, 400);
    assert.equal((await admin.post('/api/users', body({ email: 'malo', fullName: 'X Y' }))).status, 400);
    assert.equal((await admin.post('/api/users', body({ email: 'n@test.do', roleId: 9999 }))).data.error.code, 'invalid_role');
    assert.equal((await admin.post('/api/users', body({ email: 'n@test.do', roleId: 'abc' }))).status, 400);
  });

  test('un administrador no puede crear Super Administradores (escalada de privilegios)', async () => {
    const sup = await app.role('super_admin');
    const res = await admin.post('/api/users', body({ email: 'escala@test.do', roleId: sup.id }));
    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'super_admin_required');
  });

  test('el ciudadano no puede acceder a la gestión de usuarios', async () => {
    const { c } = await loggedIn(app, 'ciudadano', 'vecino@test.do');
    assert.equal((await c.get('/api/users')).status, 403);
    assert.equal((await c.post('/api/users', body({ email: 'z@test.do' }))).status, 403);
  });

  test('listar con búsqueda y paginación; consultar, editar y eliminar (lógico, libera el correo)', async () => {
    const list = await admin.get('/api/users?q=pedro&limit=5');
    assert.equal(list.status, 200);
    assert.equal(list.data.items[0].email, 'pedro@test.do');
    assert.equal(list.data.items[0].roleName, 'Ciudadano');
    const id = list.data.items[0].id;
    assert.equal((await admin.get(`/api/users/${id}`)).data.fullName, 'Pedro Pérez');
    const upd = await admin.patch(`/api/users/${id}`, { fullName: 'Pedro P. Gómez', phone: '' });
    assert.equal(upd.data.fullName, 'Pedro P. Gómez');
    assert.equal(upd.data.phone, null);
    assert.equal((await admin.delete(`/api/users/${id}`)).status, 204);
    assert.equal((await admin.get(`/api/users/${id}`)).status, 404);
    assert.equal((await admin.post('/api/users', body())).status, 201, 'el correo quedó libre');
    assert.equal((await admin.get('/api/users/no-es-uuid')).status, 404);
  });

  test('no puede cambiarse el propio rol ni eliminarse a sí mismo', async () => {
    const me = (await admin.get('/api/me')).data.user;
    const sup = await app.role('supervisor');
    assert.equal((await admin.patch(`/api/users/${me.id}`, { roleId: sup.id })).data.error.code, 'cannot_change_own_role');
    assert.equal((await admin.delete(`/api/users/${me.id}`)).data.error.code, 'cannot_delete_self');
  });
});

describe('HU-1.6 Bloqueo de usuarios', () => {
  let app, admin, target, targetClient;
  before(async () => {
    app = await startTestApp();
    admin = (await loggedIn(app, 'admin', 'admin@test.do')).c;
    ({ c: targetClient, user: target } = await loggedIn(app, 'ciudadano', 'bloqueable@test.do'));
  });
  after(() => app.close());

  test('exige motivo, bloquea, cierra sesiones activas e impide iniciar sesión', async () => {
    assert.equal((await admin.post(`/api/users/${target.id}/block`, {})).status, 400);
    assert.equal((await targetClient.get('/api/me')).status, 200, 'tenía sesión activa');
    const res = await admin.post(`/api/users/${target.id}/block`, { reason: 'Uso indebido de la plataforma' });
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'blocked');
    assert.equal(res.data.blockedReason, 'Uso indebido de la plataforma');
    assert.equal((await targetClient.get('/api/me')).status, 401, 'su sesión fue cerrada');
    const login = await app.client().login('bloqueable@test.do');
    assert.equal(login.status, 403);
    assert.equal(login.data.error.code, 'user_blocked');
    assert.ok(app.repos._db.logs.some((l) => l.event === 'login_blocked' && l.userId === target.id));
  });

  test('no se puede bloquear dos veces; se puede reactivar y vuelve a entrar', async () => {
    assert.equal((await admin.post(`/api/users/${target.id}/block`, { reason: 'otra vez' })).data.error.code, 'already_blocked');
    const un = await admin.post(`/api/users/${target.id}/unblock`);
    assert.equal(un.data.status, 'active');
    assert.equal(un.data.blockedReason, null);
    assert.equal((await app.client().login('bloqueable@test.do')).status, 200);
    assert.equal((await admin.post(`/api/users/${target.id}/unblock`)).data.error.code, 'not_blocked');
  });

  test('no puede bloquearse a sí mismo ni a un Super Administrador', async () => {
    const me = (await admin.get('/api/me')).data.user;
    assert.equal((await admin.post(`/api/users/${me.id}/block`, { reason: 'prueba' })).data.error.code, 'cannot_block_self');
    const { user: sup } = await loggedIn(app, 'super_admin', 'root@test.do');
    assert.equal((await admin.post(`/api/users/${sup.id}/block`, { reason: 'prueba' })).status, 403);
  });
});
