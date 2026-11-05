import {
  ACTIONS,
  DASHBOARD_PATHS,
  MODULES,
  MODULE_KEYS,
  SUPER_ADMIN_CODE,
  buildPermissionMap,
  flagsToRow,
} from '../domain/permissions.js';
import { publicRole } from '../domain/serializers.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { optionalText, requireId, requireText } from '../lib/validate.js';

const NAME = { field: 'name', label: 'El nombre del rol', min: 3, max: 60 };
const DESCRIPTION = { field: 'description', label: 'La descripción', max: 300 };

function dashboardPathOrThrow(v) {
  if (!DASHBOARD_PATHS.includes(v)) {
    throw badRequest('invalid_dashboard', `El dashboard debe ser uno de: ${DASHBOARD_PATHS.join(', ')}.`);
  }
  return v;
}

/** HU-1.3 (roles) y HU-1.4 (permisos por módulo). */
export function createRolesService({ repos }) {
  async function getRole(id) {
    const role = await repos.roles.findById(requireId(id, 'El rol'));
    if (!role) throw notFound('role_not_found', 'Rol no encontrado.');
    return role;
  }

  const withCounts = async (role) => ({
    ...publicRole(role),
    userCount: await repos.users.countByRole(role.id),
    activeUserCount: await repos.users.countByRole(role.id, { onlyActive: true }),
  });

  async function getPermissions(id) {
    const role = await getRole(id);
    const map = buildPermissionMap(role, await repos.roles.getPermissions(role.id));
    return {
      role: publicRole(role),
      locked: role.code === SUPER_ADMIN_CODE,
      permissions: MODULES.map((m) => ({ module: m.key, label: m.label, ...map[m.key] })),
    };
  }

  return {
    async list() {
      const roles = await repos.roles.list();
      return Promise.all(roles.map(withCounts));
    },

    async get(id) {
      return withCounts(await getRole(id));
    },

    async create(body) {
      const name = requireText(body.name, NAME);
      if (await repos.roles.findByName(name)) throw conflict('role_name_taken', 'Ya existe un rol con ese nombre.');
      const role = await repos.roles.create({
        code: null,
        name,
        description: optionalText(body.description, DESCRIPTION) ?? '',
        dashboardPath: dashboardPathOrThrow(body.dashboardPath ?? '/inicio'),
        isActive: true,
        isSystem: false,
      });
      await repos.roles.setPermissions(role.id, MODULE_KEYS.map((m) => flagsToRow(m, {})));
      return withCounts(role);
    },

    async update(id, body) {
      const role = await getRole(id);
      const patch = {};
      if (body.description !== undefined) patch.description = optionalText(body.description, DESCRIPTION) ?? '';
      const touchesProtected = body.name !== undefined || body.isActive !== undefined || body.dashboardPath !== undefined;
      if (role.isSystem && touchesProtected) {
        throw conflict('role_is_system', 'Los roles del sistema solo permiten editar su descripción.');
      }
      if (body.name !== undefined) {
        patch.name = requireText(body.name, NAME);
        const dup = await repos.roles.findByName(patch.name);
        if (dup && dup.id !== role.id) throw conflict('role_name_taken', 'Ya existe un rol con ese nombre.');
      }
      if (body.dashboardPath !== undefined) patch.dashboardPath = dashboardPathOrThrow(body.dashboardPath);
      if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean') throw badRequest('invalid_is_active', 'isActive debe ser verdadero o falso.');
        // Solo se pueden desactivar roles sin usuarios activos ("roles no utilizados").
        if (body.isActive === false && (await repos.users.countByRole(role.id, { onlyActive: true })) > 0) {
          throw conflict('role_in_use', 'No puedes desactivar un rol que tiene usuarios activos.');
        }
        patch.isActive = body.isActive;
      }
      return withCounts(await repos.roles.update(role.id, patch));
    },

    /** No se elimina un rol asociado a usuarios ni un rol del sistema. */
    async remove(id) {
      const role = await getRole(id);
      if (role.isSystem) throw conflict('role_is_system', 'Los roles del sistema no se pueden eliminar.');
      const count = await repos.users.countByRole(role.id);
      if (count > 0) {
        throw conflict('role_in_use', `No puedes eliminar un rol asignado a ${count} usuario(s). Desactívalo o reasigna a los usuarios.`, { userCount: count });
      }
      await repos.roles.delete(role.id);
    },

    getPermissions,

    /** Reemplaza la matriz completa. Aplica de inmediato: los permisos se leen de BD en cada request. */
    async setPermissions(actor, id, body) {
      const role = await getRole(id);
      if (role.code === SUPER_ADMIN_CODE) {
        throw conflict('role_locked', 'Los permisos del Super Administrador no se pueden modificar.');
      }
      if (role.id === actor.role.id) {
        throw conflict('cannot_edit_own_role', 'No puedes modificar los permisos de tu propio rol.');
      }
      if (!Array.isArray(body.permissions)) throw badRequest('invalid_permissions', 'Se esperaba una lista de permisos.');
      const seen = new Set();
      const rows = [];
      for (const p of body.permissions) {
        if (!p || !MODULE_KEYS.includes(p.module)) throw badRequest('invalid_module', `Módulo desconocido: ${p?.module}.`);
        if (seen.has(p.module)) throw badRequest('duplicate_module', `Módulo repetido: ${p.module}.`);
        seen.add(p.module);
        for (const a of ACTIONS) {
          if (p[a] !== undefined && typeof p[a] !== 'boolean') {
            throw badRequest('invalid_permissions', `${p.module}.${a} debe ser verdadero o falso.`);
          }
        }
        rows.push(flagsToRow(p.module, p));
      }
      for (const m of MODULE_KEYS) if (!seen.has(m)) rows.push(flagsToRow(m, {}));
      await repos.roles.setPermissions(role.id, rows);
      return getPermissions(role.id);
    },
  };
}
