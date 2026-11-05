import { readFile, readdir } from 'node:fs/promises';

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

/** Aplica en orden los .sql de /migrations que aún no se hayan ejecutado. */
export async function migrate(pool, dir = MIGRATIONS_DIR) {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(new URL(file, dir), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✔ migración aplicada: ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${file}: ${e.message}`);
    } finally {
      client.release();
    }
  }
}
