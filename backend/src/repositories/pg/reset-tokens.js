const map = (r) =>
  r && {
    id: r.id, userId: r.user_id, tokenHash: r.token_hash, purpose: r.purpose,
    expiresAt: r.expires_at, usedAt: r.used_at, createdAt: r.created_at,
  };

export function createResetTokensRepo(pool) {
  return {
    async create({ userId, tokenHash, purpose, expiresAt }) {
      const { rows } = await pool.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, tokenHash, purpose, expiresAt],
      );
      return map(rows[0]);
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM password_reset_tokens WHERE token_hash = $1', [tokenHash]);
      return map(rows[0]) ?? null;
    },
    /** Atómico: devuelve true solo para quien realmente lo marcó como usado. */
    async markUsed(id) {
      const r = await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL', [id]);
      return r.rowCount === 1;
    },
    async invalidateAllForUser(userId) {
      await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    },
  };
}
