// Persona C — HU-2.4 Flujos de aprobación · HU-2.6 Incidencias operativas
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { loggedIn } from './helpers/app.js';
import { approveClosure, newReport, opsWorld, toInProcess } from './helpers/ops.js';

describe('HU-2.4 Flujos de aprobación', () => {
  let w, adm, sup2;
  before(async () => {
    w = await opsWorld();
    adm = (await loggedIn(w.app, 'admin', 'adm@test.do')).c;
    sup2 = await loggedIn(w.app, 'supervisor', 'sup2@test.do');
  });
  after(() => w.app.close());

  const resolve = (c, id) => c.post(`/api/reports/${id}/transitions`, { to: 'resuelto' });

  test('cada tipo trae un paso por defecto: el Supervisor aprueba antes de Resuelto', async () => {
    const res = await w.sup.c.get('/api/config/report-types/alumbrado/approval-steps');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.steps.map((s) => [s.stepOrder, s.approverRoleCode, s.required]), [[1, 'supervisor', true]]);
  });

  test('impide avanzar a Resuelto sin aprobación o con una pendiente', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    assert.equal((await resolve(w.op.c, r.id)).data.error.code, 'approval_required');

    const req = await w.op.c.post(`/api/reports/${r.id}/approvals`);
    assert.equal(req.status, 201);
    assert.equal(req.data.currentStatus, 'pending');
    assert.equal(req.data.rounds[0].steps[0].requestedBy, 'Prueba operador');
    assert.equal((await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.error.code, 'approval_already_pending');
    assert.equal((await resolve(w.op.c, r.id)).data.error.code, 'approval_pending');
    assert.equal((await resolve(w.sup.c, r.id)).data.error.code, 'approval_pending', 'tampoco el supervisor se lo salta');
    const hint = (await w.op.c.get(`/api/reports/${r.id}`)).data.allowedTransitions.find((t) => t.to === 'resuelto');
    assert.match(hint.blocked, /aprobación obligatoria pendiente/, 'el frontend muestra el botón deshabilitado con el motivo');

    const inbox = await w.sup.c.get('/api/approvals/pending');
    assert.ok(inbox.data.items.some((i) => i.report.id === r.id));
    const notif = (await w.sup.c.get('/api/notifications')).data.items;
    assert.ok(notif.some((n) => n.title === `Aprobación pendiente: ${r.code}`));
  });

  test('registra aprobador, decisión, fecha y comentarios; luego permite Resuelto', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    const req = await w.op.c.post(`/api/reports/${r.id}/approvals`);
    const step = req.data.rounds[0].steps[0];

    const denied = await w.op.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'approved' });
    assert.equal(denied.status, 403, 'el operador no aprueba');
    w.time.advanceHours(1);
    const ok = await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'approved', comment: 'Trabajo verificado' });
    assert.equal(ok.status, 200);
    const decided = ok.data.rounds[0].steps[0];
    assert.equal(decided.decision, 'approved');
    assert.equal(decided.decidedBy, 'Prueba supervisor');
    assert.equal(decided.comment, 'Trabajo verificado');
    assert.equal(decided.decidedAt, w.time.now.toISOString());
    assert.equal(ok.data.currentStatus, 'approved');

    const again = await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'rejected', comment: 'cambio de idea' });
    assert.equal(again.data.error.code, 'approval_not_pending');
    assert.equal((await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.error.code, 'already_approved');

    const done = await resolve(w.op.c, r.id);
    assert.equal(done.status, 200);
    assert.equal(done.data.report.status, 'resuelto');
    assert.ok(done.data.report.resolvedAt);
    const notes = (await w.op.c.get('/api/notifications')).data.items;
    assert.ok(notes.some((n) => n.title === `Cierre aprobado: ${r.code}`));
  });

  test('devolver para corrección exige motivo, avisa al responsable y obliga a pedir de nuevo', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    const step = (await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.rounds[0].steps[0];
    const noReason = await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'returned' });
    assert.equal(noReason.data.error.code, 'invalid_comment');
    const ret = await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'returned', comment: 'Falta la foto del poste reparado' });
    assert.equal(ret.data.currentStatus, 'returned');
    assert.equal((await resolve(w.op.c, r.id)).data.error.code, 'approval_rejected');
    const notes = (await w.op.c.get('/api/notifications')).data.items;
    assert.equal(notes[0].title, `Reporte ${r.code} devuelto para corrección`);
    assert.equal(notes[0].body, 'Motivo: Falta la foto del poste reparado');

    const round2 = await w.op.c.post(`/api/reports/${r.id}/approvals`);
    assert.equal(round2.status, 201);
    assert.equal(round2.data.rounds.length, 2, 'la ronda anterior queda en el historial');
    await w.sup.c.post(`/api/reports/${r.id}/approvals/${round2.data.rounds[1].steps[0].id}/decision`, { decision: 'approved' });
    assert.equal((await resolve(w.op.c, r.id)).status, 200);
  });

  test('una aprobación rechazada también bloquea', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    const step = (await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.rounds[0].steps[0];
    const rej = await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'rejected', comment: 'No corresponde' });
    assert.equal(rej.data.currentStatus, 'rejected');
    assert.equal((await resolve(w.sup.c, r.id)).data.error.code, 'approval_rejected');
    assert.equal((await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'maybe' })).data.error.code, 'invalid_decision');
  });

  test('nadie aprueba su propio trabajo y cada paso lo decide su rol', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.sup.user.id); // el supervisor se asigna a sí mismo
    const step = (await w.sup.c.post(`/api/reports/${r.id}/approvals`)).data.rounds[0].steps[0];
    const self = await w.sup.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'approved' });
    assert.equal(self.data.error.code, 'self_approval');

    // Rol propio con permiso de aprobar, pero el paso es del Supervisor
    const root = (await loggedIn(w.app, 'super_admin', 'root@test.do')).c;
    const role = await root.post('/api/roles', { name: 'Jefe de cuadrilla', dashboardPath: '/admin' });
    await root.put(`/api/roles/${role.data.id}/permissions`, { permissions: [{ module: 'operaciones', read: true }, { module: 'aprobaciones', read: true, update: true }] });
    await w.app.repos.users.create({
      fullName: 'Jefe Cuadrilla', email: 'jefe@test.do', roleId: role.data.id, status: 'active',
      passwordHash: (await w.app.repos.users.findByEmail('sup@test.do')).passwordHash,
    });
    const jefe = w.app.client();
    assert.equal((await jefe.login('jefe@test.do')).status, 200);
    const wrongRole = await jefe.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'approved' });
    assert.equal(wrongRole.status, 403);
    assert.equal(wrongRole.data.error.code, 'not_approver');
    assert.match(wrongRole.data.error.message, /Supervisor/);

    const other = await sup2.c.post(`/api/reports/${r.id}/approvals/${step.id}/decision`, { decision: 'approved' });
    assert.equal(other.status, 200, 'otro supervisor sí puede');
  });

  test('configura pasos por tipo, en orden: un paso no se decide antes que el anterior', async () => {
    assert.equal((await w.sup.c.put('/api/config/report-types/vias/approval-steps', { steps: [] })).status, 403, 'el supervisor solo consulta');
    const bad = [
      [{ steps: 'x' }, 'invalid_steps'],
      [{ steps: [{ name: 'ok paso', approverRoleCode: 'astronauta' }] }, 'invalid_approver_role'],
      [{ steps: [{ name: 'x' }] }, 'invalid_step_name'],
      [{ steps: Array.from({ length: 6 }, (_, i) => ({ name: `Paso ${i}` })) }, 'invalid_steps'],
    ];
    for (const [body, code] of bad) assert.equal((await adm.put('/api/config/report-types/vias/approval-steps', body)).data.error.code, code);

    const put = await adm.put('/api/config/report-types/vias/approval-steps', {
      steps: [
        { name: 'Revisión técnica', approverRoleCode: 'supervisor', required: true },
        { name: 'Visto bueno final', approverRoleCode: 'supervisor', required: true },
        { name: 'Comentario de gerencia', approverRoleCode: null, required: false },
      ],
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.data.steps.map((s) => s.stepOrder), [1, 2, 3]);

    const r = await newReport(w.citizen.c, { typeCode: 'vias' });
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    const [s1, s2] = (await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.rounds[0].steps;
    assert.equal((await w.sup.c.post(`/api/reports/${r.id}/approvals/${s2.id}/decision`, { decision: 'approved' })).data.error.code, 'previous_step_pending');
    await w.sup.c.post(`/api/reports/${r.id}/approvals/${s1.id}/decision`, { decision: 'approved' });
    assert.equal((await resolve(w.op.c, r.id)).data.error.code, 'approval_pending');
    await sup2.c.post(`/api/reports/${r.id}/approvals/${s2.id}/decision`, { decision: 'approved' });
    assert.equal((await resolve(w.op.c, r.id)).status, 200, 'el paso opcional no bloquea');

    const log = await w.auditor.c.get('/api/changelog?entity=approval_steps');
    assert.equal(log.data.items[0].oldValues.steps[0].name, 'Visto bueno del supervisor');
  });

  test('un tipo sin pasos obligatorios no exige aprobación', async () => {
    await adm.put('/api/config/report-types/basura/approval-steps', { steps: [] });
    const r = await newReport(w.citizen.c, { typeCode: 'basura' });
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    assert.equal((await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.error.code, 'no_approval_steps');
    assert.equal((await resolve(w.op.c, r.id)).status, 200);
  });

  test('si el trabajo vuelve a revisión, la solicitud pendiente se cancela', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    await w.op.c.post(`/api/reports/${r.id}/approvals`);
    const back = await w.sup.c.post(`/api/reports/${r.id}/transitions`, { to: 'en_revision', reason: 'Cambia el alcance' });
    assert.equal(back.status, 200);
    const a = await w.sup.c.get(`/api/reports/${r.id}/approvals`);
    assert.equal(a.data.rounds[0].status, 'cancelled');
    assert.ok(!(await w.sup.c.get('/api/approvals/pending')).data.items.some((i) => i.report.id === r.id));
    assert.equal((await w.op.c.post(`/api/reports/${r.id}/approvals`)).data.error.code, 'invalid_status_for_approval');
  });

  test('la decisión queda en la bitácora con su comentario', async () => {
    const r = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, r.id, w.op.user.id);
    await approveClosure(w.op.c, w.sup.c, r.id);
    const log = await w.auditor.c.get(`/api/changelog?report=${r.code}&entity=approval`);
    assert.deepEqual(log.data.items.map((i) => i.action), ['decide', 'request']);
    assert.equal(log.data.items[0].newValues.decision, 'approved');
  });
});

