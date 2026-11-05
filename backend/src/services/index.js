import { createAuditService } from './audit.service.js';
import { createAuthService } from './auth.service.js';
import { createProfileService } from './profile.service.js';
import { createRolesService } from './roles.service.js';
import { createUsersService } from './users.service.js';

/** deps: { repos, mailer, geoip, avatars, config, clock } */
export function createServices(deps) {
  const audit = createAuditService(deps);
  return {
    audit,
    auth: createAuthService({ ...deps, audit }),
    users: createUsersService(deps),
    roles: createRolesService(deps),
    profile: createProfileService(deps),
  };
}
