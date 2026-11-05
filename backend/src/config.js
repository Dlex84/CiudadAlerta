const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};
const bool = (v, d = false) =>
  v === undefined ? d : ['1', 'true', 'yes', 'si'].includes(String(v).toLowerCase());

/** Lee la configuración desde variables de entorno (ver .env.example). */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const appUrl = (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  return {
    nodeEnv,
    port: int(env.PORT, 3000),
    databaseUrl:
      env.DATABASE_URL ?? 'postgres://ciudadalerta:ciudadalerta@localhost:5432/ciudadalerta',
    appUrl,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? appUrl)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cookieName: 'ca_session',
    cookieSecure: bool(env.COOKIE_SECURE, nodeEnv === 'production'),
    sessionTtlHours: int(env.SESSION_TTL_HOURS, 12),
    passwordResetTtlMinutes: int(env.PASSWORD_RESET_TTL_MINUTES, 30),
    inviteTtlHours: int(env.INVITE_TTL_HOURS, 72),
    trustProxy: bool(env.TRUST_PROXY, false),
    rateLimit: {
      windowMs: int(env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60_000,
      max: int(env.RATE_LIMIT_MAX, 20),
    },
    uploadsDir: env.UPLOADS_DIR ?? './uploads',
    frontendDist: env.FRONTEND_DIST ?? '',
    smtp: {
      host: env.SMTP_HOST ?? '',
      port: int(env.SMTP_PORT, 1025),
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASS ?? '',
      from: env.MAIL_FROM ?? 'CiudadAlerta <no-reply@ciudadalerta.local>',
    },
    seedAdmin: {
      name: env.SEED_ADMIN_NAME ?? 'Super Administrador',
      email: env.SEED_ADMIN_EMAIL ?? '',
      password: env.SEED_ADMIN_PASSWORD ?? '',
    },
  };
}
