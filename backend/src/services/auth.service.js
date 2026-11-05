import { resetEmail } from '../adapters/mail-templates.js';
import { buildPermissionMap } from '../domain/permissions.js';
import { publicRole, publicUser } from '../domain/serializers.js';
import { badRequest, forbidden, unauthorized } from '../http/errors.js';
import { dummyHash, hashPassword, verifyPassword } from '../lib/passwords.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { normalizeEmail, requirePassword } from '../lib/validate.js';

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';
const INVALID_TOKEN = 'El enlace no es válido o ya expiró. Solicita uno nuevo.';

/** HU-1.1 (login/sesión) y HU-1.5 (recuperación de contraseña). */
export function createAuthService({ repos, mailer, config, audit, clock = () => new Date() }) {
  async function buildPrincipal(user, sessionId) {
    const role = await repos.roles.findById(user.roleId);
    if (!role || !role.isActive) return null;
    const rows = await repos.roles.getPermissions(role.id);
    return { user, role, permissions: buildPermissionMap(role, rows), sessionId };
  }

  return {
    async login({ email, password, ip = null, userAgent = null }) {
      const normalized = normalizeEmail(email);
      const log = (event, userId = null) =>
        audit.record({ userId, email: normalized || null, event, ip, userAgent });

      if (!normalized || typeof password !== 'string' || !password || password.length > 128) {
        await log('login_failed');
        throw unauthorized('invalid_credentials', INVALID_CREDENTIALS);
      }

      const user = await repos.users.findByEmail(normalized);
      // Siempre se verifica un hash, exista o no el usuario, para no filtrar información por tiempo.
      const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
      if (!user || !user.passwordHash || !valid) {
        await log('login_failed', user?.id ?? null);
        throw unauthorized('invalid_credentials', INVALID_CREDENTIALS);
      }
      if (user.status === 'blocked') {
        await log('login_blocked', user.id);
        throw forbidden('user_blocked', 'Tu cuenta está bloqueada. Contacta al administrador.');
      }
      const role = await repos.roles.findById(user.roleId);
      if (!role || !role.isActive) {
        await log('login_blocked', user.id);
        throw forbidden('role_inactive', 'Tu rol no está activo. Contacta al administrador.');
      }

      const now = clock();
      const token = randomToken();
      const expiresAt = new Date(now.getTime() + config.sessionTtlHours * 3_600_000);
      await repos.sessions.create({
        userId: user.id,
        tokenHash: sha256(token), // en BD solo se guarda el hash del token
        ip,
        userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
        expiresAt,
      });
      await repos.users.update(user.id, { lastLoginAt: now });
      await log('login_success', user.id);

      const rows = await repos.roles.getPermissions(role.id);
      return {
        token,
        expiresAt,
        user: publicUser({ ...user, lastLoginAt: now }),
        role: publicRole(role),
        permissions: buildPermissionMap(role, rows),
        redirectTo: role.dashboardPath,
      };
    },

    async logout(principal, { ip = null, userAgent = null } = {}) {
      await repos.sessions.revoke(principal.sessionId);
      await audit.record({
        userId: principal.user.id,
        email: principal.user.email,
        event: 'logout',
        ip,
        userAgent,
      });
    },

    /** Devuelve el "principal" (usuario + rol + permisos) o null. Se evalúa en cada request. */
    async authenticate(token) {
      if (!token) return null;
      const session = await repos.sessions.findByTokenHash(sha256(token));
      if (!session || session.revokedAt || session.expiresAt <= clock()) return null;
      const user = await repos.users.findById(session.userId);
      if (!user || user.status !== 'active') return null;
      return buildPrincipal(user, session.id);
    },

    /** Respuesta idéntica exista o no el correo (no revela qué correos están registrados). */
    async requestPasswordReset({ email }) {
      const normalized = normalizeEmail(email);
      if (!normalized) return;
      const user = await repos.users.findByEmail(normalized);
      if (!user || user.status !== 'active') return;
      const raw = randomToken();
      await repos.resetTokens.invalidateAllForUser(user.id); // el enlace anterior deja de servir
      await repos.resetTokens.create({
        userId: user.id,
        tokenHash: sha256(raw),
        purpose: 'reset',
        expiresAt: new Date(clock().getTime() + config.passwordResetTtlMinutes * 60_000),
      });
      const link = `${config.appUrl}/#/restablecer?token=${raw}`;
      try {
        await mailer.send({
          to: user.email,
          ...resetEmail({ name: user.fullName, link, minutes: config.passwordResetTtlMinutes }),
        });
      } catch (err) {
        console.error('No se pudo enviar el correo de recuperación:', err);
      }
    },

    async resetPassword({ token, password }) {
      const newPassword = requirePassword(password);
      const record =
        typeof token === 'string' && token ? await repos.resetTokens.findByTokenHash(sha256(token)) : null;
      if (!record || record.usedAt || record.expiresAt <= clock()) {
        throw badRequest('invalid_or_expired_token', INVALID_TOKEN);
      }
      const user = await repos.users.findById(record.userId);
      if (!user) throw badRequest('invalid_or_expired_token', INVALID_TOKEN);
      // markUsed es atómico: si dos solicitudes llegan a la vez, solo una gana.
      if (!(await repos.resetTokens.markUsed(record.id))) {
        throw badRequest('invalid_or_expired_token', INVALID_TOKEN);
      }
      await repos.users.update(user.id, { passwordHash: await hashPassword(newPassword) });
      await repos.resetTokens.invalidateAllForUser(user.id);
      await repos.sessions.revokeAllForUser(user.id);
    },
  };
}
