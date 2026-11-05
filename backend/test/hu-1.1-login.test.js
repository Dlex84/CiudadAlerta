// HU-1.1 — Autenticación de usuarios
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn, PASSWORD, startTestApp } from './helpers/app.js';

describe('HU-1.1 Autenticación', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  test('valida usuario y contraseña y entrega una sesión segura (cookie HttpOnly + SameSite)', async () => {
    await app.addUser({ email: 'ana@test.do', roleCode: 'ciudadano' });
    const c = app.client();
    const res = await c.login('ANA@test.do'); // el correo no distingue mayúsculas
    assert.equal(res.status, 200);
    const cookie = res.setCookie[0];
    assert.match(cookie, /^ca_session=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(JSON.stringify(res.data), /passwordHash|password_hash/);
    assert.equal((await c.get('/api/me')).status, 200);
  });

  test('credenciales inválidas: mismo mensaje exista o no el correo', async () => {
    const a = await app.client().login('ana@test.do', 'incorrecta-123');
    const b = await app.client().login('no-existe@test.do', 'incorrecta-123');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.error.message, 'Correo o contraseña incorrectos.');
    assert.deepEqual(a.data, b.data);
    assert.equal(a.setCookie.length, 0, 'no se crea sesión');
  });

  test('redirige al dashboard según el rol', async () => {
    const citizen = await loggedIn(app, 'ciudadano', 'c1@test.do');
    const admin = await loggedIn(app, 'admin', 'a1@test.do');
    const me1 = await citizen.c.get('/api/me');
    const me2 = await admin.c.get('/api/me');
    assert.equal(me1.data.redirectTo, '/inicio');
    assert.equal(me2.data.redirectTo, '/admin');
    const login = await app.client().login('c1@test.do');
    assert.equal(login.data.redirectTo, '/inicio');
  });

  test('registra fecha y hora del acceso (último acceso + auditoría)', async () => {
    const u = await app.addUser({ email: 'hora@test.do' });
    const before = Date.now();
    await app.client().login('hora@test.do');
    const after = (await app.repos.users.findById(u.id)).lastLoginAt;
    assert.ok(after.getTime() >= before - 1000);
    const logs = app.repos._db.logs.filter((l) => l.userId === u.id && l.event === 'login_success');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].createdAt instanceof Date);
  });

  test('sin sesión no hay acceso; cerrar sesión invalida la cookie', async () => {
    assert.equal((await app.client().get('/api/me')).status, 401);
    const { c } = await loggedIn(app, 'ciudadano', 'salir@test.do');
    const out = await c.post('/api/auth/logout');
    assert.equal(out.status, 204);
    assert.match(out.setCookie[0], /Max-Age=0/);
    // reutilizar la cookie anterior ya no funciona
    const stolen = app.client();
    const res = await stolen.login('salir@test.do');
    const token = res.setCookie[0].split(';')[0];
    await stolen.post('/api/auth/logout');
    const replay = await app.client().get('/api/me', { headers: { cookie: token } });
    assert.equal(replay.status, 401);
  });

  test('la sesión expira', async () => {
    let now = new Date('2026-10-29T10:00:00Z');
    const a2 = await startTestApp({ clock: () => now, env: { SESSION_TTL_HOURS: '1' } });
    await a2.addUser({ email: 'exp@test.do' });
    const c = a2.client();
    await c.login('exp@test.do');
    assert.equal((await c.get('/api/me')).status, 200);
    now = new Date('2026-10-29T11:00:01Z');
    assert.equal((await c.get('/api/me')).status, 401);
    await a2.close();
  });

  test('usuarios invitados sin contraseña no pueden iniciar sesión', async () => {
    await app.addUser({ email: 'invitado@test.do', password: null });
    assert.equal((await app.client().login('invitado@test.do', PASSWORD)).status, 401);
  });
});
