import { inviteEmail } from '../adapters/mail-templates.js';
import { CITIZEN_ROLE_CODE, SUPER_ADMIN_CODE } from '../domain/permissions.js';
import { publicUser } from '../domain/serializers.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { hashPassword } from '../lib/passwords.js';
import { randomToken, sha256, isUuid } from '../lib/tokens.js';
import {
  intInRange,
  optionalPhone,
  optionalText,
  requireEmail,
  requireId,
  requirePassword,
  requireText,
} from '../lib/validate.js';

const NAME = { field: 'fullName', label: 'El nombre completo', min: 2, max: 120 };
const SECTOR = { field: 'sector', label: 'El sector', max: 120 };
const EMAIL_TAKEN = 'Ya existe un usuario con ese correo electrónico.';

/** HU-1.2 (alta por administrador), HU-1.6 (bloqueo) y registro ciudadano. */
export function createUsersService({ repos, mailer, config, clock = () => new Date() }) {
  const isSuper = (actor) => actor.role.code === SUPER_ADMIN_CODE;

  // Solo un Super Administrador puede tocar a otros Super Administradores (evita escalada de privilegios).
  function assertCanUseRole(actor, role) {
    if (role.code === SUPER_ADMIN_CODE && !isSuper(actor)) {
      throw forbidden('super_admin_required', 'Solo un Super Administrador puede gestionar ese rol.');
    }
  }

  async function activeRoleOrThrow(roleId) {
    const role = await repos.roles.findById(requireId(roleId, 'El rol'));
    if (!role || !role.isActive) throw badRequest('invalid_role', 'El rol seleccionado no existe o está inactivo.');
    return role;
  }

  async function getTarget(id) {
    const user = isUuid(id) ? await repos.users.findById(id) : null;
    if (!user) throw notFound('user_not_found', 'Usuario no encontrado.');
    const role = await repos.roles.findById(user.roleId);
    return { user, role };
  }

  async function sendInvitation(user) {
    const raw = randomToken();
    await repos.resetTokens.invalidateAllForUser(user.id);
    await repos.resetTokens.create({
      userId: user.id,
      tokenHash: sha256(raw),
      purpose: 'invite',
      expiresAt: new Date(clock().getTime() + config.inviteTtlHours * 3_600_000),
    });
    const link = `${config.appUrl}/#/restablecer?token=${raw}&invitacion=1`;
    try {
      await mailer.send({
        to: user.email,
        ...inviteEmail({ name: user.fullName, link, hours: config.inviteTtlHours }),
      });
      return true;
    } catch (err) {
      console.error('No se pudo enviar la invitación:', err);
      return false;
    }
  }

  return {
    async list(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 20, min: 1, max: 100 });
      const status = ['active', 'blocked'].includes(query.status) ? query.status : null;
      const roleId = query.roleId ? requireId(query.roleId, 'El rol') : null;
      const q = query.q ? String(query.q).trim().slice(0, 100) : null;
      const { items, total } = await repos.users.list({ q, status, roleId, limit, offset: (page - 1) * limit });
      const roles = new Map((await repos.roles.list()).map((r) => [r.id, r.name]));
      return { items: items.map((u) => publicUser(u, roles.get(u.roleId))), total, page, limit };
    },

    async get(id) {
      const { user, role } = await getTarget(id);
      return publicUser(user, role?.name);
    },

    /** HU-1.2. El usuario nace Activo, sin contraseña: recibe un enlace para definirla. */
    async create(actor, body) {
      const fullName = requireText(body.fullName, NAME);
      const email = requireEmail(body.email);
      const phone = optionalPhone(body.phone);
      const sector = optionalText(body.sector, SECTOR);
      const role = await activeRoleOrThrow(body.roleId);
      assertCanUseRole(actor, role);
      if (await repos.users.findByEmail(email)) throw conflict('email_taken', EMAIL_TAKEN);
      const user = await repos.users.create({
        fullName,
        email,
        phone,
        sector,
        roleId: role.id,
        status: 'active',
        passwordHash: null,
        createdBy: actor.user.id,
      });
      const invitationSent = await sendInvitation(user);
      return { user: publicUser(user, role.name), invitationSent };
    },

    async resendInvitation(actor, id) {
      const { user, role } = await getTarget(id);
      assertCanUseRole(actor, role);
      if (user.passwordHash) throw conflict('already_activated', 'El usuario ya definió su contraseña.');
      return { invitationSent: await sendInvitation(user) };
    },

    /** Registro público de ciudadanos (pantalla "Crear cuenta" del prototipo). */
    async register(body) {
      if (body.acceptTerms !== true) {
        throw badRequest('terms_not_accepted', 'Debes aceptar los términos y la política de privacidad.');
      }
      const fullName = requireText(body.fullName, NAME);
      const email = requireEmail(body.email);
      const password = requirePassword(body.password);
      const sector = optionalText(body.sector, SECTOR);
      const phone = optionalPhone(body.phone);
      const role = await repos.roles.findByCode(CITIZEN_ROLE_CODE);
      if (!role || !role.isActive) {
        throw new AppError(503, 'registration_unavailable', 'El registro no está disponible por ahora.');
      }
      if (await repos.users.findByEmail(email)) throw conflict('email_taken', EMAIL_TAKEN);
      const user = await repos.users.create({
        fullName,
        email,
        phone,
        sector,
        roleId: role.id,
        status: 'active',
        passwordHash: await hashPassword(password),
      });
      return publicUser(user, role.name);
    },

    async update(actor, id, body) {
      const { user, role } = await getTarget(id);
      assertCanUseRole(actor, role);
      const patch = {};
      if (body.fullName !== undefined) patch.fullName = requireText(body.fullName, NAME);
      if (body.phone !== undefined) patch.phone = optionalPhone(body.phone);
      if (body.sector !== undefined) patch.sector = optionalText(body.sector, SECTOR);
      let roleName = role?.name;
      if (body.roleId !== undefined && Number(body.roleId) !== user.roleId) {
        if (user.id === actor.user.id) {
          throw badRequest('cannot_change_own_role', 'No puedes cambiar tu propio rol.');
        }
        const newRole = await activeRoleOrThrow(body.roleId);
        assertCanUseRole(actor, newRole);
        patch.roleId = newRole.id;
        roleName = newRole.name;
      }
      const updated = await repos.users.update(user.id, patch);
      return publicUser(updated, roleName);
    },

    /** HU-1.6: bloqueo temporal con motivo obligatorio; cierra las sesiones activas. */
    async block(actor, id, { reason } = {}) {
      const { user, role } = await getTarget(id);
      if (user.id === actor.user.id) throw badRequest('cannot_block_self', 'No puedes bloquearte a ti mismo.');
      assertCanUseRole(actor, role);
      if (user.status === 'blocked') throw conflict('already_blocked', 'El usuario ya está bloqueado.');
      const cleanReason = requireText(reason, { field: 'reason', label: 'El motivo del bloqueo', min: 3, max: 500 });
      const updated = await repos.users.update(user.id, {
        status: 'blocked',
        blockedReason: cleanReason,
        blockedAt: clock(),
        blockedBy: actor.user.id,
      });
      await repos.sessions.revokeAllForUser(user.id);
      return publicUser(updated, role?.name);
    },

    async unblock(actor, id) {
      const { user, role } = await getTarget(id);
      assertCanUseRole(actor, role);
      if (user.status !== 'blocked') throw conflict('not_blocked', 'El usuario no está bloqueado.');
      const updated = await repos.users.update(user.id, {
        status: 'active',
        blockedReason: null,
        blockedAt: null,
        blockedBy: null,
      });
      return publicUser(updated, role?.name);
    },

    /** Eliminación lógica: conserva la trazabilidad y libera el correo. */
    async remove(actor, id) {
      const { user, role } = await getTarget(id);
      if (user.id === actor.user.id) throw badRequest('cannot_delete_self', 'No puedes eliminar tu propia cuenta.');
      assertCanUseRole(actor, role);
      await repos.users.update(user.id, { deletedAt: clock() });
      await repos.sessions.revokeAllForUser(user.id);
      await repos.resetTokens.invalidateAllForUser(user.id);
    },
  };
}
