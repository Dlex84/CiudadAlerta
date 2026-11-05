// HU-2.4 — Flujos de aprobación: pasos configurables por tipo, decisión con aprobador, fecha y comentario,
// bloqueo de «Resuelto» mientras una aprobación obligatoria esté pendiente o rechazada, y devolución para corrección.
import { APPROVAL_DECISIONS } from '../domain/operations.js';
import { SUPER_ADMIN_CODE } from '../domain/permissions.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { optionalText, requireText } from '../lib/validate.js';

const STEP_NAME = { field: 'step_name', label: 'El nombre del paso', min: 3, max: 80 };
const COMMENT = { field: 'comment', label: 'El comentario', min: 3, max: 1000 };
const MAX_STEPS = 5;

const latestRound = (rows) => rows.reduce((m, r) => Math.max(m, r.round), 0);

/** Estado de una ronda: pending | approved | rejected | returned | cancelled. */
export function roundStatus(rows) {
  const req = rows.filter((r) => r.required);
  const relevant = req.length ? req : rows;
  if (relevant.some((r) => r.decision === 'returned')) return 'returned';
  if (relevant.some((r) => r.decision === 'rejected')) return 'rejected';
  if (relevant.some((r) => r.decision === 'cancelled')) return 'cancelled';
  if (relevant.some((r) => r.decision === 'pending')) return 'pending';
  return 'approved';
}

/** Regla de HU-2.4 que llama HU-2.2 antes de pasar a «Resuelto». */
export async function assertCanResolve(repos, report) {
  const rows = await repos.approvals.listByReport(report.id);
  const round = latestRound(rows);
  if (!round) {
    const steps = await repos.approvalSteps.listByType(report.typeCode);
    if (!steps.some((s) => s.required)) return; // este tipo no exige aprobación
    throw conflict('approval_required', 'Este reporte necesita aprobación antes de marcarse como «Resuelto». Solicítala primero.');
  }
  const status = roundStatus(rows.filter((r) => r.round === round));
  if (status === 'pending') throw conflict('approval_pending', 'Hay una aprobación obligatoria pendiente: no se puede marcar como «Resuelto» todavía.');
  if (status !== 'approved') {
    throw conflict('approval_rejected', 'La última aprobación fue rechazada o devuelta. Corrige y solicítala de nuevo.');
  }
}

