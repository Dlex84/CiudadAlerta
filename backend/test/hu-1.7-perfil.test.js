// HU-1.7 — Administración de perfil
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn, PASSWORD, startTestApp } from './helpers/app.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

describe('HU-1.7 Perfil', () => {
  let app, c, user;
  before(async () => {
    app = await startTestApp();
    ({ c, user } = await loggedIn(app, 'ciudadano', 'perfil@test.do'));
  });
  after(() => app.close());

  test('actualiza nombre, teléfono y sector, y registra la fecha de actualización', async () => {
    const res = await c.patch('/api/me', { fullName: 'Andrea Martínez', phone: '829-555-0199', sector: 'Villa Mella' });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.fullName, 'Andrea Martínez');
    assert.equal(res.data.user.phone, '829-555-0199');
    assert.ok(res.data.user.profileUpdatedAt);
    assert.equal((await c.patch('/api/me', {})).data.error.code, 'nothing_to_update');
    assert.equal((await c.patch('/api/me', { fullName: 'A' })).status, 400);
  });

  test('no se puede cambiar el correo ni el rol desde el perfil', async () => {
    const res = await c.patch('/api/me', { fullName: 'Andrea M.', email: 'otro@test.do', roleId: 1, status: 'blocked' });
    assert.equal(res.data.user.email, 'perfil@test.do');
    assert.equal(res.data.role.code, 'ciudadano');
    assert.equal(res.data.user.status, 'active');
  });

  test('sube fotografía válida; rechaza tipos falsos y archivos grandes', async () => {
    const ok = await c.request('PUT', '/api/me/photo', { raw: PNG, contentType: 'image/png' });
    assert.equal(ok.status, 200);
    assert.match(ok.data.user.photoUrl, /^\/uploads\/avatars\/.+\.png$/);
    const img = await c.get(ok.data.user.photoUrl);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    // contenido que dice ser imagen pero no lo es
    const fake = await c.request('PUT', '/api/me/photo', { raw: Buffer.from('<script>alert(1)</script>........'), contentType: 'image/png' });
    assert.equal(fake.data.error.code, 'unsupported_image');
    const wrongType = await c.request('PUT', '/api/me/photo', { raw: PNG, contentType: 'text/html' });
    assert.equal(wrongType.status, 415);
    const big = await c.request('PUT', '/api/me/photo', { raw: Buffer.concat([PNG, Buffer.alloc(2.1 * 1024 * 1024)]), contentType: 'image/png' });
    assert.equal(big.status, 413);
  });

  test('cambia la contraseña: exige la actual, aplica la nueva y cierra las demás sesiones', async () => {
    const other = app.client();
    await other.login('perfil@test.do');
    assert.equal((await c.put('/api/me/password', { currentPassword: 'incorrecta', newPassword: 'Nueva-clave-1' })).data.error.code, 'wrong_current_password');
    assert.equal((await c.put('/api/me/password', { currentPassword: PASSWORD, newPassword: PASSWORD })).data.error.code, 'same_password');
    assert.equal((await c.put('/api/me/password', { currentPassword: PASSWORD, newPassword: 'corta' })).data.error.code, 'weak_password');
    assert.equal((await c.put('/api/me/password', { currentPassword: PASSWORD, newPassword: 'Nueva-clave-1' })).status, 204);
    assert.equal((await c.get('/api/me')).status, 200, 'la sesión actual sigue activa');
    assert.equal((await other.get('/api/me')).status, 401, 'la otra sesión se cerró');
    assert.equal((await app.client().login('perfil@test.do', PASSWORD)).status, 401);
    assert.equal((await app.client().login('perfil@test.do', 'Nueva-clave-1')).status, 200);
    assert.ok((await app.repos.users.findById(user.id)).profileUpdatedAt);
  });
});
