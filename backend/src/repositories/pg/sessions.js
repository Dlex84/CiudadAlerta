const map = (r) =>
  r && {
    id: r.id, userId: r.user_id, tokenHash: r.token_hash, ip: r.ip, userAgent: r.user_agent,
    createdAt: r.created_at, expiresAt: r.expires_at, revokedAt: r.revoked_at,
  };

export function createSessionsRepo(pool) {
  return {
    async create({ userId, tokenHash, ip, userAgent, expiresAt }) {
      const { rows } = await pool.query(
        `INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, tokenHash, ip, userAgent, expiresAt],
      );
      return map(rows[0]);
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
      return map(rows[0]) ?? null;
    },
    async revoke(id) {
      await pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
    },
    async revokeAllForUser(userId, exceptId = null) {
      await pool.query(
        `UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
        [userId, exceptId],
      );
    },
  };
}
