const map = (r) => ({
  id: String(r.id), userId: r.user_id, email: r.email_attempted, event: r.event, ip: r.ip,
  country: r.country, city: r.city, userAgent: r.user_agent, createdAt: r.created_at,
});

export function createAccessLogsRepo(pool) {
  return {
    async create({ userId, email, event, ip, country, city, userAgent, createdAt }) {
      await pool.query(
        `INSERT INTO access_logs (user_id, email_attempted, event, ip, country, city, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, email, event, ip, country, city, userAgent, createdAt],
      );
    },

    async search({ userId, email, event, ip, from, to, limit, offset }) {
      const where = ['true'];
      const vals = [];
      const add = (sql, v) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
      if (userId) add('user_id = ?::uuid', userId);
      if (email) add('lower(email_attempted) LIKE ?', `%${email.replace(/[\\%_]/g, '\\$&')}%`);
      if (event) add('event = ?', event);
      if (ip) add('ip = ?', ip);
      if (from) add('created_at >= ?', from);
      if (to) add('created_at <= ?', to);
      const w = where.join(' AND ');
      const total = (await pool.query(`SELECT count(*)::int AS n FROM access_logs WHERE ${w}`, vals)).rows[0].n;
      vals.push(limit, offset);
      const { rows } = await pool.query(
        `SELECT * FROM access_logs WHERE ${w} ORDER BY created_at DESC, id DESC LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
        vals,
      );
      return { items: rows.map(map), total };
    },
  };
}
