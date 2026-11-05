/** Nunca exponer passwordHash ni datos internos. */
export const publicUser = (u, roleName) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  phone: u.phone ?? null,
  sector: u.sector ?? null,
  photoUrl: u.photoUrl ?? null,
  roleId: u.roleId,
  ...(roleName !== undefined ? { roleName } : {}),
  status: u.status,
  pendingInvitation: !u.passwordHash, // invitado que aún no define su contraseña
  blockedReason: u.blockedReason ?? null,
  blockedAt: u.blockedAt ?? null,
  lastLoginAt: u.lastLoginAt ?? null,
  profileUpdatedAt: u.profileUpdatedAt ?? null,
  createdAt: u.createdAt ?? null,
});

export const publicRole = (r) => ({
  id: r.id,
  code: r.code ?? null,
  name: r.name,
  description: r.description ?? '',
  dashboardPath: r.dashboardPath,
  isActive: r.isActive,
  isSystem: r.isSystem,
});
