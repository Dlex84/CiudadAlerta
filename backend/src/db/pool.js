export async function createPool(databaseUrl) {
  const { default: pg } = await import('pg');
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}
