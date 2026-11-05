import { ACTIONS, DASHBOARD_PATHS, MODULES } from '../domain/permissions.js';
import { AppError, notFound } from './errors.js';
import { sessionCookie } from './cookies.js';
import { authenticated, requireAnyPermission, requirePermission } from './middleware.js';
import { limited } from './rate-limit.js';
import { Router, created, noContent, ok } from './router.js';
import { asignacionesRoutes } from './routes/asignaciones.js';
import { reportesRoutes } from './routes/reportes.js';

const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function buildRoutes({ services, config, avatars, limiter }) {
  const r = new Router();
  const auth = authenticated(services, config);
  const needs = (module, action) => [auth, requirePermission(module, action)];
  const needsAny = (...pairs) => [auth, requireAnyPermission(pairs)];
  const authLimit = limited(limiter, 'auth');
  const ua = (ctx) => ctx.req.headers['user-agent'];

  const startSession = (result) => ({
    status: 200,
    cookies: [
      sessionCookie(config.cookieName, result.token, {
        maxAgeSeconds: config.sessionTtlHours * 3600,
        secure: config.cookieSecure,
      }),
    ],
    body: {
      user: result.user,
      role: result.role,
      permissions: result.permissions,
      redirectTo: result.redirectTo,
    },
  });

  r.get('/api/health', () => ok({ status: 'ok' }));

  // ── Autenticación (HU-1.1, HU-1.5) ─────────────────────────────────────────────
  r.post('/api/auth/login', authLimit, async (ctx) => {
    const b = await ctx.json();
    return startSession(
      await services.auth.login({ email: b.email, password: b.password, ip: ctx.ip, userAgent: ua(ctx) }),
    );
  });

  r.post('/api/auth/register', authLimit, async (ctx) => {
    const b = await ctx.json();
    await services.users.register(b);
    const session = await services.auth.login({ email: b.email, password: b.password, ip: ctx.ip, userAgent: ua(ctx) });
    return { ...startSession(session), status: 201 };
  });

  r.post('/api/auth/logout', auth, async (ctx) => {
    await services.auth.logout(ctx.principal, { ip: ctx.ip, userAgent: ua(ctx) });
    return {
      status: 204,
      cookies: [sessionCookie(config.cookieName, '', { maxAgeSeconds: 0, secure: config.cookieSecure })],
    };
  });

  r.post('/api/auth/forgot-password', authLimit, async (ctx) => {
    const b = await ctx.json();
    await services.auth.requestPasswordReset({ email: b.email });
    return ok({ message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
  });

  r.post('/api/auth/reset-password', authLimit, async (ctx) => {
    const b = await ctx.json();
    await services.auth.resetPassword({ token: b.token, password: b.password });
    return ok({ message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.' });
  });

  // ── Perfil propio (HU-1.7) ─────────────────────────────────────────────────────
  r.get('/api/me', auth, (ctx) => ok(services.profile.getMe(ctx.principal)));
  r.patch('/api/me', auth, async (ctx) => ok(await services.profile.updateMe(ctx.principal, await ctx.json())));
  r.put('/api/me/password', auth, async (ctx) => {
    const b = await ctx.json();
    await services.profile.changePassword(ctx.principal, b);
    return noContent();
  });
  r.put('/api/me/photo', auth, async (ctx) => {
    const type = String(ctx.req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!Object.values(CONTENT_TYPES).includes(type)) {
      throw new AppError(415, 'unsupported_image', 'Envía la imagen como image/jpeg, image/png o image/webp.');
    }
    return ok(await services.profile.setPhoto(ctx.principal, await ctx.raw(2 * 1024 * 1024)));
  });

  r.get('/api/meta/permissions', auth, () => ok({ modules: MODULES, actions: ACTIONS, dashboards: DASHBOARD_PATHS }));

  // ── Usuarios (HU-1.2, HU-1.6) ──────────────────────────────────────────────────
  r.get('/api/users', ...needs('usuarios', 'read'), async (ctx) => ok(await services.users.list(ctx.query)));
  r.get('/api/users/:id', ...needs('usuarios', 'read'), async (ctx) => ok(await services.users.get(ctx.params.id)));
  r.post('/api/users', ...needs('usuarios', 'create'), async (ctx) =>
    created(await services.users.create(ctx.principal, await ctx.json())),
  );
  r.patch('/api/users/:id', ...needs('usuarios', 'update'), async (ctx) =>
    ok(await services.users.update(ctx.principal, ctx.params.id, await ctx.json())),
  );
  r.delete('/api/users/:id', ...needs('usuarios', 'delete'), async (ctx) => {
    await services.users.remove(ctx.principal, ctx.params.id);
    return noContent();
  });
  r.post('/api/users/:id/block', ...needs('usuarios', 'update'), async (ctx) =>
    ok(await services.users.block(ctx.principal, ctx.params.id, await ctx.json())),
  );
  r.post('/api/users/:id/unblock', ...needs('usuarios', 'update'), async (ctx) =>
    ok(await services.users.unblock(ctx.principal, ctx.params.id)),
  );
  r.post('/api/users/:id/resend-invitation', ...needs('usuarios', 'update'), async (ctx) =>
    ok(await services.users.resendInvitation(ctx.principal, ctx.params.id)),
  );

  // ── Roles y permisos (HU-1.3, HU-1.4) ──────────────────────────────────────────
  r.get('/api/roles', ...needs('roles', 'read'), async () => ok({ items: await services.roles.list() }));
  r.get('/api/roles/:id', ...needs('roles', 'read'), async (ctx) => ok(await services.roles.get(ctx.params.id)));
  r.post('/api/roles', ...needs('roles', 'create'), async (ctx) => created(await services.roles.create(await ctx.json())));
  r.patch('/api/roles/:id', ...needs('roles', 'update'), async (ctx) =>
    ok(await services.roles.update(ctx.params.id, await ctx.json())),
  );
  r.delete('/api/roles/:id', ...needs('roles', 'delete'), async (ctx) => {
    await services.roles.remove(ctx.params.id);
    return noContent();
  });
  r.get('/api/roles/:id/permissions', ...needs('permisos', 'read'), async (ctx) =>
    ok(await services.roles.getPermissions(ctx.params.id)),
  );
  r.put('/api/roles/:id/permissions', ...needs('permisos', 'update'), async (ctx) =>
    ok(await services.roles.setPermissions(ctx.principal, ctx.params.id, await ctx.json())),
  );

  // ── Auditoría de accesos (HU-1.8) ──────────────────────────────────────────────
  r.get('/api/audit/access', ...needs('auditoria', 'read'), async (ctx) => ok(await services.audit.search(ctx.query)));

  // ── Épica 2: Gestión de operaciones (un archivo por persona del plan) ───────────
  const epica2 = { services, auth, needs, needsAny };
  reportesRoutes(r, epica2);
  asignacionesRoutes(r, epica2);

  // ── Archivos subidos (fotos de perfil) ─────────────────────────────────────────
  r.get('/uploads/avatars/:file', async (ctx) => {
    const data = await avatars.read(ctx.params.file);
    if (!data) throw notFound('file_not_found', 'Archivo no encontrado.');
    const ext = ctx.params.file.split('.').pop();
    return {
      status: 200,
      raw: data,
      headers: { 'content-type': CONTENT_TYPES[ext], 'cache-control': 'public, max-age=31536000, immutable' },
    };
  });

  return r;
}
