// Base común de la Épica 2: catálogo de estados y migración de permisos en una base que ya tenía la Épica 1.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUCKETS, OPEN_STATUSES, STATUS_KEYS, TRANSITIONS, canTransition, formatReportCode, needsReason } from '../src/domain/operations.js';
import { buildPermissionMap, flagsToRow, fromShorthand } from '../src/domain/permissions.js';
import { seedOperationsCatalog, seedSystemRoles } from '../src/domain/seed-data.js';
import { createMemoryRepos } from './helpers/memory-repos.js';

test('máquina de estados: toda transición apunta a un estado existente y los cerrados son finales', () => {
  for (const [from, list] of Object.entries(TRANSITIONS)) {
    assert.ok(STATUS_KEYS.includes(from));
    for (const to of list) assert.ok(STATUS_KEYS.includes(to), `${from} → ${to}`);
  }
  assert.deepEqual(TRANSITIONS.resuelto, []);
  assert.deepEqual(TRANSITIONS.rechazado, []);
  assert.equal(canTransition('reportado', 'resuelto'), false);
  assert.equal(needsReason('validado', 'rechazado'), true);
  assert.equal(needsReason('en_proceso', 'en_revision'), true);
  assert.equal(needsReason('validado', 'en_revision'), false);
  assert.equal(formatReportCode(28), 'CA-0028');
  // Los grupos del panel suman exactamente todos los estados, sin solaparse
  const grouped = ['pendientes', 'en_proceso', 'completados', 'rechazados'].flatMap((b) => BUCKETS[b].statuses);
  assert.deepEqual([...grouped].sort(), [...STATUS_KEYS].sort());
  assert.deepEqual(BUCKETS.abiertos.statuses, OPEN_STATUSES);
});

test('actualizar una base de la Épica 1: agrega los módulos nuevos sin pisar lo que editó un administrador', async () => {
  const repos = createMemoryRepos();
  // Estado de la Épica 1: supervisor con 5 módulos, y un admin le quitó "usuarios".
  const sup = await repos.roles.create({ code: 'supervisor', name: 'Supervisor', dashboardPath: '/admin', isActive: true, isSystem: true });
  const epica1 = { usuarios: '', roles: '', permisos: '', auditoria: 'R', reportes: 'RU' };
  await repos.roles.setPermissions(sup.id, Object.entries(epica1).map(([m, s]) => flagsToRow(m, fromShorthand(s))));

  await seedSystemRoles(repos);
  await seedOperationsCatalog(repos);
  await seedSystemRoles(repos); // idempotente
  await seedOperationsCatalog(repos);

  const map = buildPermissionMap(sup, await repos.roles.getPermissions(sup.id));
  assert.equal(map.usuarios.read, false, 'respeta la edición del administrador');
  assert.equal(map.aprobaciones.update, true, 'recibe los módulos nuevos');
  assert.equal(map.asignaciones.update, true);
  assert.equal((await repos.roles.getPermissions(sup.id)).length, 14, 'sin filas duplicadas');
  assert.ok(await repos.roles.findByCode('operador'));
  assert.equal((await repos.reportTypes.list()).length, 4);
  assert.equal((await repos.approvalSteps.listByType('agua')).length, 1);
});
