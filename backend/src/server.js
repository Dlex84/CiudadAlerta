import { createApp } from './app.js';
import { createLocalAvatarStorage } from './adapters/avatars.js';
import { createGeoIp } from './adapters/geoip.js';
import { createMailer } from './adapters/mailer.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createPgRepos } from './repositories/pg/index.js';

const config = loadConfig();
const pool = await createPool(config.databaseUrl);
const { server } = createApp({
  config,
  repos: createPgRepos(pool),
  mailer: await createMailer(config),
  geoip: await createGeoIp(),
  avatars: createLocalAvatarStorage(config.uploadsDir),
});

server.listen(config.port, () => console.log(`CiudadAlerta API escuchando en http://localhost:${config.port}`));

const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
