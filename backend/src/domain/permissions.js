// Módulos protegidos por permisos. "reportes" queda reservado para la Épica 2.
export const MODULES = [
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'roles', label: 'Roles' },
  { key: 'permisos', label: 'Permisos' },
  { key: 'auditoria', label: 'Auditoría de accesos' },
  { key: 'reportes', label: 'Reportes ciudadanos' },
];
export const MODULE_KEYS = MODULES.map((m) => m.key);
export const ACTIONS = ['create', 'read', 'update', 'delete'];

export const SUPER_ADMIN_CODE = 'super_admin';
export const CITIZEN_ROLE_CODE = 'ciudadano';

/** Rutas de dashboard que el frontend sabe renderizar (HU-1.1: redirección por rol). */
export const DASHBOARD_PATHS = ['/inicio', '/admin'];

const toFlags = (c = false, r = false, u = false, d = false) => ({
  create: c,
  read: r,
  update: u,
  delete: d,
});

export const emptyPermission = () => toFlags();

/** 'CRU' -> { create:true, read:true, update:true, delete:false } */
export function fromShorthand(s = '') {
  const up = s.toUpperCase();
  return toFlags(up.includes('C'), up.includes('R'), up.includes('U'), up.includes('D'));
}

/** Fila de BD -> flags de la API. */
export const rowToFlags = (row) =>
  toFlags(row.canCreate, row.canRead, row.canUpdate, row.canDelete);

/** Flags de la API -> fila de BD. */
export const flagsToRow = (module, f) => ({
  module,
  canCreate: !!f.create,
  canRead: !!f.read,
  canUpdate: !!f.update,
  canDelete: !!f.delete,
});

/** Mapa { modulo: {create,read,update,delete} } para TODOS los módulos. El super admin lo tiene todo. */
export function buildPermissionMap(role, rows = []) {
  const map = {};
  const byModule = new Map(rows.map((r) => [r.module, r]));
  for (const key of MODULE_KEYS) {
    if (role?.code === SUPER_ADMIN_CODE) map[key] = toFlags(true, true, true, true);
    else map[key] = byModule.has(key) ? rowToFlags(byModule.get(key)) : emptyPermission();
  }
  return map;
}

export const can = (permissionMap, module, action) => Boolean(permissionMap?.[module]?.[action]);
