// Base común de la Épica 2: catálogo de estados y transiciones.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUCKETS, OPEN_STATUSES, STATUS_KEYS, TRANSITIONS, canTransition, formatReportCode, needsReason } from '../src/domain/operations.js';

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
