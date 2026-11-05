import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SYSTEM_ROLES } from '../src/domain/seed-data.js';
import { buildPermissionMap, can, fromShorthand, MODULE_KEYS } from '../src/domain/permissions.js';
import { dummyHash, hashPassword, verifyPassword } from '../src/lib/passwords.js';
import { clientIp, isPrivateIp } from '../src/lib/ip.js';
import { detectImage } from '../src/services/profile.service.js';
import { optionalPhone, requireEmail, requirePassword, requireText } from '../src/lib/validate.js';

test('contraseñas: hash con scrypt, verificación y rechazo de formatos inválidos', async () => {
  const h = await hashPassword('mi-clave-123');
  assert.match(h, /^scrypt\$/);
  assert.notEqual(h, await hashPassword('mi-clave-123'), 'cada hash usa sal distinta');
  assert.equal(await verifyPassword('mi-clave-123', h), true);
  assert.equal(await verifyPassword('otra', h), false);
  assert.equal(await verifyPassword('x', 'basura'), false);
  assert.equal(await verifyPassword('x', null), false);
  assert.match(await dummyHash(), /^scrypt\$/);
});

test('validaciones', () => {
  assert.equal(requireEmail('  Ana@Correo.COM '), 'ana@correo.com');
  assert.throws(() => requireEmail('sin-arroba'), { code: 'invalid_email' });
  assert.throws(() => requirePassword('corta'), { code: 'weak_password' });
  assert.equal(requirePassword('12345678'), '12345678');
  assert.equal(requireText('  Ana   María ', { field: 'n', label: 'N', min: 2 }), 'Ana María');
  assert.throws(() => requireText('', { field: 'n', label: 'N', min: 2 }), { code: 'invalid_n' });
  assert.equal(optionalPhone(''), null);
  assert.equal(optionalPhone('809-555-0101'), '809-555-0101');
  assert.throws(() => optionalPhone('abc'), { code: 'invalid_phone' });
});

test('permisos: notación CRUD, mapa completo y super admin con todo', () => {
  assert.deepEqual(fromShorthand('CR'), { create: true, read: true, update: false, delete: false });
  const sup = buildPermissionMap({ code: 'super_admin' }, []);
  for (const m of MODULE_KEYS) assert.ok(can(sup, m, 'delete'));
  const none = buildPermissionMap({ code: 'x' }, []);
  assert.equal(can(none, 'usuarios', 'read'), false);
  const some = buildPermissionMap({ code: 'x' }, [{ module: 'usuarios', canCreate: false, canRead: true, canUpdate: false, canDelete: false }]);
  assert.equal(can(some, 'usuarios', 'read'), true);
  assert.equal(can(some, 'usuarios', 'update'), false);
  assert.equal(SYSTEM_ROLES.length, 7); // + Operador, Gerente y Auditor (Épica 2)
});

test('IP: privadas, IPv4 mapeada y X-Forwarded-For solo si se confía en el proxy', () => {
  assert.ok(isPrivateIp('192.168.1.5') && isPrivateIp('10.0.0.1') && isPrivateIp('127.0.0.1') && isPrivateIp('::1'));
  assert.equal(isPrivateIp('203.0.113.9'), false);
  const req = { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, socket: { remoteAddress: '::ffff:10.0.0.1' } };
  assert.equal(clientIp(req, false), '10.0.0.1');
  assert.equal(clientIp(req, true), '203.0.113.9');
});

test('fotos: se detecta el tipo real por los primeros bytes', () => {
  const pad = Buffer.alloc(20);
  assert.equal(detectImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), pad])).ext, 'jpg');
  assert.equal(detectImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad])).ext, 'png');
  assert.equal(detectImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), pad])).ext, 'webp');
  assert.equal(detectImage(Buffer.from('<?php echo 1; ?> esto no es una imagen')), null);
});
