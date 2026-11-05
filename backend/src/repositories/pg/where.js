/** Arma un WHERE parametrizado: w.add('status = ?', v). Nunca concatena valores en el SQL. */
export function whereBuilder(base = 'true') {
  const parts = [base];
  const vals = [];
  return {
    vals,
    add(sql, ...values) {
      let out = sql;
      for (const v of values) {
        vals.push(v);
        out = out.replace('?', `$${vals.length}`);
      }
      parts.push(out);
    },
    get sql() {
      return parts.join(' AND ');
    },
    /** Añade LIMIT/OFFSET al final y devuelve los marcadores. */
    page(limit, offset) {
      vals.push(limit, offset);
      return `LIMIT $${vals.length - 1} OFFSET $${vals.length}`;
    },
  };
}

export const likeEscape = (s) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

/** INSERT con columnas dinámicas a partir de un mapa { propiedad: columna }. */
export function insertParts(columns, data) {
  const cols = [];
  const vals = [];
  for (const [key, col] of Object.entries(columns)) {
    if (data[key] !== undefined) { cols.push(col); vals.push(data[key]); }
  }
  return { cols: cols.join(', '), ph: vals.map((_, i) => `$${i + 1}`).join(', '), vals };
}

/** SET dinámico; el primer parámetro ($1) queda reservado para el id. */
export function setParts(columns, patch, firstVals = []) {
  const vals = [...firstVals];
  const sets = [];
  for (const [key, col] of Object.entries(columns)) {
    if (patch[key] !== undefined) { vals.push(patch[key]); sets.push(`${col} = $${vals.length}`); }
  }
  return { sets, vals };
}
