import { createAlertsService } from './alerts.service.js';
import { createApprovalsService } from './approvals.service.js';
import { createAssignmentsService } from './assignments.service.js';
import { createAuditService } from './audit.service.js';
import { createAuthService } from './auth.service.js';
import { createChangeLogService } from './changelog.service.js';
import { createIncidentsService } from './incidents.service.js';
import { createNotificationsService } from './notifications.service.js';
import { createOpsContext } from './operations-context.js';
import { createProfileService } from './profile.service.js';
import { createReportsService } from './reports.service.js';
import { createRolesService } from './roles.service.js';
import { createUsersService } from './users.service.js';

/** deps: { repos, mailer, geoip, avatars, config, clock } */
export function createServices(deps) {
  const audit = createAuditService(deps);
  // Épica 2: base común compartida por los servicios de operaciones.
  const ctx = createOpsContext(deps);
  const changeLog = createChangeLogService(deps);
  const notifications = createNotificationsService(deps);
  const ops = { ...deps, ctx, changeLog, notifications };
  return {
    audit,
    auth: createAuthService({ ...deps, audit }),
    users: createUsersService(deps),
    roles: createRolesService(deps),
    profile: createProfileService(deps),
    // Épica 2
    changeLog,
    notifications,
    reports: createReportsService(ops),
    assignments: createAssignmentsService(ops),
    alerts: createAlertsService(ops),
    approvals: createApprovalsService(ops),
    incidents: createIncidentsService(ops),
  };
}
