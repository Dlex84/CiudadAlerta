// HU-2.8: bitácora de cambios. Solo append() y search(): no hay update ni delete (y la BD los bloquea).
import { whereBuilder } from './where.js';

const map = (r) => ({
  id: String(r.id), actorId: r.actor_id, actorName: r.actor_name, entity: r.entity, entityId: r.entity_id,
  reportId: r.report_id, action: r.action, result: r.result, oldValues: r.old_values, newValues: r.new_values,
  createdAt: r.created_at,
});

export function createChangeLogRepo(pool) {
  return {
    async append({ actorId, actorName, entity, entityId, reportId, action, result, oldValues, newValues, createdAt }) {
      await pool.query(
        `INSERT INTO change_log (actor_id, actor_name, entity, entity_id, report_id, action, result, old_values, new_values, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          actorId ?? null, actorName ?? null, entity, entityId ?? null, reportId ?? null, action, result,
          oldValues == null ? null : JSON.stringify(oldValues),
          newValues == null ? null : JSON.stringify(newValues),
          createdAt,
        ],
      );
    },
    async search(f) {
      const w = whereBuilder();
      if (f.reportId) w.add('report_id = ?::uuid', f.reportId);
      if (f.actorId) w.add('actor_id = ?::uuid', f.actorId);
      if (f.entity) w.add('entity = ?', f.entity);
      if (f.action) w.add('action = ?', f.action);
      if (f.result) w.add('result = ?', f.result);
      if (f.from) w.add('created_at >= ?', f.from);
      if (f.to) w.add('created_at <= ?', f.to);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM change_log WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = w.page(f.limit, f.offset);
      const { rows } = await pool.query(`SELECT * FROM change_log WHERE ${w.sql} ORDER BY created_at DESC, id DESC ${page}`, w.vals);
      return { items: rows.map(map), total };
    },
  };
}