describe('HU-2.6 Incidencias operativas', () => {
  let w, report, incidentId;
  before(async () => {
    w = await opsWorld();
    report = await newReport(w.citizen.c);
    await toInProcess(w.sup.c, report.id, w.op.user.id);
  });
  after(() => w.app.close());

  test('registra incidencias con categoría, descripción, prioridad y responsable, vinculadas a un reporte', async () => {
    const res = await w.op.c.post(`/api/reports/${report.code}/incidents`, {
      category: 'material', description: 'No hay bombillas LED de 100 W en almacén', priority: 'alta', assigneeId: w.op2.user.id,
    });
    assert.equal(res.status, 201);
    const i = res.data.incident;
    incidentId = i.id;
    assert.equal(i.reportId, report.id);
    assert.equal(i.reportCode, report.code);
    assert.equal(i.categoryLabel, 'Falta de material');
    assert.equal(i.priority, 'alta');
    assert.equal(i.status, 'abierta');
    assert.equal(i.assignee.id, w.op2.user.id);
    assert.equal(i.createdByName, 'Prueba operador');
    const n = (await w.op2.c.get('/api/notifications')).data.items[0];
    assert.match(n.title, new RegExp(`Incidencia en ${report.code}`));
  });

  test('valida los datos de la incidencia', async () => {
    const base = { category: 'material', description: 'Falta cable', priority: 'media' };
    const cases = [
      [{ ...base, category: 'magia' }, 'invalid_category'],
      [{ ...base, priority: 'urgentísima' }, 'invalid_priority'],
      [{ ...base, description: 'x' }, 'invalid_description'],
      [{ ...base, assigneeId: w.citizen.user.id }, 'invalid_assignee'],
    ];
    for (const [body, code] of cases) assert.equal((await w.op.c.post(`/api/reports/${report.id}/incidents`, body)).data.error.code, code);
    assert.equal((await w.op.c.post('/api/reports/CA-9999/incidents', base)).status, 404);
  });

  test('cambia el estado y documenta la resolución', async () => {
    const go = (body) => w.op2.c.patch(`/api/incidents/${incidentId}`, body);
    assert.equal((await go({ status: 'en_atencion' })).data.incident.status, 'en_atencion');
    assert.equal((await go({ status: 'resuelta' })).data.error.code, 'invalid_resolution');
    w.time.advanceHours(3);
    const solved = await go({ status: 'resuelta', resolution: 'Se compraron bombillas al proveedor local' });
    assert.equal(solved.status, 200);
    assert.equal(solved.data.incident.resolution, 'Se compraron bombillas al proveedor local');
    assert.equal(solved.data.incident.resolvedAt, w.time.now.toISOString());
    assert.equal((await go({ status: 'abierta' })).data.error.code, 'invalid_transition');
    assert.equal((await go({ status: 'cerrada' })).status, 200);
    assert.equal((await go({ status: 'en_atencion' })).data.error.code, 'invalid_transition', 'cerrada es final');
    assert.equal((await go({})).data.error.code, 'nothing_to_update');
  });

  test('guarda el historial de cambios y comentarios de cada incidencia', async () => {
    assert.equal((await w.sup.c.post(`/api/incidents/${incidentId}/comments`, { comment: 'Pedir stock mínimo para el mes' })).status, 201);
    const d = await w.sup.c.get(`/api/incidents/${incidentId}`);
    assert.deepEqual(d.data.events.map((e) => [e.kind, e.toValue]), [
      ['created', 'abierta'], ['status', 'en_atencion'], ['status', 'resuelta'], ['status', 'cerrada'], ['comment', null],
    ]);
    assert.equal(d.data.events[4].actorName, 'Prueba supervisor');
    assert.equal(d.data.events[2].comment, 'Se compraron bombillas al proveedor local');
    const log = await w.auditor.c.get(`/api/changelog?report=${report.code}&entity=incident`);
    assert.ok(log.data.total >= 5);
  });

  test('cambia prioridad y responsable con historial; filtra la lista', async () => {
    const i2 = (await w.op.c.post(`/api/reports/${report.id}/incidents`, { category: 'clima', description: 'Lluvia fuerte impide subir al poste', priority: 'baja' })).data.incident;
    const up = await w.sup.c.patch(`/api/incidents/${i2.id}`, { priority: 'critica', assigneeId: w.op.user.id });
    assert.equal(up.data.incident.priority, 'critica');
    assert.deepEqual(up.data.events.slice(1).map((e) => e.toValue), ['prioridad: critica', 'responsable: Prueba operador']);
    const cleared = await w.sup.c.patch(`/api/incidents/${i2.id}`, { assigneeId: null });
    assert.equal(cleared.data.incident.assignee, null);

    const byReport = await w.sup.c.get(`/api/incidents?report=${report.code}`);
    assert.equal(byReport.data.total, 2);
    assert.equal((await w.sup.c.get('/api/incidents?status=abierta')).data.items.every((i) => i.status === 'abierta'), true);
    assert.equal((await w.sup.c.get('/api/incidents?priority=critica')).data.total, 1);
    assert.equal((await w.sup.c.get('/api/incidents?status=xx')).data.error.code, 'invalid_status');
  });

  test('permisos: el ciudadano no ve incidencias; el gerente consulta pero no registra', async () => {
    assert.equal((await w.citizen.c.get('/api/incidents')).status, 403);
    assert.equal((await w.manager.c.get('/api/incidents')).status, 200);
    assert.equal((await w.manager.c.post(`/api/reports/${report.id}/incidents`, { category: 'otro', description: 'algo pasa', priority: 'baja' })).status, 403);
    assert.equal((await w.manager.c.get('/api/incidents/999999')).status, 404);
  });
});
