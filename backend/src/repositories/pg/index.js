import { createAccessLogsRepo } from './access-logs.js';
import { createApprovalStepsRepo, createApprovalsRepo } from './approvals.js';
import { createChangeLogRepo } from './change-log.js';
import { createIncidentEventsRepo, createIncidentsRepo } from './incidents.js';
import { createMovementsRepo, createResourcesRepo } from './inventory.js';
import {
  createAlertEventsRepo,
  createAlertRulesRepo,
  createComplianceAlertsRepo,
  createComponentReviewsRepo,
  createComponentsRepo,
  createEvidencesRepo,
  createLicenseAssignmentsRepo,
  createLicenseTypesRepo,
  createPurchasedLicensesRepo,
  createSoftwareProjectsRepo,
} from './licensing.js';
import { createAlertDeliveriesRepo, createNotificationsRepo } from './notifications.js';
import {
  createAssignmentsRepo,
  createReportHistoryRepo,
  createReportTypesRepo,
  createReportsRepo,
} from './reports.js';
import { createResetTokensRepo } from './reset-tokens.js';
import { createRolesRepo } from './roles.js';
import { createSessionsRepo } from './sessions.js';
import { createUsersRepo } from './users.js';

export const createPgRepos = (pool) => ({
  users: createUsersRepo(pool),
  roles: createRolesRepo(pool),
  sessions: createSessionsRepo(pool),
  accessLogs: createAccessLogsRepo(pool),
  resetTokens: createResetTokensRepo(pool),
  // Épica 2
  reportTypes: createReportTypesRepo(pool),
  reports: createReportsRepo(pool),
  reportHistory: createReportHistoryRepo(pool),
  assignments: createAssignmentsRepo(pool),
  approvalSteps: createApprovalStepsRepo(pool),
  approvals: createApprovalsRepo(pool),
  incidents: createIncidentsRepo(pool),
  incidentEvents: createIncidentEventsRepo(pool),
  notifications: createNotificationsRepo(pool),
  alertDeliveries: createAlertDeliveriesRepo(pool),
  changeLog: createChangeLogRepo(pool),
  // Épica 3
  resources: createResourcesRepo(pool),
  movements: createMovementsRepo(pool),
  // Épica 4
  licenseTypes: createLicenseTypesRepo(pool),
  softwareProjects: createSoftwareProjectsRepo(pool),
  components: createComponentsRepo(pool),
  componentReviews: createComponentReviewsRepo(pool),
  purchasedLicenses: createPurchasedLicensesRepo(pool),
  licenseAssignments: createLicenseAssignmentsRepo(pool),
  evidences: createEvidencesRepo(pool),
  alertRules: createAlertRulesRepo(pool),
  complianceAlerts: createComplianceAlertsRepo(pool),
  alertEvents: createAlertEventsRepo(pool),
});
