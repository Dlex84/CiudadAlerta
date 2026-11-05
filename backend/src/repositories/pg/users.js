import { conflict } from '../../http/errors.js';

const COLUMNS = {
  fullName: 'full_name', email: 'email', phone: 'phone', sector: 'sector', photoUrl: 'photo_url',
  passwordHash: 'password_hash', roleId: 'role_id', status: 'status', blockedReason: 'blocked_reason',
  blockedAt: 'blocked_at', blockedBy: 'blocked_by', lastLoginAt: 'last_login_at',
  profileUpdatedAt: 'profile_updated_at', createdBy: 'created_by', deletedAt: 'deleted_at',
};

const map = (r) =>
  r && {
    id: r.id, fullName: r.full_name, email: r.email, phone: r.phone, sector: r.sector,
    photoUrl: r.photo_url, passwordHash: r.password_hash, roleId: r.role_id, status: r.status,
    blockedReason: r.blocked_reason, blockedAt: r.blocked_at, blockedBy: r.blocked_by,
    lastLoginAt: r.last_login_at, profileUpdatedAt: r.profile_updated_at, createdBy: r.created_by,
    deletedAt: r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };

const translate = (e) =>
  e.code === '23505' ? conflict('email_taken', 'Ya existe un usuario con ese correo electrónico.') : e;

export function createUsersRepo(pool) {
  return {
    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
      return map(rows[0]) ?? null;
    },

    async findByEmail(email) {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
        [email],
      );
      return map(rows[0]) ?? null;
    },

    async list({ q, status, roleId, limit, offset }) {
      const where = ['deleted_at IS NULL'];
      const vals = [];
      if (q) {
        vals.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
        where.push(`(full_name ILIKE $${vals.length} OR email ILIKE $${vals.length})`);
      }
      if (status) { vals.push(status); where.push(`status = $${vals.length}`); }
      if (roleId) { vals.push(roleId); where.push(`role_id = $${vals.length}`); }
      const w = where.join(' AND ');
      const total = (await pool.query(`SELECT count(*)::int AS n FROM users WHERE ${w}`, vals)).rows[0].n;
      vals.push(limit, offset);
      const { rows } = await pool.query(
        `SELECT * FROM users WHERE ${w} ORDER BY created_at DESC, id LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
        vals,
      );
      return { items: rows.map(map), total };
    },

    async create(data) {
      const cols = [];
      const vals = [];
      for (const [key, col] of Object.entries(COLUMNS)) {
        if (data[key] !== undefined) { cols.push(col); vals.push(data[key]); }
      }
      const ph = vals.map((_, i) => `$${i + 1}`).join(', ');
      try {
        const { rows } = await pool.query(`INSERT INTO users (${cols.join(', ')}) VALUES (${ph}) RETURNING *`, vals);
        return map(rows[0]);
      } catch (e) {
        throw translate(e);
      }
    },

    async update(id, patch) {
      const sets = [];
      const vals = [id];
      for (const [key, col] of Object.entries(COLUMNS)) {
        if (patch[key] !== undefined) { vals.push(patch[key]); sets.push(`${col} = $${vals.length}`); }
      }
      sets.push('updated_at = now()');
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        vals,
      );
      return map(rows[0]) ?? null;
    },

    async countByRole(roleId, { onlyActive = false } = {}) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM users WHERE role_id = $1 AND deleted_at IS NULL ${onlyActive ? "AND status = 'active'" : ''}`,
        [roleId],
      );
      return rows[0].n;
    },
  };
}
