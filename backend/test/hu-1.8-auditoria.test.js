// HU-1.8 — Auditoría de accesos
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn, startTestApp } from './helpers/app.js';

describe('HU-1.8 Auditoría de accesos', () => {
  let app, admin, ana;
  before(async () => {
    app = await startTestApp();
    admin = (await loggedIn(app, 'admin', 'admin@test.do')).c;
    ana = await app.addUser({ email: 'ana@test.do', fullName: 'Ana Auditada' });
    const c = app.client();
    await c.login('ana@test.do');
    await c.post('/api/auth/logout');
    await app.client().login('ana@test.do', 'mal-intento-1');
    await app.client().login('desconocido@test.do', 'mal-intento-1');
  });
  after(() => app.close());

  test('registra usuario, fecha/hora, IP, localización, ingreso, fallos y cierre de sesión', async () => {
    const res = await admin.get('/api/audit/access?email=ana@test.do');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.items.map((i) => i.event), ['login_failed', 'logout', 'login_success']);
    const ok = res.data.items.find((i) => i.event === 'login_success');
    assert.equal(ok.userName, 'Ana Auditada');
    assert.ok(ok.createdAt);
    assert.ok(ok.ip, 'guarda la IP');
    assert.equal(ok.city, 'Red local', 'localización a partir de la IP');
  });

  test('registra intentos con correos que no existen', async () => {
    const res = await admin.get('/api/audit/access?email=desconocido');
    assert.equal(res.data.total, 1);
    assert.equal(res.data.items[0].userId, null);
  });

  test('filtra por usuario, evento, IP y rango de fechas', async () => {
    assert.equal((await admin.get(`/api/audit/access?userId=${ana.id}&event=logout`)).data.total, 1);
    assert.equal((await admin.get('/api/audit/access?event=login_success&ip=127.0.0.1')).data.total >= 1, true);
    assert.equal((await admin.get('/api/audit/access?ip=1.2.3.4')).data.total, 0);
    const today = new Date().toISOString().slice(0, 10);
    assert.ok((await admin.get(`/api/audit/access?from=${today}&to=${today}`)).data.total >= 4);
    assert.equal((await admin.get('/api/audit/access?from=2020-01-01&to=2020-01-02')).data.total, 0);
  });

  test('valida filtros y pagina', async () => {
    assert.equal((await admin.get('/api/audit/access?event=otro')).data.error.code, 'invalid_event');
    assert.equal((await admin.get('/api/audit/access?from=ayer')).data.error.code, 'invalid_date');
    const p = await admin.get('/api/audit/access?limit=2&page=1');
    assert.equal(p.data.items.length, 2);
    assert.ok(p.data.total > 2);
  });

  test('solo quien tiene permiso de auditoría puede consultarla', async () => {
    const { c } = await loggedIn(app, 'ciudadano', 'vecino@test.do');
    assert.equal((await c.get('/api/audit/access')).status, 403);
    assert.equal((await app.client().get('/api/audit/access')).status, 401);
  });
});
