// HU-2.6: incidencias operativas y su historial.
import { setParts, whereBuilder } from './where.js';

const map = (r) =>
  r && {
    id: String(r.id), reportId: r.report_id, category: r.category, description: r.description,
    priority: r.priority, status: r.status, assigneeId: r.assignee_id, resolution: r.resolution,
    createdBy: r.created_by, resolvedAt: r.resolved_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };

const COLUMNS = {
  status: 'status', priority: 'priority', assigneeId: 'assignee_id', resolution: 'resolution',
  resolvedAt: 'resolved_at', updatedAt: 'updated_at',
};

export function createIncidentsRepo(pool) {
  const one = async (sql, vals) => map((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    async create({ reportId, category, description, priority, status, assigneeId, createdBy, createdAt }) {
      return one(
        `INSERT INTO incidents (report_id, category, description, priority, status, assignee_id, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *`,
        [reportId, category, description, priority, status, assigneeId ?? null, createdBy, createdAt],
      );
    },
    findById: (id) => (/^\d+$/.test(String(id)) ? one('SELECT * FROM incidents WHERE id = $1', [id]) : null),

    async list(f) {
      const w = whereBuilder();
      if (f.reportId) w.add('report_id = ?::uuid', f.reportId);
      if (f.statuses?.length) w.add('status = ANY(?::text[])', f.statuses);
      if (f.priority) w.add('priority = ?', f.priority);
      if (f.category) w.add('category = ?', f.category);
      if (f.assigneeId) w.add('assignee_id = ?::uuid', f.assigneeId);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM incidents WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = w.page(f.limit, f.offset);
      const { rows } = await pool.query(`SELECT * FROM incidents WHERE ${w.sql} ORDER BY created_at DESC, id DESC ${page}`, w.vals);
      return { items: rows.map(map), total };
    },

    async update(id, patch, { expectedStatus } = {}) {
      const { sets, vals } = setParts(COLUMNS, patch, [id]);
      if (patch.updatedAt === undefined) sets.push('updated_at = now()');
      let guard = '';
      if (expectedStatus) { vals.push(expectedStatus); guard = ` AND status = $${vals.length}`; }
      return one(`UPDATE incidents SET ${sets.join(', ')} WHERE id = $1${guard} RETURNING *`, vals);
    },
  };
}

export function createIncidentEventsRepo(pool) {
  const mapE = (r) => ({
    id: String(r.id), incidentId: String(r.incident_id), kind: r.kind, fromValue: r.from_value, toValue: r.to_value,
    comment: r.comment, actorId: r.actor_id, createdAt: r.created_at,
  });
  return {
    async add({ incidentId, kind, fromValue, toValue, comment, actorId, createdAt }) {
      await pool.query(
        `INSERT INTO incident_events (incident_id, kind, from_value, to_value, comment, actor_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [incidentId, kind, fromValue ?? null, toValue ?? null, comment ?? null, actorId ?? null, createdAt],
      );
    },
    async listByIncident(incidentId) {
      const { rows } = await pool.query('SELECT * FROM incident_events WHERE incident_id = $1 ORDER BY created_at, id', [incidentId]);
      return rows.map(mapE);
    },
  };
}
