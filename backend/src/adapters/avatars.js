import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_RE = /^[\w-]+\.(jpg|png|webp)$/;

/** Almacenamiento local de fotos de perfil. Reemplazable por S3/MinIO sin tocar los servicios. */
export function createLocalAvatarStorage(baseDir) {
  const dir = join(baseDir, 'avatars');
  return {
    async save(userId, buffer, ext) {
      await mkdir(dir, { recursive: true });
      const name = `${userId}-${Date.now()}.${ext}`;
      await writeFile(join(dir, name), buffer);
      return `/uploads/avatars/${name}`;
    },
    async read(name) {
      if (!FILE_RE.test(name)) return null;
      try {
        return await readFile(join(dir, name));
      } catch {
        return null;
      }
    },
  };
}
