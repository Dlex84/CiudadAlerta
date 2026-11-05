import { badRequest } from '../http/errors.js';

/**
 * Fecha de un filtro: acepta YYYY-MM-DD (UTC; con endOfDay=true incluye todo ese día) o ISO completo.
 * Devuelve null si viene vacío.
 */
export function parseDateParam(v, label, endOfDay = false) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T${endOfDay ? '23:59:59.999' : '00:00:00'}Z` : s);
  if (Number.isNaN(d.getTime())) throw badRequest('invalid_date', `La fecha "${label}" no es válida.`);
  return d;
}

export function parsePeriod(query = {}) {
  const from = parseDateParam(query.from, 'desde');
  const to = parseDateParam(query.to, 'hasta', true);
  if (from && to && from > to) throw badRequest('invalid_period', 'La fecha "desde" no puede ser posterior a "hasta".');
  return { from, to };
}

export const addHours = (date, hours) => new Date(new Date(date).getTime() + hours * 3_600_000);
export const hoursBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
