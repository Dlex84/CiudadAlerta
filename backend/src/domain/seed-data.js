import { flagsToRow, fromShorthand, MODULE_KEYS, SUPER_ADMIN_CODE } from './permissions.js';
import { hashPassword } from '../lib/passwords.js';
import { requireEmail, requirePassword, requireText } from '../lib/validate.js';
import { DEFAULT_APPROVAL_STEPS, REPORT_TYPES } from './operations.js';

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
    permissions: {
      usuarios: 'CRUD', roles: 'R', auditoria: 'R', reportes: 'CRUD',
      operaciones: 'RU', asignaciones: 'RU', aprobaciones: 'R', incidencias: 'CRUD',
      configuracion: 'RU', indicadores: 'CR', bitacora: 'R',
    },
  },
  {
    code: 'supervisor',
    name: 'Supervisor',
    description: 'Asigna responsables y aprueba o devuelve reportes.',
    dashboardPath: '/admin',
    permissions: {
      usuarios: 'R', auditoria: 'R', reportes: 'RU',
      operaciones: 'RU', asignaciones: 'RU', aprobaciones: 'RU', incidencias: 'CRU',
      configuracion: 'R', indicadores: 'CR', bitacora: 'R',
    },
  },
  {
    code: 'operador',
    name: 'Operador / Técnico',
    description: 'Atiende los reportes asignados y registra incidencias.',
    dashboardPath: '/admin',
    permissions: { operaciones: 'RU', asignaciones: 'R', aprobaciones: 'R', incidencias: 'CRU', indicadores: 'R' },
  },
  {
    code: 'gerente',
    name: 'Gerente',
    description: 'Consulta el panel y genera reportes operativos.',
    dashboardPath: '/admin',
    permissions: {
      operaciones: 'R', asignaciones: 'R', aprobaciones: 'R', incidencias: 'R',
      configuracion: 'R', indicadores: 'CR', bitacora: 'R',
    },
  },
  {
    code: 'auditor',
    name: 'Auditor',
    description: 'Consulta la bitácora de cambios y la auditoría de accesos.',
    dashboardPath: '/admin',
    permissions: {
      auditoria: 'R', operaciones: 'R', asignaciones: 'R', aprobaciones: 'R', incidencias: 'R',
      configuracion: 'R', indicadores: 'R', bitacora: 'R',
    },
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

/**
 * Idempotente: crea los roles que falten. En los roles del sistema que ya existen solo completa los
 * módulos que aún no tienen fila (p. ej. los de la Épica 2); nunca pisa lo que editó un administrador.
 */
export async function seedSystemRoles(repos) {
  for (const def of SYSTEM_ROLES) {
    const existing = await repos.roles.findByCode(def.code);
    if (existing) {
      const rows = await repos.roles.getPermissions(existing.id);
      const have = new Set(rows.map((r) => r.module));
      const missing = rowsFromShorthand(def.permissions).filter((r) => !have.has(r.module));
      if (missing.length) await repos.roles.setPermissions(existing.id, [...rows, ...missing]);
      continue;
    }
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

/** Épica 2: tipos de reporte con su plazo y su paso de aprobación por defecto. Idempotente. */
export async function seedOperationsCatalog(repos) {
  for (const t of REPORT_TYPES) {
    if (await repos.reportTypes.findByCode(t.code)) continue;
    await repos.reportTypes.create({ ...t, isActive: true });
    await repos.approvalSteps.replaceForType(
      t.code,
      DEFAULT_APPROVAL_STEPS.map((s, i) => ({ ...s, stepOrder: i + 1 })),
    );
  }
}
