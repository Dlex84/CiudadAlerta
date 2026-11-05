import { isPrivateIp } from '../lib/ip.js';

/**
 * Localización aproximada por IP (HU-1.8). Usa la base local de `geoip-lite` (sin llamadas externas,
 * coherente con la privacidad del proyecto). Si no está instalada, devuelve null.
 */
export async function createGeoIp() {
  let lookupFn = null;
  try {
    const mod = await import('geoip-lite');
    lookupFn = (mod.default ?? mod).lookup;
  } catch {
    /* opcional */
  }
  return {
    lookup(ip) {
      if (!ip) return null;
      if (isPrivateIp(ip)) return { country: null, city: 'Red local' };
      const r = lookupFn?.(ip);
      return r ? { country: r.country || null, city: r.city || r.region || null } : null;
    },
  };
}
