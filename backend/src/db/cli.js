// Uso: node src/db/cli.js <migrate|seed|setup>
import { loadConfig } from '../config.js';
import { seedSuperAdmin, seedSystemRoles } from '../domain/seed-data.js';
import { createPgRepos } from '../repositories/pg/index.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';

const command = process.argv[2];
if (!['migrate', 'seed', 'setup'].includes(command)) {
  console.error('Uso: node src/db/cli.js <migrate|seed|setup>');
  process.exit(1);
}

const config = loadConfig();
const pool = await createPool(config.databaseUrl);
try {
  if (command === 'migrate' || command === 'setup') await migrate(pool);
  if (command === 'seed' || command === 'setup') {
    const repos = createPgRepos(pool);
    await seedSystemRoles(repos);
    console.log('✔ roles del sistema listos');
    const admin = await seedSuperAdmin(repos, config.seedAdmin);
    if (admin) console.log(`✔ Super Administrador creado: ${admin.email}`);
    else if (!config.seedAdmin.email) console.log('ℹ Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear el primer Super Administrador.');
  }
} finally {
  await pool.end();
}
