// Ayudas compartidas para las pruebas de la Épica 2 (base común).
import { loggedIn, startTestApp } from './app.js';

/** Reloj controlable: las alertas y los vencimientos dependen de la hora. */
export function testClock(start = '2026-11-02T12:00:00Z') {
  let now = new Date(start).getTime();
  return {
    clock: () => new Date(now),
    advanceHours(h) { now += h * 3_600_000; },
    get now() { return new Date(now); },
  };
}

/** App con un usuario de cada rol de la épica ya autenticado. Sesiones largas para poder adelantar el reloj. */
export async function opsWorld({ env = {}, ...opts } = {}) {
  const time = testClock();
  const app = await startTestApp({ clock: time.clock, env: { SESSION_TTL_HOURS: '100000', ...env }, ...opts });
  const as = async (role, email) => loggedIn(app, role, email);
  const citizen = await as('ciudadano', 'ana@test.do');
  const citizen2 = await as('ciudadano', 'beto@test.do');
  const sup = await as('supervisor', 'sup@test.do');
  const op = await as('operador', 'op@test.do');
  const op2 = await as('operador', 'op2@test.do');
  const manager = await as('gerente', 'gerente@test.do');
  const auditor = await as('auditor', 'auditor@test.do');
  return { app, time, citizen, citizen2, sup, op, op2, manager, auditor };
}

export const reportBody = (over = {}) => ({
  typeCode: 'alumbrado',
  title: 'Poste de luz apagado',
  description: 'La luminaria permanece apagada durante la noche.',
  location: 'Calle 10, Villa Mella',
  ...over,
});

export async function newReport(client, over = {}) {
  const res = await client.post('/api/reports', reportBody(over));
  if (res.status !== 201) throw new Error(`no se pudo crear el reporte: ${JSON.stringify(res.data)}`);
  return res.data;
}

/** Lleva un reporte (como supervisor) hasta «En proceso» con el responsable indicado. */
export async function toInProcess(sup, reportId, assigneeId) {
  for (const to of ['validado', 'en_revision']) {
    const r = await sup.post(`/api/reports/${reportId}/transitions`, { to });
    if (r.status !== 200) throw new Error(`transición a ${to}: ${JSON.stringify(r.data)}`);
  }
  const a = await sup.put(`/api/reports/${reportId}/assignee`, { assigneeId });
  if (a.status !== 200) throw new Error(`asignación: ${JSON.stringify(a.data)}`);
  const p = await sup.post(`/api/reports/${reportId}/transitions`, { to: 'en_proceso' });
  if (p.status !== 200) throw new Error(`en_proceso: ${JSON.stringify(p.data)}`);
}

/** Pide la aprobación y la aprueba (todos los pasos con el cliente dado). */
export async function approveClosure(requester, approver, reportId) {
  const req = await requester.post(`/api/reports/${reportId}/approvals`);
  if (req.status !== 201) throw new Error(`solicitud: ${JSON.stringify(req.data)}`);
  for (const step of req.data.rounds.at(-1).steps) {
    const d = await approver.post(`/api/reports/${reportId}/approvals/${step.id}/decision`, { decision: 'approved' });
    if (d.status !== 200) throw new Error(`decisión: ${JSON.stringify(d.data)}`);
  }
}
