import { loadConfig } from '../../src/config.js';
import { seedSystemRoles } from '../../src/domain/seed-data.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/lib/passwords.js';
import { createMemoryRepos } from './memory-repos.js';

export const PASSWORD = 'Clave-segura-123';
const silent = { info() {}, error() {}, warn() {} };

/** Levanta la API real (HTTP) sobre repositorios en memoria. */
export async function startTestApp({ env = {}, clock, repos = createMemoryRepos() } = {}) {
  await seedSystemRoles(repos);
  const sent = [];
  const mailer = { async send(m) { sent.push(m); } };
  const avatars = {
    files: new Map(),
    async save(userId, buf, ext) { const name = `${userId}.${ext}`; this.files.set(name, buf); return `/uploads/avatars/${name}`; },
    async read(name) { return this.files.get(name) ?? null; },
  };
  const geoip = { lookup: (ip) => (ip === '203.0.113.9' ? { country: 'DO', city: 'Santo Domingo' } : { country: null, city: 'Red local' }) };
  const config = loadConfig({ NODE_ENV: 'test', RATE_LIMIT_MAX: '1000', APP_URL: 'http://localhost:5173', ...env });
  const { server, services } = createApp({ config, repos, mailer, geoip, avatars, clock, logger: silent });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const role = (code) => repos.roles.findByCode(code);
  async function addUser({ email, fullName = 'Usuario Prueba', roleCode = 'ciudadano', password = PASSWORD, status = 'active' }) {
    const r = await role(roleCode);
    return repos.users.create({ fullName, email, roleId: r.id, status, passwordHash: password ? await hashPassword(password) : null });
  }

  return {
    base, repos, services, config, sent, avatars, addUser, role,
    client: () => createClient(base),
    close: () => new Promise((r) => server.close(r)),
  };
}

export function createClient(base) {
  let cookie = '';
  async function request(method, path, { body, raw, contentType, headers = {}, jar = true } = {}) {
    const h = { ...headers };
    if (jar && cookie) h.cookie = cookie;
    let payload;
    if (raw) { h['content-type'] = contentType; payload = raw; }
    else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    const setCookie = res.headers.getSetCookie();
    for (const c of setCookie) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      cookie = /Max-Age=0/i.test(c) ? '' : `${pair.slice(0, i)}=${pair.slice(i + 1)}`;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers, setCookie };
  }
  return {
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, body, o) => request('POST', p, { body, ...o }),
    put: (p, body, o) => request('PUT', p, { body, ...o }),
    patch: (p, body, o) => request('PATCH', p, { body, ...o }),
    delete: (p, o) => request('DELETE', p, o),
    login: (email, password = PASSWORD) => request('POST', '/api/auth/login', { body: { email, password } }),
    get cookie() { return cookie; },
  };
}

/** Un cliente ya autenticado como un usuario nuevo del rol indicado. */
export async function loggedIn(app, roleCode, email = `${roleCode}@ciudadalerta.test`) {
  const user = await app.addUser({ email, roleCode, fullName: `Prueba ${roleCode}` });
  const c = app.client();
  const res = await c.login(email);
  if (res.status !== 200) throw new Error(`login falló: ${JSON.stringify(res.data)}`);
  return { c, user };
}
