import { createApp } from './app.js';
import { createLocalAvatarStorage } from './adapters/avatars.js';
import { createGeoIp } from './adapters/geoip.js';
import { createMailer } from './adapters/mailer.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createPgRepos } from './repositories/pg/index.js';

const config = loadConfig();
const pool = await createPool(config.databaseUrl);
const { server, services } = createApp({
  config,
  repos: createPgRepos(pool),
  mailer: await createMailer(config),
  geoip: await createGeoIp(),
  avatars: createLocalAvatarStorage(config.uploadsDir),
});

server.listen(config.port, () => console.log(`CiudadAlerta API escuchando en http://localhost:${config.port}`));

// HU-2.5: revisa vencimientos cada ALERT_SCAN_MINUTES. Con varias instancias, actívalo solo en una.
let alertTimer = null;
if (config.alerts.scanMinutes > 0) {
  const runScan = () =>
    services.alerts
      .scan()
      .then((r) => (r.sent || r.failed) && console.log(`Alertas: ${r.sent} enviadas, ${r.failed} fallidas, ${r.skipped} omitidas por repetidas`))
      .catch((err) => console.error('Falló la revisión de alertas:', err));
  alertTimer = setInterval(runScan, config.alerts.scanMinutes * 60_000);
  alertTimer.unref();
}

const shutdown = () => {
  clearInterval(alertTimer);
  server.close(async () => { await pool.end(); process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
