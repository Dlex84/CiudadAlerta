// Servicio de notificaciones (HU-2.3 y HU-2.5): aviso dentro de la app (pantalla 14) y, si se pide, por correo.
import { notFound } from '../http/errors.js';
import { intInRange } from '../lib/validate.js';

export function createNotificationsService({ repos, mailer, config, clock = () => new Date() }) {
  return {
    /**
     * Crea la notificación en la app y opcionalmente envía un correo.
     * Devuelve el resultado de cada canal para poder registrarlo (HU-2.5).
     */
    async notify({ userId, kind, title, body = '', reportId = null, email = false }) {
      const notification = await repos.notifications.create({ userId, kind, title, body, reportId, createdAt: clock() });
      const result = { notification, inApp: 'sent', email: 'skipped', error: null };
      if (!email) return result;
      const user = await repos.users.findById(userId);
      if (!user) return { ...result, email: 'failed', error: 'usuario no encontrado' };
      try {
        const link = reportId ? `${config.appUrl}/#/admin/reporte?id=${reportId}` : config.appUrl;
        await mailer.send({ to: user.email, subject: `CiudadAlerta: ${title}`, text: `Hola ${user.fullName},\n\n${title}.\n${body}\n\n${link}` });
        return { ...result, email: 'sent' };
      } catch (err) {
        return { ...result, email: 'failed', error: String(err?.message ?? err).slice(0, 300) };
      }
    },

    async listMine(actor, query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 20, min: 1, max: 100 });
      const r = await repos.notifications.listByUser(actor.user.id, {
        unreadOnly: ['1', 'true'].includes(String(query.unread)),
        limit,
        offset: (page - 1) * limit,
      });
      return { ...r, page, limit };
    },

    async markRead(actor, id) {
      if (!(await repos.notifications.markRead(actor.user.id, id, clock()))) {
        throw notFound('notification_not_found', 'Notificación no encontrada.');
      }
    },

    async markAllRead(actor) {
      await repos.notifications.markAllRead(actor.user.id, clock());
    },
  };
}
