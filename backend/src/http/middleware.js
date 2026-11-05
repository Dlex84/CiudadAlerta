import { can } from '../domain/permissions.js';
import { forbidden, unauthorized } from './errors.js';

/** Exige sesión válida. Permisos y rol se consultan en BD en cada request (cambios inmediatos). */
export const authenticated = (services, config) => async (ctx) => {
  const principal = await services.auth.authenticate(ctx.cookies[config.cookieName]);
  if (!principal) throw unauthorized('unauthenticated', 'Debes iniciar sesión para continuar.');
  ctx.principal = principal;
};

export const requirePermission = (module, action) => (ctx) => {
  if (!can(ctx.principal.permissions, module, action)) {
    throw forbidden('forbidden', 'No tienes permiso para realizar esta acción.');
  }
};
