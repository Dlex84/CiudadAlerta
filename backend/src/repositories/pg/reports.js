// HU-2.2 (reportes e historial), HU-2.3 (asignaciones) y HU-2.5 (tipos con plazo).
import { CLOSED_STATUSES } from '../../domain/operations.js';
import { insertParts, likeEscape, setParts, whereBuilder } from './where.js';

const mapReport = (r) =>
  r && {
    id: r.id, code: r.code, typeCode: r.type_code, title: r.title, description: r.description,
    location: r.location, status: r.status, createdBy: r.created_by, assigneeId: r.assignee_id,
    assignedAt: r.assigned_at, dueAt: r.due_at, resolvedAt: r.resolved_at, closedAt: r.closed_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };

const REPORT_COLUMNS = {
  status: 'status', assigneeId: 'assignee_id', assignedAt: 'assigned_at', resolvedAt: 'resolved_at',
  closedAt: 'closed_at', updatedAt: 'updated_at',
};

/** Mismos filtros que el repositorio en memoria (test/helpers/memory-repos.js). */
function reportWhere(f = {}) {
  const w = whereBuilder();
  if (f.statuses?.length) w.add('status = ANY(?::text[])', f.statuses);
  if (f.typeCode) w.add('type_code = ?', f.typeCode);
  if (f.assigneeId) w.add('assignee_id = ?::uuid', f.assigneeId);
  if (f.unassigned) w.add('assignee_id IS NULL');
  if (f.createdBy) w.add('created_by = ?::uuid', f.createdBy);
  if (f.from) w.add('created_at >= ?', f.from);
  if (f.to) w.add('created_at <= ?', f.to);
  if (f.q) w.add('(code ILIKE ? OR title ILIKE ? OR location ILIKE ?)', likeEscape(f.q), likeEscape(f.q), likeEscape(f.q));
  if (f.overdueAt) w.add('status <> ALL(?::text[]) AND due_at < ?', CLOSED_STATUSES, f.overdueAt);
  return w;
}

export function createReportsRepo(pool) {
  const one = async (sql, vals) => mapReport((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    async create({ typeCode, title, description, location, status, createdBy, dueAt, createdAt }) {
      return one(
        `INSERT INTO reports (code, type_code, title, description, location, status, created_by, due_at, created_at, updated_at)
         VALUES ('CA-' || lpad(nextval('report_code_seq')::text, 4, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING *`,
        [typeCode, title, description, location, status, createdBy, dueAt, createdAt],
      );
    },

    findById: (id) => one('SELECT * FROM reports WHERE id = $1', [id]),
    findByCode: (code) => one('SELECT * FROM reports WHERE upper(code) = upper($1)', [code]),

    async list(filters) {
      const w = reportWhere(filters);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM reports WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = w.page(filters.limit, filters.offset);
      const { rows } = await pool.query(
        `SELECT * FROM reports WHERE ${w.sql} ORDER BY created_at DESC, id ${page}`,
        w.vals,
      );
      return { items: rows.map(mapReport), total };
    },

    /** HU-2.1: conteo por estado + vencidos + última actualización, con los mismos filtros que list(). */
    async summarize(filters, now) {
      const w = reportWhere(filters);
      const { rows } = await pool.query(
        `SELECT status, count(*)::int AS n, max(updated_at) AS last,
                count(*) FILTER (WHERE status <> ALL($${w.vals.length + 1}::text[]) AND due_at < $${w.vals.length + 2})::int AS overdue
           FROM reports WHERE ${w.sql} GROUP BY status`,
        [...w.vals, CLOSED_STATUSES, now],
      );
      const byStatus = {};
      let overdue = 0;
      let lastUpdatedAt = null;
      for (const r of rows) {
        byStatus[r.status] = r.n;
        overdue += r.overdue;
        if (r.last && (!lastUpdatedAt || r.last > lastUpdatedAt)) lastUpdatedAt = r.last;
      }
      return { byStatus, overdue, lastUpdatedAt };
    },

    /** Actualiza solo si el estado sigue siendo el esperado (evita que dos personas pisen el mismo cambio). */
    async update(id, patch, { expectedStatus } = {}) {
      const { sets, vals } = setParts(REPORT_COLUMNS, patch, [id]);
      if (patch.updatedAt === undefined) sets.push('updated_at = now()');
      let guard = '';
      if (expectedStatus) { vals.push(expectedStatus); guard = ` AND status = $${vals.length}`; }
      return one(`UPDATE reports SET ${sets.join(', ')} WHERE id = $1${guard} RETURNING *`, vals);
    },
  };
}

export function createReportHistoryRepo(pool) {
  const map = (r) => ({
    id: String(r.id), reportId: r.report_id, fromStatus: r.from_status, toStatus: r.to_status,
    reason: r.reason, changedBy: r.changed_by, createdAt: r.created_at,
  });
  return {
    async add({ reportId, fromStatus, toStatus, reason, changedBy, createdAt }) {
      await pool.query(
        `INSERT INTO report_status_history (report_id, from_status, to_status, reason, changed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [reportId, fromStatus ?? null, toStatus, reason ?? null, changedBy ?? null, createdAt],
      );
    },
    async listByReport(reportId) {
      const { rows } = await pool.query(
        'SELECT * FROM report_status_history WHERE report_id = $1 ORDER BY created_at, id',
        [reportId],
      );
      return rows.map(map);
    },
  };
}

export function createAssignmentsRepo(pool) {
  const map = (r) => ({
    id: String(r.id), reportId: r.report_id, assigneeId: r.assignee_id, previousAssigneeId: r.previous_assignee_id,
    assignedBy: r.assigned_by, reason: r.reason, createdAt: r.created_at,
  });
  return {
    async add({ reportId, assigneeId, previousAssigneeId, assignedBy, reason, createdAt }) {
      await pool.query(
        `INSERT INTO report_assignments (report_id, assignee_id, previous_assignee_id, assigned_by, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [reportId, assigneeId, previousAssigneeId ?? null, assignedBy, reason ?? null, createdAt],
      );
    },
    async listByReport(reportId) {
      const { rows } = await pool.query(
        'SELECT * FROM report_assignments WHERE report_id = $1 ORDER BY created_at, id',
        [reportId],
      );
      return rows.map(map);
    },
  };
}

export function createReportTypesRepo(pool) {
  const map = (r) =>
    r && {
      code: r.code, name: r.name, slaHours: r.sla_hours, warnBeforeHours: r.warn_before_hours,
      isActive: r.is_active, updatedBy: r.updated_by, updatedAt: r.updated_at,
    };
  const COLUMNS = {
    code: 'code', name: 'name', slaHours: 'sla_hours', warnBeforeHours: 'warn_before_hours',
    isActive: 'is_active', updatedBy: 'updated_by',
  };
  return {
    list: async () => (await pool.query('SELECT * FROM report_types ORDER BY name')).rows.map(map),
    findByCode: async (code) => map((await pool.query('SELECT * FROM report_types WHERE code = $1', [code])).rows[0]) ?? null,
    async create(data) {
      const { cols, ph, vals } = insertParts(COLUMNS, data);
      return map((await pool.query(`INSERT INTO report_types (${cols}) VALUES (${ph}) RETURNING *`, vals)).rows[0]);
    },
    async update(code, patch) {
      const { sets, vals } = setParts(COLUMNS, { ...patch, code: undefined }, [code]);
      sets.push('updated_at = now()');
      return map((await pool.query(`UPDATE report_types SET ${sets.join(', ')} WHERE code = $1 RETURNING *`, vals)).rows[0]) ?? null;
    },
  };
}
