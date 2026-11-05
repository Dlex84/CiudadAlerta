import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/** Sirve el build del frontend (la app usa rutas con #, así que todo lo desconocido cae en index.html). */
export async function serveStatic(root, pathname) {
  const base = resolve(root);
  let target = resolve(join(base, '.' + sep + decodeURIComponent(pathname)));
  if (target !== base && !target.startsWith(base + sep)) return null;
  try {
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
  } catch {
    target = join(base, 'index.html');
  }
  try {
    const body = await readFile(target);
    const type = MIME[extname(target)] ?? 'application/octet-stream';
    const immutable = target.includes(`${sep}assets${sep}`);
    return { status: 200, raw: body, headers: { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' } };
  } catch {
    return null;
  }
}
