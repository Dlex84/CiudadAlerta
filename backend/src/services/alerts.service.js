// HU-2.5 — Alertas y vencimientos: plazo por tipo, reportes vencidos y por vencer,
// sin repetir la misma alerta dentro de una ventana configurable, y registro de cada envío.
import { OPEN_STATUSES, isDueSoon, isOverdue } from '../domain/operations.js';
import { badRequest, notFound } from '../http/errors.js';
import { parsePeriod } from '../lib/dates.js';
import { intInRange } from '../lib/validate.js';
import { canAssign } from './operations-context.js';

const HOURS_MAX = 8760; // un año

function hoursOrThrow(v, field, label, min) {
  if (!Number.isInteger(v) || v < min || v > HOURS_MAX) {
    throw badRequest(`invalid_${field}`, `${label} debe ser un número entero de horas entre ${min} y ${HOURS_MAX}.`);
  }
  return v;
}

export function createAlertsService({ repos, ctx, changeLog, notifications, config, clock = () => new Date() }) {
  const dedupeMs = () => config.alerts.dedupeHours * 3_600_000;

  return {
    async listTypes() {
      return { items: await repos.reportTypes.list() };
    },

    /** Configura el plazo de un tipo. Aplica a los reportes nuevos; los existentes conservan su fecha límite. */
    async updateType(actor, code, body = {}) {
      const type = await repos.reportTypes.findByCode(String(code));
      if (!type) throw notFound('type_not_found', 'Tipo de reporte no encontrado.');
      return changeLog.track(actor, { entity: 'report_type', action: 'update', entityId: type.code }, async () => {
        const patch = {};
        if (body.slaHours !== undefined) patch.slaHours = hoursOrThrow(body.slaHours, 'sla_hours', 'El plazo', 1);
        if (body.warnBeforeHours !== undefined) {
          patch.warnBeforeHours = hoursOrThrow(body.warnBeforeHours, 'warn_before_hours', 'El aviso previo', 0);
        }
        if (body.isActive !== undefined) {
          if (typeof body.isActive !== 'boolean') throw badRequest('invalid_is_active', 'isActive debe ser verdadero o falso.');
          patch.isActive = body.isActive;
        }
        const sla = patch.slaHours ?? type.slaHours;
        const warn = patch.warnBeforeHours ?? type.warnBeforeHours;
        if (warn >= sla) throw badRequest('invalid_warn_before_hours', 'El aviso previo debe ser menor que el plazo.');
        if (Object.keys(patch).length === 0) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const updated = await repos.reportTypes.update(type.code, { ...patch, updatedBy: actor.user.id });
        const pick = (t) => ({ slaHours: t.slaHours, warnBeforeHours: t.warnBeforeHours, isActive: t.isActive });
        return { value: updated, oldValues: pick(type), newValues: pick(updated) };
      });
    },

    /**
     * Revisa los reportes abiertos y avisa de los vencidos y próximos a vencer.
     * Lo ejecuta un temporizador del servidor (ALERT_SCAN_MINUTES) y también se puede lanzar a mano.
     */
    async scan() {
      const now = clock();
      const types = await ctx.typeMap();
      const { items } = await repos.reports.list({ statuses: OPEN_STATUSES, limit: 10000, offset: 0 });
      let supervisors = null; // se calculan solo si hace falta
      const summary = { checked: items.length, overdue: 0, dueSoon: 0, sent: 0, failed: 0, skipped: 0 };

      for (const report of items) {
        const kind = isOverdue(report, now) ? 'overdue'
          : isDueSoon(report, now, types.get(report.typeCode)?.warnBeforeHours ?? 0) ? 'due_soon' : null;
        if (!kind) continue;
        summary[kind === 'overdue' ? 'overdue' : 'dueSoon'] += 1;

        // Sin responsable, avisa a quienes pueden asignar.
        let recipients = report.assigneeId ? [report.assigneeId] : null;
        if (!recipients) {
          supervisors ??= (await ctx.usersWithPermission('asignaciones', 'update')).map((u) => u.id);
          recipients = supervisors;
        }

        for (const userId of recipients) {
          const last = await repos.alertDeliveries.lastSentAt({ reportId: report.id, userId, kind });
          if (last && now.getTime() - new Date(last).getTime() < dedupeMs()) {
            summary.skipped += 1;
            continue;
          }
          const title = kind === 'overdue'
            ? `El reporte ${report.code} está vencido`
            : `El reporte ${report.code} vence pronto`;
          const body = `${report.title} — fecha límite: ${new Date(report.dueAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
          let result;
          try {
            result = await notifications.notify({ userId, kind: `alert_${kind}`, title, body, reportId: report.id, email: config.alerts.email });
          } catch (err) {
            result = { inApp: 'failed', email: 'skipped', error: String(err?.message ?? err).slice(0, 300) };
          }
          await repos.alertDeliveries.create({
            reportId: report.id, userId, kind, channel: 'in_app', status: result.inApp,
            error: result.inApp === 'failed' ? result.error : null, createdAt: now,
          });
          if (result.email !== 'skipped') {
            await repos.alertDeliveries.create({
              reportId: report.id, userId, kind, channel: 'email', status: result.email, error: result.email === 'failed' ? result.error : null, createdAt: now,
            });
          }
          if (result.inApp === 'sent') summary.sent += 1;
          else summary.failed += 1;
          if (result.email === 'failed') summary.failed += 1;
        }
      }
      return summary;
    },

    /** Registro de envíos: qué alerta, a quién, por qué canal y con qué resultado. */
    async deliveries(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 25, min: 1, max: 100 });
      const { from, to } = parsePeriod(query);
      const f = { from, to, limit, offset: (page - 1) * limit };
      if (query.kind) {
        if (!['due_soon', 'overdue'].includes(query.kind)) throw badRequest('invalid_kind', 'El tipo de alerta debe ser due_soon u overdue.');
        f.kind = query.kind;
      }
      if (query.status) {
        if (!['sent', 'failed'].includes(query.status)) throw badRequest('invalid_status', 'El resultado debe ser sent o failed.');
        f.status = query.status;
      }
      if (query.report) {
        const report = await ctx.findReport(query.report);
        if (!report) return { items: [], total: 0, page, limit };
        f.reportId = report.id;
      }
      const { items, total } = await repos.alertDeliveries.list(f);
      const names = await ctx.userNames(items.map((d) => d.userId));
      const codes = new Map();
      for (const id of new Set(items.map((d) => d.reportId))) codes.set(id, (await repos.reports.findById(id))?.code ?? null);
      return {
        items: items.map((d) => ({ ...d, userName: d.userId ? names.get(d.userId) : null, reportCode: codes.get(d.reportId) })),
        total,
        page,
        limit,
      };
    },

    /** Reportes vencidos o por vencer, para la bandeja del panel. */
    async upcoming(actor) {
      const now = clock();
      const types = await ctx.typeMap();
      const scope = canAssign(actor) ? {} : { assigneeId: actor.user.id }; // el operador ve solo lo suyo
      const { items } = await repos.reports.list({ statuses: OPEN_STATUSES, ...scope, limit: 10000, offset: 0 });
      const hits = items.filter((r) => isOverdue(r, now) || isDueSoon(r, now, types.get(r.typeCode)?.warnBeforeHours ?? 0));
      hits.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
      return { items: await ctx.serializeReports(hits.slice(0, 200)) };
    },
  };
}
