export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  let ip = req.socket?.remoteAddress ?? '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip || null;
}

export function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip === '::1' || ip === 'localhost') return true;
  if (/^(fc|fd|fe80)/i.test(ip)) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
