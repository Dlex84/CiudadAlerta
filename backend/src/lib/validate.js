import { badRequest } from '../http/errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-.\s]{7,20}$/;

export const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export function requireEmail(v) {
  const email = normalizeEmail(v);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    throw badRequest('invalid_email', 'El correo electrónico no es válido.');
  }
  return email;
}

export function requireText(v, { field, label, min = 1, max = 120 }) {
  const text = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (text.length < min || text.length > max) {
    throw badRequest(`invalid_${field}`, `${label} debe tener entre ${min} y ${max} caracteres.`);
  }
  return text;
}

/** Devuelve null si viene vacío; valida el largo si viene con contenido. */
export function optionalText(v, { field, label, max = 120 }) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null;
  return requireText(v, { field, label, min: 1, max });
}

export function optionalPhone(v) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null;
  const phone = typeof v === 'string' ? v.trim() : '';
  if (!PHONE_RE.test(phone)) {
    throw badRequest('invalid_phone', 'El teléfono no es válido (usa solo números, +, - y paréntesis).');
  }
  return phone;
}

export function requirePassword(v) {
  if (typeof v !== 'string' || v.length < 8) {
    throw badRequest('weak_password', 'La contraseña debe tener al menos 8 caracteres.');
  }
  if (v.length > 128) {
    throw badRequest('weak_password', 'La contraseña no puede superar los 128 caracteres.');
  }
  return v;
}

export function requireId(v, label = 'El identificador') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('invalid_id', `${label} no es válido.`);
  return n;
}

/** Entero acotado para paginación y similares. */
export function intInRange(v, { def, min, max }) {
  const n = Number.parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
