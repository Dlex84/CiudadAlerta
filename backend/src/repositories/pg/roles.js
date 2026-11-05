import { conflict } from '../../http/errors.js';

const COLUMNS = { name: 'name', description: 'description', dashboardPath: 'dashboard_path', isActive: 'is_active' };

const map = (r) =>
  r && {
    id: r.id, code: r.code, name: r.name, description: r.description, dashboardPath: r.dashboard_path,
    isActive: r.is_active, isSystem: r.is_system, createdAt: r.created_at, updatedAt: r.updated_at,
  };

export function createRolesRepo(pool) {
  const one = async (sql, params) => map((await pool.query(sql, params)).rows[0]) ?? null;
  return {
    list: async () => (await pool.query('SELECT * FROM roles ORDER BY id')).rows.map(map),
    findById: (id) => one('SELECT * FROM roles WHERE id = $1', [id]),
    findByCode: (code) => one('SELECT * FROM roles WHERE code = $1', [code]),
    findByName: (name) => one('SELECT * FROM roles WHERE lower(name) = lower($1)', [name]),

    async create({ code, name, description, dashboardPath, isActive, isSystem }) {
      try {
        return await one(
          `INSERT INTO roles (code, name, description, dashboard_path, is_active, is_system)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [code ?? null, name, description ?? '', dashboardPath, isActive, isSystem],
        );
      } catch (e) {
        if (e.code === '23505') throw conflict('role_name_taken', 'Ya existe un rol con ese nombre.');
        throw e;
      }
    },

    async update(id, patch) {
      const sets = [];
      const vals = [id];
      for (const [key, col] of Object.entries(COLUMNS)) {
        if (patch[key] !== undefined) { vals.push(patch[key]); sets.push(`${col} = $${vals.length}`); }
      }
      sets.push('updated_at = now()');
      try {
        return await one(`UPDATE roles SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
      } catch (e) {
        if (e.code === '23505') throw conflict('role_name_taken', 'Ya existe un rol con ese nombre.');
        throw e;
      }
    },

    async delete(id) {
      try {
        await pool.query('DELETE FROM roles WHERE id = $1', [id]);
      } catch (e) {
        if (e.code === '23503') throw conflict('role_in_use', 'El rol está asociado a usuarios.');
        throw e;
      }
    },

    async getPermissions(roleId) {
      const { rows } = await pool.query(
        'SELECT module, can_create, can_read, can_update, can_delete FROM role_permissions WHERE role_id = $1 ORDER BY module',
        [roleId],
      );
      return rows.map((r) => ({
        module: r.module, canCreate: r.can_create, canRead: r.can_read, canUpdate: r.can_update, canDelete: r.can_delete,
      }));
    },

    async setPermissions(roleId, rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
        for (const r of rows) {
          await client.query(
            `INSERT INTO role_permissions (role_id, module, can_create, can_read, can_update, can_delete)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [roleId, r.module, r.canCreate, r.canRead, r.canUpdate, r.canDelete],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
