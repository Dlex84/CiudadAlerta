import { createAccessLogsRepo } from './access-logs.js';
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
});
