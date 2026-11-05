import { publicRole, publicUser } from '../domain/serializers.js';
import { AppError, badRequest, unauthorized } from '../http/errors.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { optionalPhone, optionalText, requirePassword, requireText } from '../lib/validate.js';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Detecta el tipo real por los primeros bytes (no confía en el Content-Type del cliente). */
export function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg' };
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp' };
  return null;
}

/** HU-1.7: administración del perfil propio. */
export function createProfileService({ repos, avatars, clock = () => new Date() }) {
  const me = (principal, user = principal.user) => ({
    user: publicUser(user, principal.role.name),
    role: publicRole(principal.role),
    permissions: principal.permissions,
    redirectTo: principal.role.dashboardPath,
  });

  return {
    getMe: (principal) => me(principal),

    async updateMe(principal, body) {
      const patch = {};
      if (body.fullName !== undefined)
        patch.fullName = requireText(body.fullName, { field: 'fullName', label: 'El nombre completo', min: 2, max: 120 });
      if (body.phone !== undefined) patch.phone = optionalPhone(body.phone);
      if (body.sector !== undefined) patch.sector = optionalText(body.sector, { field: 'sector', label: 'El sector', max: 120 });
      if (Object.keys(patch).length === 0) throw badRequest('nothing_to_update', 'No enviaste ningún dato para actualizar.');
      patch.profileUpdatedAt = clock();
      return me(principal, await repos.users.update(principal.user.id, patch));
    },

    async changePassword(principal, { currentPassword, newPassword }) {
      const user = principal.user;
      if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.passwordHash ?? ''))) {
        throw unauthorized('wrong_current_password', 'La contraseña actual no es correcta.');
      }
      const next = requirePassword(newPassword);
      if (next === currentPassword) throw badRequest('same_password', 'La nueva contraseña debe ser distinta a la actual.');
      await repos.users.update(user.id, { passwordHash: await hashPassword(next), profileUpdatedAt: clock() });
      await repos.sessions.revokeAllForUser(user.id, principal.sessionId); // cierra las demás sesiones
    },

    async setPhoto(principal, buffer) {
      if (buffer.length === 0) throw badRequest('empty_file', 'No se recibió ninguna imagen.');
      if (buffer.length > MAX_PHOTO_BYTES) throw new AppError(413, 'photo_too_large', 'La foto no puede superar 2 MB.');
      const type = detectImage(buffer);
      if (!type) throw new AppError(415, 'unsupported_image', 'Usa una imagen JPG, PNG o WEBP.');
      const photoUrl = await avatars.save(principal.user.id, buffer, type.ext);
      return me(principal, await repos.users.update(principal.user.id, { photoUrl, profileUpdatedAt: clock() }));
    },
  };
}
