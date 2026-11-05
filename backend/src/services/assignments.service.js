// HU-2.3 — Asignación de responsables: asignar y reasignar solo entre usuarios autorizados,
// registrando quién, cuándo y por qué, y avisando al responsable.
import { badRequest, conflict } from '../http/errors.js';
import { isUuid } from '../lib/tokens.js';
import { optionalText, requireText } from '../lib/validate.js';

const REASON = { field: 'reason', label: 'El motivo de la reasignación', min: 3, max: 500 };

export function createAssignmentsService({ repos, ctx, changeLog, notifications, clock = () => new Date() }) {
  /** Responsables posibles: usuarios activos con permiso para atender reportes (operaciones.update). */
  async function eligible() {
    return ctx.usersWithPermission('operaciones', 'update');
  }

  return {
    async listEligible() {
      const users = await eligible();
      const items = [];
      for (const u of users) {
        const { total } = await repos.reports.list({
          assigneeId: u.id, statuses: ['reportado', 'validado', 'en_revision', 'en_proceso'], limit: 1, offset: 0,
        });
        items.push({ id: u.id, fullName: u.fullName, roleName: u.roleName, openAssigned: total });
      }
      return { items };
    },

    async assign(actor, idOrCode, body = {}) {
      const report = await ctx.loadReport(actor, idOrCode);
      return changeLog.track(actor, { entity: 'report', action: 'assign', entityId: report.code, reportId: report.id }, async () => {
        if (ctx.isClosed(report)) throw conflict('report_closed', 'No se puede asignar un reporte cerrado.');
        const assigneeId = String(body.assigneeId ?? '');
        const candidate = isUuid(assigneeId) ? (await eligible()).find((u) => u.id === assigneeId) : null;
        if (!candidate) {
          throw badRequest('invalid_assignee', 'El responsable debe ser un usuario activo con permiso para atender reportes.');
        }
        if (report.assigneeId === candidate.id) throw conflict('already_assigned', 'Ese usuario ya es el responsable.');
        const reassign = Boolean(report.assigneeId);
        const reason = reassign ? requireText(body.reason, REASON) : optionalText(body.reason, REASON);

        const now = clock();
        const updated = await repos.reports.update(
          report.id,
          { assigneeId: candidate.id, assignedAt: now, updatedAt: now },
          { expectedStatus: report.status },
        );
        if (!updated) throw conflict('status_changed', 'El reporte cambió mientras lo editabas. Recarga e inténtalo de nuevo.');
        await repos.assignments.add({
          reportId: report.id,
          assigneeId: candidate.id,
          previousAssigneeId: report.assigneeId ?? null,
          assignedBy: actor.user.id,
          reason,
          createdAt: now,
        });

        await notifications.notify({
          userId: candidate.id,
          kind: 'assigned',
          title: `Se te asignó el reporte ${report.code}`,
          body: `${report.title} — ${report.location}${reason ? `. Motivo: ${reason}` : ''}`,
          reportId: report.id,
          email: true,
        });
        if (reassign) {
          await notifications.notify({
            userId: report.assigneeId,
            kind: 'unassigned',
            title: `El reporte ${report.code} fue reasignado`,
            body: `Ahora lo atiende ${candidate.fullName}. Motivo: ${reason}`,
            reportId: report.id,
          });
        }
        const names = await ctx.userNames([report.assigneeId]);
        const [value] = await ctx.serializeReports([updated]);
        return {
          value,
          oldValues: { assigneeId: report.assigneeId ?? null, assigneeName: report.assigneeId ? names.get(report.assigneeId) : null },
          newValues: { assigneeId: candidate.id, assigneeName: candidate.fullName, ...(reason ? { reason } : {}) },
        };
      });
    },

    /** Historial de asignaciones: quién asignó, a quién, cuándo y el motivo. */
    async history(actor, idOrCode) {
      const report = await ctx.loadReport(actor, idOrCode);
      const rows = await repos.assignments.listByReport(report.id);
      const names = await ctx.userNames(rows.flatMap((r) => [r.assigneeId, r.previousAssigneeId, r.assignedBy]));
      return {
        items: rows.map((r) => ({
          assignee: { id: r.assigneeId, name: names.get(r.assigneeId) },
          previousAssignee: r.previousAssigneeId ? { id: r.previousAssigneeId, name: names.get(r.previousAssigneeId) } : null,
          assignedBy: { id: r.assignedBy, name: names.get(r.assignedBy) },
          reason: r.reason,
          createdAt: r.createdAt,
        })),
      };
    },
  };
}
