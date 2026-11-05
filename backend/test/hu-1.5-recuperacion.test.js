// HU-1.5 — Recuperación de contraseña
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { PASSWORD, startTestApp } from './helpers/app.js';

const tokenFrom = (mail) => mail.text.match(/token=([\w-]+)/)[1];

describe('HU-1.5 Recuperación de contraseña', () => {
  let app, now;
  before(async () => {
    now = new Date('2026-10-29T10:00:00Z');
    app = await startTestApp({ clock: () => now, env: { PASSWORD_RESET_TTL_MINUTES: '30' } });
    await app.addUser({ email: 'olvido@test.do', fullName: 'Olga Olvido' });
  });
  after(() => app.close());

  test('la solicitud responde igual exista o no el correo, y solo envía correo si existe', async () => {
    const c = app.client();
    const a = await c.post('/api/auth/forgot-password', { email: 'olvido@test.do' });
    const sentAfterReal = app.sent.length;
    const b = await c.post('/api/auth/forgot-password', { email: 'fantasma@test.do' });
    assert.equal(a.status, 200);
    assert.deepEqual(a.data, b.data);
    assert.equal(sentAfterReal, 1);
    assert.equal(app.sent.length, 1, 'no se envió nada al correo inexistente');
    assert.match(app.sent[0].text, /30 minutos/);
  });

  test('el enlace es temporal: expira según el tiempo configurable', async () => {
    const token = tokenFrom(app.sent.at(-1));
    now = new Date('2026-10-29T10:31:00Z');
    const res = await app.client().post('/api/auth/reset-password', { token, password: 'Otra-clave-99' });
    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, 'invalid_or_expired_token');
    now = new Date('2026-10-29T10:00:00Z');
  });

  test('establece nueva contraseña, el enlace usado deja de servir y la clave anterior no entra', async () => {
    const token = tokenFrom(app.sent.at(-1));
    const weak = await app.client().post('/api/auth/reset-password', { token, password: 'corta' });
    assert.equal(weak.data.error.code, 'weak_password');
    const ok = await app.client().post('/api/auth/reset-password', { token, password: 'Otra-clave-99' });
    assert.equal(ok.status, 200);
    assert.equal((await app.client().post('/api/auth/reset-password', { token, password: 'Tercera-clave-1' })).status, 400, 'ya usado');
    assert.equal((await app.client().login('olvido@test.do', PASSWORD)).status, 401);
    assert.equal((await app.client().login('olvido@test.do', 'Otra-clave-99')).status, 200);
  });

  test('un enlace nuevo invalida los anteriores', async () => {
    const c = app.client();
    await c.post('/api/auth/forgot-password', { email: 'olvido@test.do' });
    const first = tokenFrom(app.sent.at(-1));
    await c.post('/api/auth/forgot-password', { email: 'olvido@test.do' });
    const second = tokenFrom(app.sent.at(-1));
    assert.notEqual(first, second);
    assert.equal((await c.post('/api/auth/reset-password', { token: first, password: 'Clave-nueva-1' })).status, 400);
    assert.equal((await c.post('/api/auth/reset-password', { token: second, password: 'Clave-nueva-1' })).status, 200);
  });

  test('al restablecer se cierran las sesiones abiertas', async () => {
    const c = app.client();
    await c.login('olvido@test.do', 'Clave-nueva-1');
    assert.equal((await c.get('/api/me')).status, 200);
    await app.client().post('/api/auth/forgot-password', { email: 'olvido@test.do' });
    await app.client().post('/api/auth/reset-password', { token: tokenFrom(app.sent.at(-1)), password: 'Clave-final-1' });
    assert.equal((await c.get('/api/me')).status, 401);
  });

  test('tokens inventados o ausentes se rechazan', async () => {
    const c = app.client();
    assert.equal((await c.post('/api/auth/reset-password', { token: 'inventado', password: 'Clave-final-2' })).status, 400);
    assert.equal((await c.post('/api/auth/reset-password', { password: 'Clave-final-2' })).status, 400);
  });
});
