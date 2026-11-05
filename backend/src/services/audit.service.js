import { badRequest } from '../http/errors.js';
import { intInRange } from '../lib/validate.js';

export const ACCESS_EVENTS = ['login_success', 'login_failed', 'login_blocked', 'logout'];

function parseDate(v, label, endOfDay = false) {
  if (v === undefined || v === '') return null;
  const s = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T${endOfDay ? '23:59:59.999' : '00:00:00'}Z` : s);
  if (Number.isNaN(d.getTime())) throw badRequest('invalid_date', `La fecha "${label}" no es válida.`);
  return d;
}

/** HU-1.8: registro y consulta del historial de accesos. */
export function createAuditService({ repos, geoip, clock = () => new Date() }) {
  return {
    /** Registra un evento de acceso. Un fallo de auditoría no debe tumbar el login. */
    async record({ userId = null, email = null, event, ip = null, userAgent = null }) {
      const geo = geoip.lookup(ip);
      try {
        await repos.accessLogs.create({
          userId,
          email,
          event,
          ip,
          country: geo?.country ?? null,
          city: geo?.city ?? null,
          userAgent: userAgent ? String(userAgent).slice(0, 300) : null,
          createdAt: clock(),
        });
      } catch (err) {
        console.error('No se pudo registrar el evento de acceso:', err);
      }
    },

    async search(query = {}) {
      if (query.event && !ACCESS_EVENTS.includes(query.event)) {
        throw badRequest('invalid_event', `El evento debe ser uno de: ${ACCESS_EVENTS.join(', ')}.`);
      }
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 25, min: 1, max: 100 });
      const { items, total } = await repos.accessLogs.search({
        userId: query.userId || null,
        email: query.email ? String(query.email).trim().toLowerCase().slice(0, 254) : null,
        event: query.event || null,
        ip: query.ip ? String(query.ip).trim() : null,
        from: parseDate(query.from, 'desde'),
        to: parseDate(query.to, 'hasta', true),
        limit,
        offset: (page - 1) * limit,
      });
      const names = new Map();
      for (const id of new Set(items.map((i) => i.userId).filter(Boolean))) {
        names.set(id, (await repos.users.findById(id))?.fullName ?? null);
      }
      return {
        items: items.map((i) => ({ ...i, userName: i.userId ? (names.get(i.userId) ?? null) : null })),
        total,
        page,
        limit,
      };
    },
  };
}
