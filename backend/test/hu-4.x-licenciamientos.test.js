// Épica 4 — Gestión de licenciamientos de software (HU-4.1 a HU-4.8), contra la API HTTP real.
// Cada prueba nombra la historia y las reglas de negocio (RN-4.x, docs/backlog/epica-4.md) que verifica.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { loggedIn, startTestApp } from './helpers/app.js';
import { testClock } from './helpers/ops.js';

/** package-lock mínimo con los casos que importan: confirmada, expresión con varias, sin licencia, GPL directa y GPL de desarrollo. */
const LOCK = {
  name: 'ciudadalerta-backend', lockfileVersion: 3,
  packages: {
    '': { name: 'ciudadalerta-backend', dependencies: { 'lib-mit': '^1', 'lib-dual': '^2', 'lib-nada': '^1', 'lib-gpl': '^3' }, devDependencies: { 'tool-gpl': '^1' } },
    'node_modules/lib-mit': { version: '1.2.0', license: 'MIT', resolved: 'https://registry.npmjs.org/lib-mit/-/lib-mit-1.2.0.tgz' },
    'node_modules/lib-dual': { version: '2.0.0', license: '(MIT OR Apache-2.0)' },
    'node_modules/lib-nada': { version: '1.0.0' },
    'node_modules/lib-gpl': { version: '3.1.0', license: 'GPL-3.0-only' },
    'node_modules/tool-gpl': { version: '1.0.0', license: 'GPL-3.0-only', dev: true },
    'node_modules/transitiva': { version: '0.1.0', license: 'ISC' },
    'node_modules/lib-mit/node_modules/transitiva': { version: '0.2.0', license: 'ISC' },
  },
};

