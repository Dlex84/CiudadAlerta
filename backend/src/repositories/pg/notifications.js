// HU-2.3 / HU-2.5: notificaciones en la app y registro de envíos de alertas.
import { whereBuilder } from './where.js';

export function createNotificationsRepo(pool) {
  const map = (r) => ({
    id: String(r.id), userId: r.user_id, kind: r.kind, title: r.title, body: r.body,
    reportId: r.report_id, readAt: r.read_at, createdAt: r.created_at,
  });
  return {
    async create({ userId, kind, title, body, reportId, createdAt }) {
      const { rows } = await pool.query(
        `INSERT INTO notifications (user_id, kind, title, body, report_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, kind, title, body ?? '', reportId ?? null, createdAt],
      );
      return map(rows[0]);
    },
    async listByUser(userId, { unreadOnly = false, limit, offset }) {
      const w = whereBuilder();
      w.add('user_id = ?::uuid', userId);
      if (unreadOnly) w.add('read_at IS NULL');
      const total = (await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE ${w.sql}`, w.vals)).rows[0].n;
      const unread = (await pool.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId])).rows[0].n;
      const page = w.page(limit, offset);
      const { rows } = await pool.query(`SELECT * FROM notifications WHERE ${w.sql} ORDER BY created_at DESC, id DESC ${page}`, w.vals);
      return { items: rows.map(map), total, unread };
    },
    async markRead(userId, id, at) {
      if (!/^\d+$/.test(String(id))) return false;
      const { rowCount } = await pool.query(
        'UPDATE notifications SET read_at = COALESCE(read_at, $3) WHERE id = $1 AND user_id = $2',
        [id, userId, at],
      );
      return rowCount > 0;
    },
    async markAllRead(userId, at) {
      await pool.query('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [userId, at]);
    },
  };
}

export function createAlertDeliveriesRepo(pool) {
  const map = (r) => ({
    id: String(r.id), reportId: r.report_id, userId: r.user_id, kind: r.kind, channel: r.channel,
    status: r.status, error: r.error, createdAt: r.created_at,
  });
  return {
    async create({ reportId, userId, kind, channel, status, error, createdAt }) {
      await pool.query(
        `INSERT INTO alert_deliveries (report_id, user_id, kind, channel, status, error, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [reportId, userId ?? null, kind, channel, status, error ?? null, createdAt],
      );
    },
    /** Fecha del último envío exitoso de esa alerta a ese usuario (para no repetirla). */
    async lastSentAt({ reportId, userId, kind }) {
      const { rows } = await pool.query(
        `SELECT max(created_at) AS at FROM alert_deliveries
          WHERE report_id = $1 AND user_id = $2 AND kind = $3 AND status = 'sent'`,
        [reportId, userId, kind],
      );
      return rows[0]?.at ?? null;
    },
    async list(f) {
      const w = whereBuilder();
      if (f.reportId) w.add('report_id = ?::uuid', f.reportId);
      if (f.kind) w.add('kind = ?', f.kind);
      if (f.status) w.add('status = ?', f.status);
      if (f.from) w.add('created_at >= ?', f.from);
      if (f.to) w.add('created_at <= ?', f.to);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM alert_deliveries WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = w.page(f.limit, f.offset);
      const { rows } = await pool.query(`SELECT * FROM alert_deliveries WHERE ${w.sql} ORDER BY created_at DESC, id DESC ${page}`, w.vals);
      return { items: rows.map(map), total };
    },
  };
}
