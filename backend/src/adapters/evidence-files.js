import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY_RE = /^[0-9a-f-]{36}\.(pdf|png|jpg|txt)$/;

/**
 * HU-4.7: archivos de evidencias en disco. A diferencia de las fotos, NO tienen ruta pública:
 * solo se descargan por la API, que valida la clasificación del documento (RN-4.10).
 */
export function createLocalEvidenceStorage(baseDir) {
  const dir = join(baseDir, 'evidences');
  return {
    async save(buffer, ext) {
      await mkdir(dir, { recursive: true });
      const key = `${randomUUID()}.${ext}`;
      await writeFile(join(dir, key), buffer);
      return key;
    },
    async read(key) {
      if (!KEY_RE.test(key)) return null;
      try {
        return await readFile(join(dir, key));
      } catch {
        return null;
      }
    },
  };
}

/** Detecta el tipo real por los primeros bytes; no confía en el Content-Type del cliente. */
export function detectEvidenceType(buf) {
  if (buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (!buf.includes(0) && Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)) return { ext: 'txt', mime: 'text/plain; charset=utf-8' };
  return null;
}