describe('Épica 4: gestión de licenciamientos', () => {
  let app, time, lic, ger, aud, sup, ciu, comp, office;
  const byName = async (name) => (await lic.c.get(`/api/software/components?q=${name}&project=ciudadalerta-backend`)).data.items.find((c) => c.name === name);

  before(async () => {
    time = testClock('2026-11-25T12:00:00Z');
    app = await startTestApp({ clock: time.clock, env: { SESSION_TTL_HOURS: '100000' } });
    lic = await loggedIn(app, 'licenciamiento', 'lic@test.do');
    ger = await loggedIn(app, 'gerente', 'gerente@test.do');
    aud = await loggedIn(app, 'auditor', 'auditor@test.do');
    sup = await loggedIn(app, 'supervisor', 'sup@test.do');
    ciu = await loggedIn(app, 'ciudadano', 'ciu@test.do');
  });
  after(() => app.close());

  // ── HU-4.1 ──────────────────────────────────────────────────────────────────
  test('HU-4.1: catálogo sembrado con categorías, condiciones, fuente y fecha de verificación', async () => {
    const res = await ger.c.get('/api/license-types');
    assert.equal(res.status, 200);
    const mit = res.data.items.find((l) => l.spdxId === 'MIT');
    assert.equal(mit.category, 'permisiva');
    assert.equal(mit.requiresAttribution, true);
    assert.equal(mit.redistribution, 'permitida');
    assert.match(mit.sourceUrl, /spdx\.org/);
    assert.ok(mit.verifiedOn);
    assert.equal(res.data.items.find((l) => l.spdxId === 'GPL-3.0-only').category, 'copyleft_fuerte');
    assert.equal((await ger.c.get('/api/license-types?category=copyleft_debil')).data.items.length, 2);
  });

  test('HU-4.1 / RN-4.1 / RN-4.2: alta validada; identificador único; verificar exige fuente', async () => {
    const body = {
      spdxId: 'EPL-2.0', name: 'Eclipse Public License', version: '2.0', category: 'copyleft_debil',
      obligations: 'Publicar el código de los módulos EPL modificados.', requiresAttribution: true,
      redistribution: 'con_condiciones', modification: 'con_condiciones', restrictions: 'Copyleft por módulo.',
    };
    assert.equal((await ger.c.post('/api/license-types', body)).status, 403, 'el gerente solo consulta');
    assert.equal((await lic.c.post('/api/license-types', { ...body, spdxId: 'no válida!' })).data.error.code, 'invalid_spdx_id');
    assert.equal((await lic.c.post('/api/license-types', { ...body, category: 'rara' })).data.error.code, 'invalid_category');
    assert.equal((await lic.c.post('/api/license-types', { ...body, verifiedOn: '2026-11-20' })).data.error.code, 'source_required');
    assert.equal((await lic.c.post('/api/license-types', { ...body, sourceUrl: 'https://spdx.org/licenses/EPL-2.0.html', verifiedOn: '2027-01-01' })).data.error.code, 'invalid_verified_on');
    const ok = await lic.c.post('/api/license-types', { ...body, sourceUrl: 'https://spdx.org/licenses/EPL-2.0.html', verifiedOn: '2026-11-20' });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.verifiedBy, lic.user.id);
    assert.equal((await lic.c.post('/api/license-types', { ...body, spdxId: 'epl-2.0' })).data.error.code, 'license_type_exists');

    // Cambiar condiciones sin nueva verificación la devuelve a «sin verificar».
    const upd = await lic.c.patch(`/api/license-types/${ok.data.id}`, { restrictions: 'Copyleft por módulo; cláusula de patentes.' });
    assert.equal(upd.data.verifiedOn, null);
  });

  // ── HU-4.2 ──────────────────────────────────────────────────────────────────
  test('HU-4.2 / RN-4.3: alta manual; sin licencia queda «revisión pendiente»; responsable y fecha de incorporación', async () => {
    assert.equal((await sup.c.post('/api/software/components', { projectCode: 'ciudadalerta-backend', name: 'x', version: '1', kind: 'libreria' })).status, 403);
    const res = await lic.c.post('/api/software/components', {
      projectCode: 'ciudadalerta-backend', name: 'leaflet', version: '1.9.4', kind: 'libreria', declaredLicense: 'BSD-2-Clause',
      repositoryUrl: 'https://github.com/Leaflet/Leaflet',
    });
    assert.equal(res.status, 201);
    comp = res.data.component;
    assert.equal(comp.licenseStatus, 'pendiente');
    assert.equal(comp.addedByName, 'Prueba licenciamiento');
    assert.ok(comp.addedAt);
    const sin = await lic.c.post('/api/software/components', { projectCode: 'municipal', name: 'Visor GIS interno', version: '3.0', kind: 'aplicacion' });
    assert.equal(sin.data.component.licenseStatus, 'sin_licencia');
    assert.equal((await lic.c.post('/api/software/components', { projectCode: 'nope', name: 'a', version: '1', kind: 'libreria' })).data.error.code, 'invalid_project');
    assert.equal((await lic.c.post('/api/software/components', { projectCode: 'municipal', name: 'a', version: '1', kind: 'libreria', repositoryUrl: 'javascript:alert(1)' })).data.error.code, 'invalid_repository_url');
  });

  test('HU-4.2 / RN-4.4: no se repite en el proyecto; entre proyectos se avisa como duplicado potencial', async () => {
    const same = await lic.c.post('/api/software/components', { projectCode: 'ciudadalerta-backend', name: 'Leaflet', version: '1.9.4', kind: 'libreria' });
    assert.equal(same.status, 409);
    assert.equal(same.data.error.code, 'component_exists');
    const other = await lic.c.post('/api/software/components', { projectCode: 'ciudadalerta-frontend', name: 'leaflet', version: '1.9.4', kind: 'libreria', licenseId: 'BSD-2-Clause' });
    assert.equal(other.status, 201);
    assert.equal(other.data.potentialDuplicates.length, 1);
    assert.equal(other.data.component.licenseStatus, 'confirmada');
    assert.equal(other.data.component.duplicates, 1);
  });

  test('HU-4.2: importar package-lock.json: directas por defecto, estado de licencia según lo declarado, sin repetir', async () => {
    const res = await lic.c.post('/api/software/import', { projectCode: 'ciudadalerta-backend', lockfile: LOCK });
    assert.equal(res.status, 200);
    assert.deepEqual(
      { read: res.data.read, considered: res.data.considered, created: res.data.created, confirmed: res.data.confirmed, pending: res.data.pending, without: res.data.withoutLicense },
      { read: 7, considered: 5, created: 5, confirmed: 3, pending: 1, without: 1 },
    );
    assert.equal((await byName('lib-dual')).licenseStatus, 'pendiente', 'una expresión con varias licencias la decide una persona');
    assert.equal((await byName('lib-nada')).licenseStatus, 'sin_licencia');
    assert.equal((await byName('lib-mit')).license.spdxId, 'MIT');
    const again = await lic.c.post('/api/software/import', { projectCode: 'ciudadalerta-backend', lockfile: LOCK });
    assert.equal(again.data.created, 0);
    assert.equal(again.data.existing, 5);
    assert.equal((await lic.c.post('/api/software/import', { projectCode: 'ciudadalerta-backend', lockfile: { hola: 1 } })).data.error.code, 'invalid_lockfile');
  });

  test('HU-4.2: el package-lock.json real del backend se importa completo', async () => {
    const real = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
    const res = await lic.c.post('/api/software/import', { projectCode: 'ciudadalerta-frontend', lockfile: real, includeTransitive: true });
    assert.equal(res.status, 200);
    assert.equal(res.data.created, res.data.considered);
    assert.equal(res.data.confirmed + res.data.pending + res.data.withoutLicense, res.data.created);
    assert.ok(res.data.confirmed >= res.data.created - 2, 'casi todo el backend usa licencias del catálogo');
  });

  // ── HU-4.5 ──────────────────────────────────────────────────────────────────
  test('HU-4.5 / RN-4.9: posible incompatibilidad para revisión humana (GPL directa sí, GPL de desarrollo no)', async () => {
    const gpl = await byName('lib-gpl');
    assert.equal(gpl.flags[0].code, 'copyleft_en_proyecto_no_copyleft');
    assert.deepEqual((await byName('tool-gpl')).flags, []);
    const flagged = await lic.c.get('/api/software/components?flagged=1');
    assert.deepEqual(flagged.data.items.map((c) => c.name), ['lib-gpl']);
    const unconfirmed = await lic.c.get('/api/software/components?status=pendiente,sin_licencia');
    assert.ok(unconfirmed.data.items.some((c) => c.name === 'lib-nada'));
  });

  test('HU-4.5 / RN-4.7: revisión con decisión, obligaciones, evaluación y revisor; historial por versión', async () => {
    const dual = await byName('lib-dual');
    const path = `/api/software/components/${dual.id}/reviews`;
    assert.equal((await ger.c.post(path, { decision: 'aprobado' })).status, 403);
    assert.equal((await lic.c.post(path, { decision: 'aprobado', obligations: 'Conservar aviso', evaluation: 'corta' })).data.error.code, 'invalid_evaluation');
    assert.equal((await lic.c.post(path, { decision: 'aprobado', obligations: 'Conservar aviso', evaluation: 'Se elige MIT de la expresión dual.' })).data.error.code, 'license_required');
    const res = await lic.c.post(path, { decision: 'aprobado', licenseId: 'MIT', obligations: 'Conservar el aviso MIT en NOTICE.', evaluation: 'Licencia dual: se elige MIT, compatible con el proyecto MIT.' });
    assert.equal(res.status, 201);
    assert.equal(res.data.component.licenseStatus, 'confirmada', 'la decisión confirma la licencia');
    assert.equal(res.data.reviews[0].reviewerName, 'Prueba licenciamiento');
    assert.equal(res.data.reviews[0].version, '2.0.0');
    assert.equal(res.data.component.reviewClosed, true);
  });

  // ── HU-4.3 ──────────────────────────────────────────────────────────────────
  test('HU-4.3 / RN-4.6 / RN-4.8: licencia adquirida; la suscripción vence; claves solo para quien tiene «confidencial»', async () => {
    const body = { vendor: 'Microsoft', product: 'Microsoft 365', edition: 'E3', modality: 'suscripcion', metric: 'usuario', quantity: 2, startsOn: '2026-01-01', expiresOn: '2026-12-15', alertDays: 30, licenseKey: 'ABCD-1234-SECRETA', contractRef: 'CT-2026-77' };
    assert.equal((await lic.c.post('/api/licenses', { ...body, expiresOn: '' })).data.error.code, 'expires_on_required');
    assert.equal((await lic.c.post('/api/licenses', { ...body, expiresOn: '2025-01-01' })).data.error.code, 'invalid_expires_on');
    assert.equal((await lic.c.post('/api/licenses', { ...body, quantity: 0 })).data.error.code, 'invalid_quantity');
    const res = await lic.c.post('/api/licenses', body);
    assert.equal(res.status, 201);
    office = res.data;
    assert.equal(office.code, 'LIC-0001');
    assert.equal(office.validity, 'por_vencer', 'vence en 20 días y el aviso es de 30');
    assert.equal(office.licenseKey, 'ABCD-1234-SECRETA');

    const asManager = (await ger.c.get(`/api/licenses/${office.code}`)).data.license;
    assert.equal(asManager.licenseKey, null);
    assert.equal(asManager.contractRef, null);
    assert.equal(asManager.confidentialHidden, true);
    assert.equal((await aud.c.get(`/api/licenses/${office.id}`)).data.license.licenseKey, 'ABCD-1234-SECRETA', 'el auditor sí ve lo confidencial');
    assert.equal((await sup.c.get('/api/licenses')).data.items[0].licenseKey, null);
  });

  // ── HU-4.4 ──────────────────────────────────────────────────────────────────
  test('HU-4.4 / RN-4.5: asignar respeta métrica, límite y duplicados; liberar conserva historial; reasignar', async () => {
    const path = `/api/licenses/${office.id}/assignments`;
    assert.equal((await lic.c.post(path, { targetType: 'equipo', targetName: 'PC-01' })).data.error.code, 'wrong_target_type');
    assert.equal((await lic.c.post(path, { targetType: 'usuario', targetUserId: sup.user.id })).status, 201);
    assert.equal((await lic.c.post(path, { targetType: 'usuario', targetUserId: sup.user.id })).data.error.code, 'already_assigned');
    const second = await lic.c.post(path, { targetType: 'usuario', targetUserId: ger.user.id });
    assert.equal(second.data.license.available, 0);
    const third = await lic.c.post(path, { targetType: 'usuario', targetUserId: aud.user.id });
    assert.equal(third.status, 409);
    assert.equal(third.data.error.code, 'no_licenses_available');

    assert.equal((await lic.c.patch(`/api/licenses/${office.id}`, { quantity: 1 })).data.error.code, 'quantity_below_assigned');

    const rel = `/api/license-assignments/${second.data.assignment.id}/release`;
    assert.equal((await lic.c.post(rel, {})).data.error.code, 'invalid_reason');
    const released = await lic.c.post(rel, { reason: 'Cambio de puesto' });
    assert.equal(released.data.license.available, 1);
    assert.equal((await lic.c.post(rel, { reason: 'otra vez' })).data.error.code, 'already_released');

    const first = (await lic.c.get(`/api/licenses/${office.id}`)).data.assignments.find((a) => a.active);
    const re = await lic.c.post(`/api/license-assignments/${first.id}/reassign`, { targetUserId: aud.user.id, reason: 'Rotación' });
    assert.equal(re.status, 201);
    const detail = (await lic.c.get(`/api/licenses/${office.id}`)).data;
    assert.equal(detail.assignments.length, 3, 'liberar y reasignar conservan las filas');
    assert.ok(detail.assignments.every((a) => a.assignedAt && a.assignedByName === 'Prueba licenciamiento'), 'destinatario, fecha y responsable');
    assert.deepEqual(detail.assignments.filter((a) => a.active).map((a) => a.targetName), ['Prueba auditor']);
    assert.match(detail.assignments.find((a) => a.targetName === 'Prueba supervisor').releaseReason, /Reasignada: Rotación/);
  });

  test('HU-4.4: conciliación adquiridas / asignadas / disponibles y verificación del contador', async () => {
    const r = await ger.c.get('/api/licenses/reconciliation');
    const row = r.data.items.find((x) => x.code === 'LIC-0001');
    assert.deepEqual([row.quantity, row.assigned, row.available, row.activeAssignments, row.consistent], [2, 1, 1, 1, true]);
  });

  // ── HU-4.7 ──────────────────────────────────────────────────────────────────
  test('HU-4.7 / RN-4.10: evidencias ligadas; las confidenciales no existen para quien no tiene permiso', async () => {
    assert.equal((await lic.c.post('/api/evidences', { title: 'Aviso', kind: 'aviso', classification: 'publica', url: 'https://example.com' })).data.error.code, 'evidence_unlinked');
    const contract = await lic.c.post('/api/evidences', { title: 'Contrato Microsoft 2026', kind: 'contrato', classification: 'confidencial', url: 'https://docs.municipio.do/contratos/ct-2026-77', licenseId: office.code });
    assert.equal(contract.status, 201);
    const notice = await lic.c.post('/api/evidences', { title: 'Atribuciones del backend', kind: 'atribucion', classification: 'publica', url: 'https://github.com/Dlex84/CiudadAlerta/blob/main/LICENSE', projectCode: 'ciudadalerta-backend', version: '2' });
    assert.equal(notice.data.authorName, 'Prueba licenciamiento');
    assert.equal(notice.data.version, '2');
    assert.ok(notice.data.createdAt, 'autor, fecha y versión');

    const forManager = await ger.c.get('/api/evidences');
    assert.deepEqual(forManager.data.items.map((e) => e.title), ['Atribuciones del backend']);
    assert.equal((await ger.c.get(`/api/evidences/${contract.data.id}`)).status, 404);
    assert.equal((await aud.c.get(`/api/evidences/${contract.data.id}`)).status, 200);
    assert.equal((await ger.c.post('/api/evidences', { title: 'x', kind: 'otro', classification: 'publica', url: 'https://a.do', projectCode: 'municipal' })).status, 403);
    assert.equal((await ger.c.get('/api/evidences?project=ciudadalerta-backend')).data.total, 1);
  });

  test('HU-4.7: adjuntar archivo verificado por su contenido; descargar el mismo archivo', async () => {
    const pdf = Buffer.from('%PDF-1.4\n% evidencia de prueba\n');
    const qs = `?title=Informe%20de%20revisi%C3%B3n&kind=informe&classification=interna&componentId=${(await byName('lib-gpl')).id}&fileName=informe.pdf`;
    const up = await lic.c.request('POST', `/api/evidences/upload${qs}`, { raw: pdf, contentType: 'application/pdf' });
    assert.equal(up.status, 201);
    assert.equal(up.data.hasFile, true);
    assert.equal(up.data.fileMime, 'application/pdf');
    const exe = await lic.c.request('POST', `/api/evidences/upload${qs}`, { raw: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), contentType: 'application/pdf' });
    assert.equal(exe.status, 415, 'no se confía en el Content-Type: se mira el contenido');
    const down = await ger.c.request('GET', `/api/evidences/${up.data.id}/file`);
    assert.equal(down.status, 200);
    assert.match(down.headers.get('content-disposition'), /attachment; filename="informe.pdf"/);
    assert.match(String(down.data), /%PDF-1\.4/);
    assert.equal((await ger.c.get(`/api/evidences?component=${up.data.component.id}`)).data.total, 1);

    // HU-4.5: la revisión documenta su evidencia; «requiere revisión legal» no cierra el pendiente.
    const reviews = `/api/software/components/${up.data.component.id}/reviews`;
    const review = { decision: 'requiere_revision', obligations: 'Publicar el código si se distribuye.', evaluation: 'GPL directa en proyecto MIT: se consulta a asesoría legal.' };
    assert.equal((await lic.c.post(reviews, { ...review, evidenceId: 999999 })).data.error.code, 'invalid_evidence');
    const withEvidence = await lic.c.post(reviews, { ...review, evidenceId: up.data.id });
    assert.equal(withEvidence.status, 201);
    assert.equal(withEvidence.data.reviews[0].evidenceId, up.data.id);
    assert.equal(withEvidence.data.component.reviewClosed, false);
  });

  // ── HU-4.6 ──────────────────────────────────────────────────────────────────
  test('HU-4.6 / RN-4.12: el escaneo crea alertas por tipo y criticidad, sin duplicarlas', async () => {
    assert.equal((await ger.c.post('/api/compliance/scan')).status, 403);
    const s = await lic.c.post('/api/compliance/scan');
    assert.equal(s.status, 200);
    const alerts = (await lic.c.get('/api/compliance/alerts?limit=200')).data.items;
    const kinds = (k) => alerts.filter((a) => a.kind === k);
    assert.equal(kinds('vencimiento_licencia').length, 1);
    assert.equal(kinds('vencimiento_licencia')[0].criticality, 'alta');
    assert.ok(kinds('sin_licencia').some((a) => a.title.includes('lib-nada')));
    assert.deepEqual(kinds('incompatibilidad').map((a) => a.title.includes('lib-gpl')), [true]);
    assert.match(kinds('incompatibilidad')[0].detail, /no es un dictamen legal/);
    assert.ok(!alerts.some((a) => a.title.includes('lib-dual')), 'lo revisado ya no genera alertas');

    const again = await lic.c.post('/api/compliance/scan');
    assert.equal(again.data.created, 0);
    assert.equal(again.data.skipped, s.data.created);
    assert.ok((await lic.c.get('/api/notifications')).data.items.some((n) => n.kind === 'compliance_alert'));
  });

  test('HU-4.6: responsable, seguimiento y atención; pendientes, atendidas y vencidas; ventana anti-repetición', async () => {
    const { items } = (await lic.c.get('/api/compliance/alerts?kind=vencimiento_licencia')).data;
    const a = items[0];
    const act = (body) => lic.c.post(`/api/compliance/alerts/${a.id}/actions`, body);
    assert.equal((await act({ action: 'responsable', responsibleId: ciu.user.id })).data.error.code, 'invalid_responsible');
    assert.equal((await act({ action: 'responsable', responsibleId: lic.user.id, comment: 'Lo veo con compras' })).status, 200);
    assert.equal((await act({ action: 'seguimiento', comment: 'Cotización solicitada a Microsoft' })).status, 200);
    assert.equal((await act({ action: 'atender' })).data.error.code, 'invalid_comment');
    const done = await act({ action: 'atender', comment: 'Renovación aprobada, orden OC-301' });
    assert.equal(done.data.alert.state, 'atendida');
    assert.deepEqual(done.data.events.map((e) => e.kind), ['creada', 'responsable', 'seguimiento', 'atendida']);
    assert.equal((await act({ action: 'atender', comment: 'otra vez' })).data.error.code, 'alert_already_attended');

    // Atendida y dentro de la ventana (7 días): no se repite. Pasada la ventana, si sigue venciendo, vuelve.
    assert.equal((await lic.c.post('/api/compliance/scan')).data.created, 0);
    time.advanceHours(24 * 8);
    const later = (await lic.c.post('/api/compliance/scan')).data;
    assert.ok(later.created >= 1);
    const counts = (await lic.c.get('/api/compliance/alerts')).data.counts;
    assert.equal(counts.atendida, 1);
    assert.ok(counts.vencida >= 1, 'las de componentes ya pasaron su fecha (vencidas)');
    assert.equal((await lic.c.get('/api/compliance/alerts?state=vencida')).data.items.every((x) => x.state === 'vencida'), true);
  });

  test('HU-4.6: reglas configurables por tipo, criticidad y ventana', async () => {
    assert.equal((await lic.c.patch('/api/compliance/rules/incompatibilidad', { criticality: 'extrema' })).data.error.code, 'invalid_criticality');
    const r = await lic.c.patch('/api/compliance/rules/vencimiento_licencia', { criticality: 'critica', dedupeDays: 3 });
    assert.deepEqual([r.data.criticality, r.data.dedupeDays], ['critica', 3]);
    assert.equal((await ger.c.patch('/api/compliance/rules/vencimiento_licencia', { dedupeDays: 1 })).status, 403);
  });

  test('HU-4.4: una licencia vencida no se puede asignar', async () => {
    time.advanceHours(24 * 30); // ya pasó el 15 de diciembre
    const r = await lic.c.post(`/api/licenses/${office.id}/assignments`, { targetType: 'usuario', targetUserId: sup.user.id });
    assert.equal(r.data.error.code, 'license_expired');
  });

  // ── HU-4.8 ──────────────────────────────────────────────────────────────────
  test('HU-4.8: reporte por tipo, proyecto, proveedor, estado y vencimiento, con fecha de corte y filtros', async () => {
    assert.equal((await sup.c.get('/api/compliance/report')).status, 403);
    const r = await ger.c.get('/api/compliance/report?project=ciudadalerta-backend');
    assert.equal(r.status, 200);
    assert.ok(r.data.cutoff);
    assert.deepEqual(r.data.filters, { proyecto: 'ciudadalerta-backend' });
    assert.ok(r.data.components.byCategory.some((x) => x.label === 'Copyleft fuerte'));
    assert.ok(r.data.components.unconfirmed.some((c) => c.name === 'lib-nada'));
    assert.ok(r.data.components.flagged.some((c) => c.name === 'lib-gpl'));
    assert.equal(r.data.licenses.items[0].validityLabel, 'Vencida');
    const byVendor = await ger.c.get('/api/compliance/report?vendor=Adobe');
    assert.equal(byVendor.data.licenses.total, 0);
    assert.equal((await ger.c.get('/api/compliance/report?validity=ninguna')).status, 400);
  });

  test('HU-4.8: exportar solo con permiso; el CSV incluye corte, filtros y aviso legal', async () => {
    assert.equal((await aud.c.get('/api/compliance/report.csv')).status, 403, 'el auditor consulta pero no exporta');
    const csv = await ger.c.get('/api/compliance/report.csv?category=copyleft_fuerte');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.data, /Fecha de corte/);
    assert.match(csv.data, /tipo_licencia=copyleft_fuerte/);
    assert.match(csv.data, /no un dictamen legal/);
    assert.match(csv.data, /lib-gpl/);
  });

  // ── Transversal ─────────────────────────────────────────────────────────────
  test('transversal: el ciudadano no ve nada de licenciamiento y la bitácora nunca guarda claves', async () => {
    for (const p of ['/api/license-types', '/api/software/components', '/api/licenses', '/api/compliance/alerts', '/api/evidences']) {
      assert.equal((await ciu.c.get(p)).status, 403, p);
    }
    const admin = await loggedIn(app, 'admin', 'admin@test.do');
    const log = await admin.c.get('/api/changelog?entity=purchased_license&limit=100');
    assert.ok(log.data.total >= 1);
    assert.ok(!JSON.stringify(log.data).includes('ABCD-1234-SECRETA'), 'la clave no aparece en la bitácora');
    const rejected = await admin.c.get('/api/changelog?entity=license_assignment&result=rejected');
    assert.ok(rejected.data.items.some((i) => i.newValues.error === 'no_licenses_available'), 'los rechazos también quedan registrados');
  });
});
