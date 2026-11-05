// HU-2.4: pasos de aprobación por tipo y decisiones por reporte.

export function createApprovalStepsRepo(pool) {
  const map = (r) => ({
    id: r.id, typeCode: r.type_code, stepOrder: r.step_order, name: r.name,
    approverRoleCode: r.approver_role_code, required: r.required,
  });
  return {
    async listByType(typeCode) {
      const { rows } = await pool.query('SELECT * FROM approval_steps WHERE type_code = $1 ORDER BY step_order', [typeCode]);
      return rows.map(map);
    },
    /** Reemplaza la lista completa de pasos de un tipo, en una transacción. */
    async replaceForType(typeCode, steps) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM approval_steps WHERE type_code = $1', [typeCode]);
        for (const s of steps) {
          await client.query(
            `INSERT INTO approval_steps (type_code, step_order, name, approver_role_code, required)
             VALUES ($1, $2, $3, $4, $5)`,
            [typeCode, s.stepOrder, s.name, s.approverRoleCode ?? null, s.required],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

export function createApprovalsRepo(pool) {
  const map = (r) =>
    r && {
      id: String(r.id), reportId: r.report_id, round: r.round, stepOrder: r.step_order, stepName: r.step_name,
      approverRoleCode: r.approver_role_code, required: r.required, decision: r.decision, comment: r.comment,
      requestedBy: r.requested_by, requestedAt: r.requested_at, decidedBy: r.decided_by, decidedAt: r.decided_at,
    };
  return {
    async createRound(reportId, round, rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const s of rows) {
          await client.query(
            `INSERT INTO report_approvals (report_id, round, step_order, step_name, approver_role_code, required, requested_by, requested_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [reportId, round, s.stepOrder, s.stepName, s.approverRoleCode ?? null, s.required, s.requestedBy, s.requestedAt],
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async listByReport(reportId) {
      const { rows } = await pool.query(
        'SELECT * FROM report_approvals WHERE report_id = $1 ORDER BY round, step_order',
        [reportId],
      );
      return rows.map(map);
    },
    async findById(id) {
      if (!/^\d+$/.test(String(id))) return null;
      return map((await pool.query('SELECT * FROM report_approvals WHERE id = $1', [id])).rows[0]) ?? null;
    },
    /** Atómico: solo decide si sigue pendiente. Devuelve null si alguien decidió antes. */
    async decide(id, { decision, comment, decidedBy, decidedAt }) {
      const { rows } = await pool.query(
        `UPDATE report_approvals SET decision = $2, comment = $3, decided_by = $4, decided_at = $5
          WHERE id = $1 AND decision = 'pending' RETURNING *`,
        [id, decision, comment ?? null, decidedBy, decidedAt],
      );
      return map(rows[0]) ?? null;
    },
    async cancelPending(reportId, round) {
      await pool.query(
        `UPDATE report_approvals SET decision = 'cancelled' WHERE report_id = $1 AND round = $2 AND decision = 'pending'`,
        [reportId, round],
      );
    },
    async listPending() {
      const { rows } = await pool.query(
        `SELECT * FROM report_approvals WHERE decision = 'pending' ORDER BY requested_at, id`,
      );
      return rows.map(map);
    },
  };
}
