// Base común de la Épica 2: lo que usan los servicios de las cuatro personas del plan.
// Búsqueda de reportes, reglas de visibilidad, filtros compartidos (lista y panel) y serialización.
import { buildPermissionMap, can } from '../domain/permissions.js';
import {
  BUCKETS,
  CLOSED_STATUSES,
  REPORT_CODE_RE,
  STATUS_KEYS,
  isDueSoon,
  isOverdue,
  statusLabel,
} from '../domain/operations.js';
import { badRequest, forbidden, notFound } from '../http/errors.js';
import { parsePeriod } from '../lib/dates.js';
import { isUuid } from '../lib/tokens.js';

export const seesAllReports = (actor) => can(actor.permissions, 'operaciones', 'read');
export const canAssign = (actor) => can(actor.permissions, 'asignaciones', 'update');

export function createOpsContext({ repos, clock = () => new Date() }) {
  async function findReport(idOrCode) {
    const v = String(idOrCode ?? '').trim();
    if (isUuid(v)) return repos.reports.findById(v);
    if (REPORT_CODE_RE.test(v)) return repos.reports.findByCode(v.replace(/^#/, ''));
    return null;
  }

  /** El ciudadano solo ve sus reportes; a los demás se les responde 404 (no se revela que existe). */
  async function loadReport(actor, idOrCode) {
    const report = await findReport(idOrCode);
    if (!report || (!seesAllReports(actor) && report.createdBy !== actor.user.id)) {
      throw notFound('report_not_found', 'Reporte no encontrado.');
    }
    return report;
  }

  /** Quien no puede asignar (operador) solo trabaja sobre los reportes que tiene asignados. */
  function assertCanWork(actor, report) {
    if (!canAssign(actor) && report.assigneeId !== actor.user.id) {
      throw forbidden('not_assignee', 'Solo el responsable asignado puede trabajar en este reporte.');
    }
  }

  async function userNames(ids) {
    const map = new Map();
    for (const id of new Set(ids.filter(Boolean))) {
      map.set(id, (await repos.users.findById(id))?.fullName ?? 'Usuario eliminado');
    }
    return map;
  }

  async function typeMap() {
    return new Map((await repos.reportTypes.list()).map((t) => [t.code, t]));
  }

  /** Reporte para la API. `staff=false` oculta quién lo atiende internamente (vista ciudadana). */
  async function serializeReports(reports, { staff = true } = {}) {
    const now = clock();
    const types = await typeMap();
    const names = await userNames(reports.flatMap((r) => [r.createdBy, r.assigneeId]));
    return reports.map((r) => {
      const type = types.get(r.typeCode);
      return {
        id: r.id,
        code: r.code,
        typeCode: r.typeCode,
        typeName: type?.name ?? r.typeCode,
        title: r.title,
        description: r.description,
        location: r.location,
        status: r.status,
        statusLabel: statusLabel(r.status),
        createdBy: { id: r.createdBy, name: names.get(r.createdBy) ?? null },
        assignee: staff && r.assigneeId ? { id: r.assigneeId, name: names.get(r.assigneeId) } : null,
        hasAssignee: Boolean(r.assigneeId),
        assignedAt: staff ? (r.assignedAt ?? null) : null,
        dueAt: r.dueAt,
        overdue: isOverdue(r, now),
        dueSoon: isDueSoon(r, now, type?.warnBeforeHours ?? 0),
        resolvedAt: r.resolvedAt ?? null,
        closedAt: r.closedAt ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
  }

  /** Usuarios activos (con rol activo) que tienen ese permiso. Se usa para responsables y aprobadores. */
  async function usersWithPermission(module, action) {
    const out = [];
    for (const role of await repos.roles.list()) {
      if (!role.isActive) continue;
      const perms = buildPermissionMap(role, await repos.roles.getPermissions(role.id));
      if (!can(perms, module, action)) continue;
      const { items } = await repos.users.list({ status: 'active', roleId: role.id, limit: 1000, offset: 0 });
      for (const u of items) out.push({ ...u, roleCode: role.code, roleName: role.name });
    }
    return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * Filtros de reportes compartidos por GET /api/reports (HU-2.2/2.3) y el panel (HU-2.1/2.7):
   * por eso los indicadores siempre cuadran con lo que se puede consultar.
   */
  async function parseReportFilters(actor, query = {}) {
    const f = {};
    const { from, to } = parsePeriod(query);
    if (from) f.from = from;
    if (to) f.to = to;

    if (query.status) {
      const list = String(query.status).split(',').map((s) => s.trim()).filter(Boolean);
      const bad = list.find((s) => !STATUS_KEYS.includes(s));
      if (bad) throw badRequest('invalid_status', `Estado desconocido: ${bad}.`);
      f.statuses = list;
    }
    if (query.bucket) {
      const b = BUCKETS[query.bucket];
      if (!b) throw badRequest('invalid_bucket', `Agrupación desconocida: ${query.bucket}.`);
      f.statuses = f.statuses ? f.statuses.filter((s) => b.statuses.includes(s)) : [...b.statuses];
      if (f.statuses.length === 0) f.statuses = ['__ninguno__'];
    }
    if (query.typeCode) {
      if (!(await repos.reportTypes.findByCode(String(query.typeCode)))) {
        throw badRequest('invalid_type', 'El tipo de reporte no existe.');
      }
      f.typeCode = String(query.typeCode);
    }
    if (query.assigneeId) {
      const a = String(query.assigneeId);
      if (a === 'me') f.assigneeId = actor.user.id;
      else if (a === 'none') f.unassigned = true;
      else if (isUuid(a)) f.assigneeId = a;
      else throw badRequest('invalid_assignee', 'El responsable no es válido.');
    }
    if (query.q) f.q = String(query.q).trim().replace(/^#/, '').slice(0, 100);
    if (['1', 'true'].includes(String(query.overdue))) f.overdueAt = clock();
    // Sin permiso de operaciones, el alcance es "mis reportes" pase lo que pase.
    if (!seesAllReports(actor) || ['1', 'true'].includes(String(query.mine))) f.createdBy = actor.user.id;
    return f;
  }

  const isClosed = (report) => CLOSED_STATUSES.includes(report.status);

  return {
    findReport, loadReport, assertCanWork, userNames, typeMap, serializeReports,
    usersWithPermission, parseReportFilters, isClosed, clock,
  };
}
