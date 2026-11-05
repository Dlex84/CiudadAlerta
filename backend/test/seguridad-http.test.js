// Comportamientos transversales de la API
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { seedSuperAdmin } from '../src/domain/seed-data.js';
import { PASSWORD, startTestApp } from './helpers/app.js';

describe('Seguridad y registro ciudadano', () => {
  let app;
  before(async () => { app = await startTestApp(); });
  after(() => app.close());

  test('registro ciudadano: crea cuenta como Ciudadano, exige términos y abre sesión', async () => {
    const c = app.client();
    const body = { fullName: 'Andrea Martínez', email: 'andrea@test.do', password: PASSWORD, sector: 'Villa Mella', acceptTerms: true };
    assert.equal((await c.post('/api/auth/register', { ...body, acceptTerms: false })).data.error.code, 'terms_not_accepted');
    const res = await c.post('/api/auth/register', body);
    assert.equal(res.status, 201);
    assert.equal(res.data.role.code, 'ciudadano');
    assert.equal(res.data.redirectTo, '/inicio');
    assert.equal((await c.get('/api/me')).status, 200);
    assert.equal((await app.client().post('/api/auth/register', body)).data.error.code, 'email_taken');
    assert.equal((await app.client().post('/api/auth/register', { ...body, email: 'b@test.do', password: '123' })).data.error.code, 'weak_password');
  });

  test('el registro público no permite elegir rol', async () => {
    const sup = await app.role('super_admin');
    const res = await app.client().post('/api/auth/register', { fullName: 'Intruso Rol', email: 'intruso@test.do', password: PASSWORD, acceptTerms: true, roleId: sup.id });
    assert.equal(res.data.role.code, 'ciudadano');
  });

  test('rechaza orígenes no permitidos en peticiones que modifican datos (CSRF)', async () => {
    const res = await app.client().request('POST', '/api/auth/login', { body: { email: 'a@a.do', password: 'x' }, headers: { origin: 'https://sitio-malicioso.example' } });
    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, 'origin_not_allowed');
    const ok = await app.client().request('POST', '/api/auth/login', { body: { email: 'a@a.do', password: 'x' }, headers: { origin: 'http://localhost:5173' } });
    assert.equal(ok.status, 401);
  });

  test('exige JSON y rechaza cuerpos inválidos', async () => {
    const c = app.client();
    const text = await c.request('POST', '/api/auth/login', { raw: Buffer.from('{"email":"a"}'), contentType: 'text/plain' });
    assert.equal(text.status, 415);
    const bad = await c.request('POST', '/api/auth/login', { raw: Buffer.from('{no json'), contentType: 'application/json' });
    assert.equal(bad.data.error.code, 'invalid_json');
  });

  test('cabeceras de seguridad y 404 en rutas desconocidas', async () => {
    const res = await app.client().get('/api/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal((await app.client().get('/api/no-existe')).status, 404);
  });

  test('limita intentos de autenticación por IP', async () => {
    const limited = await startTestApp({ env: { RATE_LIMIT_MAX: '3' } });
    const c = limited.client();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await c.login('x@test.do', 'mala-clave-1')).status);
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
    await limited.close();
  });

  test('semilla: crea el primer Super Administrador solo una vez', async () => {
    const fresh = await startTestApp();
    const cred = { name: 'Root', email: 'root@ciudadalerta.do', password: 'Clave-root-123' };
    assert.ok(await seedSuperAdmin(fresh.repos, cred));
    assert.equal(await seedSuperAdmin(fresh.repos, { ...cred, email: 'otro@ciudadalerta.do' }), null);
    assert.equal((await fresh.client().login(cred.email, cred.password)).data.redirectTo, '/admin');
    await fresh.close();
  });
});
