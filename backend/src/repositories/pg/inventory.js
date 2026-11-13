// Épica 3: recursos (catálogo y existencia) y movimientos de inventario.
import { isUuid } from '../../lib/tokens.js';
import { likeEscape, setParts, whereBuilder } from './where.js';

const mapR = (r) =>
  r && {
    id: r.id, code: r.code, name: r.name, kind: r.kind, unit: r.unit, stock: r.stock, minStock: r.min_stock,
    location: r.location, isActive: r.is_active, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };

const mapM = (r) =>
  r && {
    id: String(r.id), resourceId: r.resource_id, type: r.type, quantity: r.quantity, balanceAfter: r.balance_after,
    reportId: r.report_id, assigneeId: r.assignee_id, reason: r.reason, actorId: r.actor_id, createdAt: r.created_at,
  };

const COLUMNS = { name: 'name', unit: 'unit', minStock: 'min_stock', location: 'location', isActive: 'is_active', updatedAt: 'updated_at' };

export function createResourcesRepo(pool) {
  const one = async (sql, vals) => mapR((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    async create({ name, kind, unit, minStock, location, createdBy, createdAt }) {
      return one(
        `INSERT INTO resources (code, name, kind, unit, min_stock, location, created_by, created_at, updated_at)
         VALUES ('REC-' || lpad(nextval('resource_code_seq')::text, 4, '0'), $1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
        [name, kind, unit, minStock, location ?? null, createdBy, createdAt],
      );
    },
    findById: (id) =>
      isUuid(String(id))
        ? one('SELECT * FROM resources WHERE id = $1', [id])
        : one('SELECT * FROM resources WHERE code = upper($1)', [String(id)]),
    findByName: (name) => one('SELECT * FROM resources WHERE lower(name) = lower($1)', [name]),

    async list(f = {}) {
      const w = whereBuilder();
      if (f.q) w.add("(name ILIKE ? ESCAPE '\\' OR code ILIKE ? ESCAPE '\\')", likeEscape(f.q), likeEscape(f.q));
      if (f.kind) w.add('kind = ?', f.kind);
      if (f.active !== undefined) w.add('is_active = ?', f.active);
      if (f.low) w.add('stock <= min_stock');
      const total = (await pool.query(`SELECT count(*)::int AS n FROM resources WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = f.limit ? w.page(f.limit, f.offset ?? 0) : '';
      const { rows } = await pool.query(`SELECT * FROM resources WHERE ${w.sql} ORDER BY name ${page}`, w.vals);
      return { items: rows.map(mapR), total };
    },

    async update(id, patch) {
      const { sets, vals } = setParts(COLUMNS, patch, [id]);
      if (patch.updatedAt === undefined) sets.push('updated_at = now()');
      return one(`UPDATE resources SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
    },

    /**
     * Aplica un movimiento de forma atómica: en UNA sentencia actualiza la existencia solo si no queda
     * negativa y registra el movimiento con el saldo resultante. Devuelve null si no hay existencia suficiente.
     */
    async applyMovement({ resourceId, delta, type, quantity, reportId, assigneeId, reason, actorId, createdAt }) {
      const { rows } = await pool.query(
        `WITH upd AS (
           UPDATE resources SET stock = stock + $2, updated_at = $9
           WHERE id = $1 AND stock + $2 >= 0
           RETURNING id, stock
         )
         INSERT INTO inventory_movements (resource_id, type, quantity, balance_after, report_id, assignee_id, reason, actor_id, created_at)
         SELECT upd.id, $3, $4, upd.stock, $5, $6, $7, $8, $9 FROM upd
         RETURNING *`,
        [resourceId, delta, type, quantity, reportId ?? null, assigneeId ?? null, reason ?? null, actorId, createdAt],
      );
      return mapM(rows[0]) ?? null;
    },
  };
}

export function createMovementsRepo(pool) {
  const filters = (f) => {
    const w = whereBuilder();
    if (f.resourceId) w.add('resource_id = ?::uuid', f.resourceId);
    if (f.type) w.add('type = ?', f.type);
    if (f.reportId) w.add('report_id = ?::uuid', f.reportId);
    if (f.actorId) w.add('actor_id = ?::uuid', f.actorId);
    if (f.from) w.add('created_at >= ?', f.from);
    if (f.to) w.add('created_at <= ?', f.to);
    return w;
  };
  return {
    async list(f = {}) {
      const w = filters(f);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM inventory_movements WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = f.limit ? w.page(f.limit, f.offset ?? 0) : '';
      const { rows } = await pool.query(`SELECT * FROM inventory_movements WHERE ${w.sql} ORDER BY created_at DESC, id DESC ${page}`, w.vals);
      return { items: rows.map(mapM), total };
    },

    /** Equipos aún en manos de cada persona: asignado − devuelto. */
    async outstanding(resourceId) {
      const { rows } = await pool.query(
        `SELECT assignee_id,
                sum(CASE WHEN type = 'asignacion' THEN quantity ELSE -quantity END)::int AS quantity
         FROM inventory_movements
         WHERE resource_id = $1 AND type IN ('asignacion', 'devolucion') AND assignee_id IS NOT NULL
         GROUP BY assignee_id HAVING sum(CASE WHEN type = 'asignacion' THEN quantity ELSE -quantity END) > 0`,
        [resourceId],
      );
      return rows.map((r) => ({ assigneeId: r.assignee_id, quantity: r.quantity }));
    },

    /** Totales por recurso y tipo dentro del periodo (reporte de movimientos). */
    async totals(f = {}) {
      const w = filters(f);
      const { rows } = await pool.query(
        `SELECT resource_id, type, sum(quantity)::int AS quantity, count(*)::int AS n
         FROM inventory_movements WHERE ${w.sql} GROUP BY resource_id, type`,
        w.vals,
      );
      return rows.map((r) => ({ resourceId: r.resource_id, type: r.type, quantity: r.quantity, count: r.n }));
    },
  };
}