export function createApprovalsService({ repos, ctx, changeLog, notifications, clock = () => new Date() }) {
  const isSuper = (actor) => actor.role.code === SUPER_ADMIN_CODE;

  /** Un paso se puede decidir si todos los obligatorios anteriores ya están aprobados. */
  const isTurn = (row, roundRows) =>
    roundRows.filter((r) => r.stepOrder < row.stepOrder && r.required).every((r) => r.decision === 'approved');

  async function approversFor(step) {
    const users = await ctx.usersWithPermission('aprobaciones', 'update');
    return users.filter((u) => !step.approverRoleCode || u.roleCode === step.approverRoleCode || u.roleCode === SUPER_ADMIN_CODE);
  }

  async function notifyApprovers(report, step) {
    for (const u of await approversFor(step)) {
      if (u.roleCode === SUPER_ADMIN_CODE && step.approverRoleCode) continue; // al super admin no se le llena la bandeja
      await notifications.notify({
        userId: u.id, kind: 'approval_requested', title: `Aprobación pendiente: ${report.code}`,
        body: `${step.stepName} — ${report.title}`, reportId: report.id,
      });
    }
  }

  async function serializeRows(rows) {
    const names = await ctx.userNames(rows.flatMap((r) => [r.requestedBy, r.decidedBy]));
    return rows.map((r) => ({
      id: r.id, round: r.round, stepOrder: r.stepOrder, stepName: r.stepName, approverRoleCode: r.approverRoleCode,
      required: r.required, decision: r.decision, comment: r.comment,
      requestedBy: names.get(r.requestedBy) ?? null, requestedAt: r.requestedAt,
      decidedBy: r.decidedBy ? names.get(r.decidedBy) : null, decidedAt: r.decidedAt,
    }));
  }

  async function forReport(actor, report) {
    const rows = await repos.approvals.listByReport(report.id);
    const serialized = await serializeRows(rows);
    const rounds = [];
    for (let n = 1; n <= latestRound(rows); n++) {
      const rr = rows.filter((r) => r.round === n);
      rounds.push({ round: n, status: roundStatus(rr), steps: serialized.filter((s) => s.round === n) });
    }
    const current = rounds.at(-1);
    const steps = await repos.approvalSteps.listByType(report.typeCode);
    return {
      configuredSteps: steps,
      rounds,
      currentStatus: current?.status ?? (steps.some((s) => s.required) ? 'not_requested' : 'not_required'),
      canRequest: report.status === 'en_proceso' && steps.length > 0 && (!current || !['pending', 'approved'].includes(current.status)),
    };
  }

  return {
    async getSteps(code) {
      const type = await repos.reportTypes.findByCode(String(code));
      if (!type) throw notFound('type_not_found', 'Tipo de reporte no encontrado.');
      return { type, steps: await repos.approvalSteps.listByType(type.code) };
    },

    /** Reemplaza los pasos de un tipo. Las rondas ya solicitadas conservan los pasos con los que se crearon. */
    async setSteps(actor, code, body = {}) {
      const type = await repos.reportTypes.findByCode(String(code));
      if (!type) throw notFound('type_not_found', 'Tipo de reporte no encontrado.');
      return changeLog.track(actor, { entity: 'approval_steps', action: 'update', entityId: type.code }, async () => {
        if (!Array.isArray(body.steps)) throw badRequest('invalid_steps', 'Se esperaba una lista de pasos.');
        if (body.steps.length > MAX_STEPS) throw badRequest('invalid_steps', `Como máximo ${MAX_STEPS} pasos de aprobación.`);
        const roleCodes = new Set((await repos.roles.list()).filter((r) => r.code && r.isActive).map((r) => r.code));
        const steps = body.steps.map((s, i) => {
          const approverRoleCode = s?.approverRoleCode ? String(s.approverRoleCode) : null;
          if (approverRoleCode && !roleCodes.has(approverRoleCode)) {
            throw badRequest('invalid_approver_role', `El rol aprobador "${approverRoleCode}" no existe o está inactivo.`);
          }
          if (s?.required !== undefined && typeof s.required !== 'boolean') {
            throw badRequest('invalid_steps', 'required debe ser verdadero o falso.');
          }
          return { stepOrder: i + 1, name: requireText(s?.name, STEP_NAME), approverRoleCode, required: s?.required ?? true };
        });
        const before = await repos.approvalSteps.listByType(type.code);
        await repos.approvalSteps.replaceForType(type.code, steps);
        const after = await repos.approvalSteps.listByType(type.code);
        const pick = (list) => list.map(({ stepOrder, name, approverRoleCode, required }) => ({ stepOrder, name, approverRoleCode, required }));
        return { value: { type, steps: after }, oldValues: { steps: pick(before) }, newValues: { steps: pick(after) } };
      });
    },

    async listForReport(actor, idOrCode) {
      return forReport(actor, await ctx.loadReport(actor, idOrCode));
    },

    /** El responsable (o un supervisor) pide el visto bueno para cerrar. Abre una ronda nueva. */
    async request(actor, idOrCode) {
      const report = await ctx.loadReport(actor, idOrCode);
      return changeLog.track(actor, { entity: 'approval', action: 'request', entityId: report.code, reportId: report.id }, async () => {
        ctx.assertCanWork(actor, report);
        if (report.status !== 'en_proceso') {
          throw conflict('invalid_status_for_approval', 'Solo se puede solicitar aprobación cuando el reporte está «En proceso».');
        }
        const steps = await repos.approvalSteps.listByType(report.typeCode);
        if (!steps.length) throw conflict('no_approval_steps', 'Este tipo de reporte no tiene pasos de aprobación configurados.');
        const rows = await repos.approvals.listByReport(report.id);
        const round = latestRound(rows);
        if (round) {
          const status = roundStatus(rows.filter((r) => r.round === round));
          if (status === 'pending') throw conflict('approval_already_pending', 'Ya hay una solicitud de aprobación pendiente.');
          if (status === 'approved') throw conflict('already_approved', 'El cierre ya fue aprobado: puedes marcarlo como «Resuelto».');
        }
        const now = clock();
        await repos.approvals.createRound(report.id, round + 1, steps.map((s) => ({
          stepOrder: s.stepOrder, stepName: s.name, approverRoleCode: s.approverRoleCode, required: s.required,
          requestedBy: actor.user.id, requestedAt: now,
        })));
        const created = (await repos.approvals.listByReport(report.id)).filter((r) => r.round === round + 1);
        await notifyApprovers(report, created[0]);
        return {
          value: await forReport(actor, report),
          newValues: { round: round + 1, steps: created.map((s) => s.stepName) },
        };
      });
    },

    /** Aprobar, rechazar o devolver para corrección (con motivo). */
    async decide(actor, idOrCode, approvalId, body = {}) {
      const report = await ctx.loadReport(actor, idOrCode);
      const row = await repos.approvals.findById(approvalId);
      if (!row || row.reportId !== report.id) throw notFound('approval_not_found', 'Aprobación no encontrada.');
      return changeLog.track(actor, { entity: 'approval', action: 'decide', entityId: row.id, reportId: report.id }, async () => {
        const decision = String(body.decision ?? '');
        if (!APPROVAL_DECISIONS.includes(decision)) {
          throw badRequest('invalid_decision', 'La decisión debe ser approved (aprobar), rejected (rechazar) o returned (devolver).');
        }
        const comment = decision === 'approved' ? optionalText(body.comment, COMMENT) : requireText(body.comment, COMMENT);
        const all = await repos.approvals.listByReport(report.id);
        if (row.decision !== 'pending' || row.round !== latestRound(all)) {
          throw conflict('approval_not_pending', 'Esta aprobación ya fue decidida o no está vigente.');
        }
        const roundRows = all.filter((r) => r.round === row.round);
        if (!isTurn(row, roundRows)) throw conflict('previous_step_pending', 'Primero deben aprobarse los pasos anteriores.');
        if (row.approverRoleCode && row.approverRoleCode !== actor.role.code && !isSuper(actor)) {
          const role = (await repos.roles.findByCode(row.approverRoleCode))?.name ?? row.approverRoleCode;
          throw forbidden('not_approver', `Este paso lo decide el rol «${role}».`);
        }
        if (report.assigneeId === actor.user.id) {
          throw forbidden('self_approval', 'No puedes aprobar un reporte que tú mismo atiendes.');
        }
        const decided = await repos.approvals.decide(row.id, { decision, comment, decidedBy: actor.user.id, decidedAt: clock() });
        if (!decided) throw conflict('approval_not_pending', 'Esta aprobación ya fue decidida o no está vigente.');

        if (decision !== 'approved') await repos.approvals.cancelPending(report.id, row.round);
        const after = (await repos.approvals.listByReport(report.id)).filter((r) => r.round === row.round);
        const status = roundStatus(after);
        const notifyTo = report.assigneeId;
        if (notifyTo) {
          const messages = {
            returned: [`Reporte ${report.code} devuelto para corrección`, `Motivo: ${comment}`],
            rejected: [`Aprobación rechazada: ${report.code}`, `Motivo: ${comment}`],
            approved: status === 'approved' ? [`Cierre aprobado: ${report.code}`, 'Ya puedes marcarlo como «Resuelto».'] : null,
          };
          const m = messages[decision];
          if (m) await notifications.notify({ userId: notifyTo, kind: `approval_${decision}`, title: m[0], body: m[1], reportId: report.id });
        }
        // Si quedan pasos, avisa a los del siguiente.
        const nextStep = after.find((r) => r.decision === 'pending' && isTurn(r, after));
        if (decision === 'approved' && nextStep) await notifyApprovers(report, nextStep);

        return {
          value: await forReport(actor, report),
          oldValues: { decision: 'pending', step: row.stepName },
          newValues: { decision, step: row.stepName, ...(comment ? { comment } : {}), roundStatus: status },
        };
      });
    },

    /** Bandeja: pasos pendientes que le toca decidir a este usuario. */
    async pendingForMe(actor) {
      const pending = await repos.approvals.listPending();
      const items = [];
      for (const row of pending) {
        if (row.approverRoleCode && row.approverRoleCode !== actor.role.code && !isSuper(actor)) continue;
        const all = await repos.approvals.listByReport(row.reportId);
        if (row.round !== latestRound(all) || !isTurn(row, all.filter((r) => r.round === row.round))) continue;
        const report = await repos.reports.findById(row.reportId);
        if (!report) continue;
        const [r] = await ctx.serializeReports([report]);
        const [s] = await serializeRows([row]);
        items.push({ ...s, report: r, ownReport: report.assigneeId === actor.user.id });
      }
      return { items };
    },
  };
}
