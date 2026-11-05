import { tooManyRequests } from './errors.js';

/** Limitador en memoria por clave (IP). Suficiente para una sola instancia. */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      const entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        hits.set(key, { count: 1, reset: now + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= max;
    },
  };
}

export const limited = (limiter, bucket) => (ctx) => {
  if (!limiter.hit(`${bucket}:${ctx.ip ?? 'unknown'}`)) {
    throw tooManyRequests('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
  }
};
