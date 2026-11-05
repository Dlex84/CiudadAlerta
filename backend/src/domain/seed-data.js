import { flagsToRow, fromShorthand, MODULE_KEYS, SUPER_ADMIN_CODE } from './permissions.js';
import { hashPassword } from '../lib/passwords.js';
import { requireEmail, requirePassword, requireText } from '../lib/validate.js';

/**
 * Roles base de CiudadAlerta.
 * NOTA: el backlog original menciona roles de otro dominio (Agente Inmobiliario, Arquitecto,
 * Ingeniero, Cliente). Aquí se usan roles propios del proyecto; ver docs/preguntas-abiertas.md.
 * Permisos en notación C=crear R=consultar U=modificar D=eliminar.
 */
export const SYSTEM_ROLES = [
  {
    code: SUPER_ADMIN_CODE,
    name: 'Super Administrador',
    description: 'Control total de la plataforma. Sus permisos no se pueden modificar.',
    dashboardPath: '/admin',
    permissions: {},
  },
  {
    code: 'admin',
    name: 'Administrador',
    description: 'Gestiona usuarios y consulta roles y auditoría.',
    dashboardPath: '/admin',
    permissions: { usuarios: 'CRUD', roles: 'R', auditoria: 'R', reportes: 'CRUD' },
  },
  {
    code: 'supervisor',
    name: 'Supervisor',
    description: 'Da seguimiento a los reportes de la comunidad y consulta usuarios y auditoría.',
    dashboardPath: '/admin',
    permissions: { usuarios: 'R', auditoria: 'R', reportes: 'RU' },
  },
  {
    code: 'ciudadano',
    name: 'Ciudadano',
    description: 'Vecino que crea y consulta reportes de su comunidad.',
    dashboardPath: '/inicio',
    permissions: { reportes: 'CR' },
  },
];

export const rowsFromShorthand = (perms = {}) =>
  MODULE_KEYS.map((m) => flagsToRow(m, fromShorthand(perms[m] ?? '')));

/** Idempotente: crea los roles que falten y no toca los que ya existen. */
export async function seedSystemRoles(repos) {
  for (const def of SYSTEM_ROLES) {
    if (await repos.roles.findByCode(def.code)) continue;
    const role = await repos.roles.create({
      code: def.code,
      name: def.name,
      description: def.description,
      dashboardPath: def.dashboardPath,
      isActive: true,
      isSystem: true,
    });
    await repos.roles.setPermissions(role.id, rowsFromShorthand(def.permissions));
  }
}

/** Crea el primer Super Administrador si no existe ninguno. */
export async function seedSuperAdmin(repos, { name, email, password }) {
  if (!email || !password) return null;
  const role = await repos.roles.findByCode(SUPER_ADMIN_CODE);
  if (!role || (await repos.users.countByRole(role.id)) > 0) return null;
  return repos.users.create({
    fullName: requireText(name, { field: 'fullName', label: 'El nombre', min: 2, max: 120 }),
    email: requireEmail(email),
    passwordHash: await hashPassword(requirePassword(password)),
    roleId: role.id,
    status: 'active',
  });
}
