// HU-2.2 — Registro y seguimiento de reportes (operaciones): creación, validación, ciclo de vida e historial.
import { can } from '../domain/permissions.js';
import {
  CLOSED_STATUSES,
  INITIAL_STATUS,
  STATUS_KEYS,
  TRANSITIONS,
  canTransition,
  needsReason,
  operationsMeta,
  statusLabel,
} from '../domain/operations.js';
import { badRequest, conflict } from '../http/errors.js';
import { addHours } from '../lib/dates.js';
import { intInRange, optionalText, requireText } from '../lib/validate.js';
import { assertCanResolve } from './approvals.service.js';
import { canAssign, seesAllReports } from './operations-context.js';

const TITLE = { field: 'title', label: 'El título', min: 3, max: 120 };
const DESCRIPTION = { field: 'description', label: 'La descripción', min: 10, max: 2000 };
const LOCATION = { field: 'location', label: 'La ubicación', min: 3, max: 200 };
const REASON = { field: 'reason', label: 'El motivo', min: 3, max: 500 };

export function createReportsService({ repos, ctx, changeLog, notifications, clock = () => new Date() }) {
  /** Siguientes estados que este usuario puede elegir ahora, con el motivo si una regla lo impide (para los botones). */
  async function allowedTransitions(actor, report) {
    if (!seesAllReports(actor) || !can(actor.permissions, 'operaciones', 'update')) return [];
    if (!canAssign(actor) && report.assigneeId !== actor.user.id) return [];
    const out = [];
    for (const to of TRANSITIONS[report.status]) {
      let blocked = null;
      if (to === 'en_proceso' && !report.assigneeId) blocked = 'Asigna un responsable primero.';
      if (to === 'resuelto') blocked = await assertCanResolve(repos, report).then(() => null, (e) => e.message);
      out.push({ to, label: statusLabel(to), reasonRequired: needsReason(report.status, to), blocked });
    }
    return out;
  }

  /** Detalle + historial (pantalla 13 «Seguimiento»). */
  async function getDetail(actor, idOrCode) {
    const report = await ctx.loadReport(actor, idOrCode);
    const staff = seesAllReports(actor);
    const [value] = await ctx.serializeReports([report], { staff });
    const history = await repos.reportHistory.listByReport(report.id);
    const names = staff ? await ctx.userNames(history.map((h) => h.changedBy)) : new Map();
    return {
      report: value,
      history: history.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        label: statusLabel(h.toStatus),
        reason: h.reason,
        changedBy: staff ? (names.get(h.changedBy) ?? null) : null,
        createdAt: h.createdAt,
      })),
      allowedTransitions: await allowedTransitions(actor, report),
    };
  }

  return {
    async meta() {
      return { ...operationsMeta(), types: (await repos.reportTypes.list()).filter((t) => t.isActive) };
    },

    async create(actor, body = {}) {
      return changeLog.track(actor, { entity: 'report', action: 'create' }, async () => {
        const type = body.typeCode ? await repos.reportTypes.findByCode(String(body.typeCode)) : null;
        if (!type || !type.isActive) throw badRequest('invalid_type', 'Elige un tipo de reporte válido.');
        const title = requireText(body.title, TITLE);
        const description = requireText(body.description, DESCRIPTION);
        const location = requireText(body.location, LOCATION);
        const now = clock();
        const report = await repos.reports.create({
          typeCode: type.code,
          title,
          description,
          location,
          status: INITIAL_STATUS,
          createdBy: actor.user.id,
          dueAt: addHours(now, type.slaHours),
          createdAt: now,
        });
        await repos.reportHistory.add({
          reportId: report.id, fromStatus: null, toStatus: INITIAL_STATUS, changedBy: actor.user.id, createdAt: now,
        });
        const [value] = await ctx.serializeReports([report], { staff: seesAllReports(actor) });
        return {
          value,
          entityId: report.code,
          reportId: report.id,
          newValues: { code: report.code, typeCode: type.code, title, location, status: INITIAL_STATUS, dueAt: report.dueAt },
        };
      });
    },

    async list(actor, query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 20, min: 1, max: 100 });
      const filters = await ctx.parseReportFilters(actor, query);
      const { items, total } = await repos.reports.list({ ...filters, limit, offset: (page - 1) * limit });
      return { items: await ctx.serializeReports(items, { staff: seesAllReports(actor) }), total, page, limit };
    },

    get: getDetail,

    /** Cambia el estado si la transición está permitida y se cumplen sus reglas. */
    async transition(actor, idOrCode, body = {}) {
      const report = await ctx.loadReport(actor, idOrCode);
      return changeLog.track(actor, { entity: 'report', action: 'status_change', entityId: report.code, reportId: report.id }, async () => {
        const to = String(body.to ?? '');
        if (!STATUS_KEYS.includes(to)) throw badRequest('invalid_status', 'El estado indicado no existe.');
        ctx.assertCanWork(actor, report);
        const from = report.status;
        if (!canTransition(from, to)) {
          const allowed = TRANSITIONS[from].map(statusLabel);
          throw conflict(
            'invalid_transition',
            `No se puede pasar de «${statusLabel(from)}» a «${statusLabel(to)}».` +
              (allowed.length ? ` Desde «${statusLabel(from)}» solo se permite: ${allowed.join(', ')}.` : ' El reporte ya está cerrado.'),
            { from, to, allowed: TRANSITIONS[from] },
          );
        }
        if (to === 'en_proceso' && !report.assigneeId) {
          throw conflict('assignee_required', 'Asigna un responsable antes de pasar el reporte a «En proceso».');
        }
        const reason = needsReason(from, to) ? requireText(body.reason, REASON) : optionalText(body.reason, REASON);
        if (to === 'resuelto') await assertCanResolve(repos, report);

        const now = clock();
        const patch = { status: to, updatedAt: now };
        if (CLOSED_STATUSES.includes(to)) patch.closedAt = now;
        if (to === 'resuelto') patch.resolvedAt = now;
        const updated = await repos.reports.update(report.id, patch, { expectedStatus: from });
        if (!updated) throw conflict('status_changed', 'El reporte cambió mientras lo editabas. Recarga e inténtalo de nuevo.');

        await repos.reportHistory.add({ reportId: report.id, fromStatus: from, toStatus: to, reason, changedBy: actor.user.id, createdAt: now });
        // Si el trabajo sale de «En proceso», las aprobaciones que quedaban pendientes ya no aplican.
        if (from === 'en_proceso') {
          const rounds = (await repos.approvals.listByReport(report.id)).map((a) => a.round);
          if (rounds.length) await repos.approvals.cancelPending(report.id, Math.max(...rounds));
        }
        if (report.createdBy !== actor.user.id) {
          await notifications.notify({
            userId: report.createdBy,
            kind: 'status_changed',
            title: `Tu reporte ${report.code} está ${statusLabel(to).toLowerCase()}`,
            body: reason ? `${report.title}. Motivo: ${reason}` : report.title,
            reportId: report.id,
          });
        }
        return {
          value: await getDetail(actor, report.id),
          oldValues: { status: from },
          newValues: { status: to, ...(reason ? { reason } : {}) },
        };
      });
    },
  };
}
