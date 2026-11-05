import http from 'node:http';
import { AppError, badRequest, notFound } from './http/errors.js';
import { parseCookies } from './http/cookies.js';
import { createRateLimiter } from './http/rate-limit.js';
import { buildRoutes } from './http/routes.js';
import { serveStatic } from './http/static.js';
import { clientIp } from './lib/ip.js';
import { createServices } from './services/index.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
};

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      // Se descarta el resto para poder responder 413 limpiamente; si insisten, se corta la conexión.
      tooLarge = true;
      if (size > limit * 4) break;
      continue;
    }
    chunks.push(chunk);
  }
  if (tooLarge) throw new AppError(413, 'payload_too_large', 'El contenido enviado es demasiado grande.');
  return Buffer.concat(chunks);
}

/**
 * Crea la aplicación. Todo lo externo (BD, correo, geolocalización, archivos) entra por parámetro,
 * por eso las pruebas pueden usar repositorios en memoria.
 */
export function createApp({ config, repos, mailer, geoip, avatars, clock = () => new Date(), logger = console }) {
  const services = createServices({ repos, mailer, geoip, avatars, config, clock });
  const limiter = createRateLimiter(config.rateLimit);
  const router = buildRoutes({ services, config, avatars, limiter });

  async function handle(req, res) {
    const send = ({ status = 200, body, raw, headers = {}, cookies = [] }) => {
      const h = { ...SECURITY_HEADERS, ...headers };
      if (cookies.length) h['set-cookie'] = cookies;
      if (raw !== undefined) {
        res.writeHead(status, h);
        return res.end(raw);
      }
      if (body === undefined) {
        res.writeHead(status, h);
        return res.end();
      }
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h });
      res.end(JSON.stringify(body));
    };

    try {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method ?? 'GET';

      // Defensa CSRF adicional a SameSite: si el navegador indica un origen, debe ser uno permitido.
      const origin = req.headers.origin;
      if (MUTATING.has(method) && origin && !config.allowedOrigins.includes(origin)) {
        throw new AppError(403, 'origin_not_allowed', 'Origen no permitido.');
      }

      let match = null;
      try {
        match = router.match(method, url.pathname);
      } catch {
        throw badRequest('invalid_url', 'La URL no es válida.');
      }

      if (!match) {
        const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/');
        if (!isApi && config.frontendDist && method === 'GET') {
          const file = await serveStatic(config.frontendDist, url.pathname);
          if (file) return send(file);
        }
        throw notFound('route_not_found', 'Recurso no encontrado.');
      }

      const ctx = {
        req,
        res,
        url,
        params: match.params,
        query: Object.fromEntries(url.searchParams),
        ip: clientIp(req, config.trustProxy),
        cookies: parseCookies(req.headers.cookie),
        principal: null,
        async json() {
          const type = String(req.headers['content-type'] ?? '').toLowerCase();
          if (!type.startsWith('application/json')) {
            throw new AppError(415, 'unsupported_media_type', 'Se esperaba contenido application/json.');
          }
          const buf = await readBody(req, 1_000_000);
          if (buf.length === 0) return {};
          try {
            const value = JSON.parse(buf.toString('utf8'));
            if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('no es objeto');
            return value;
          } catch {
            throw badRequest('invalid_json', 'El cuerpo de la solicitud no es un JSON válido.');
          }
        },
        raw: (limit) => readBody(req, limit),
      };

      let result;
      for (const handler of match.handlers) {
        result = await handler(ctx);
        if (result !== undefined) break;
      }
      send(result ?? { status: 204 });
    } catch (err) {
      if (err instanceof AppError) {
        send({
          status: err.status,
          body: { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
        });
      } else {
        logger.error('Error no controlado:', err);
        send({ status: 500, body: { error: { code: 'internal_error', message: 'Ocurrió un error inesperado.' } } });
      }
    }
  }

  return { server: http.createServer(handle), services };
}
