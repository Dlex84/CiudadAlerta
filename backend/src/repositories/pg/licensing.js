// Épica 4: licencias, inventario de software, licencias adquiridas, asignaciones, evidencias y alertas.
import { isUuid } from '../../lib/tokens.js';
import { insertParts, likeEscape, setParts, whereBuilder } from './where.js';

const day = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

// ── Catálogo de licencias (HU-4.1) ─────────────────────────────────────────────────
const LT = {
  spdxId: 'spdx_id', name: 'name', version: 'version', category: 'category', sourceUrl: 'source_url',
  obligations: 'obligations', requiresAttribution: 'requires_attribution', redistribution: 'redistribution',
  modification: 'modification', restrictions: 'restrictions', verifiedOn: 'verified_on', verifiedBy: 'verified_by',
  isActive: 'is_active', updatedAt: 'updated_at',
};
const mapLT = (r) =>
  r && {
    id: r.id, spdxId: r.spdx_id, name: r.name, version: r.version, category: r.category, sourceUrl: r.source_url,
    obligations: r.obligations, requiresAttribution: r.requires_attribution, redistribution: r.redistribution,
    modification: r.modification, restrictions: r.restrictions, verifiedOn: day(r.verified_on), verifiedBy: r.verified_by,
    isActive: r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
  };

export function createLicenseTypesRepo(pool) {
  const one = async (sql, vals) => mapLT((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    async create(d) {
      const { cols, ph, vals } = insertParts(LT, d);
      return one(`INSERT INTO license_types (${cols}) VALUES (${ph}) RETURNING *`, vals);
    },
    findById: (id) => (/^\d+$/.test(String(id)) ? one('SELECT * FROM license_types WHERE id = $1', [id]) : null),
    findBySpdx: (spdxId) => one('SELECT * FROM license_types WHERE lower(spdx_id) = lower($1)', [spdxId]),
    async list(f = {}) {
      const w = whereBuilder();
      if (f.q) w.add("(spdx_id ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\')", likeEscape(f.q), likeEscape(f.q));
      if (f.category) w.add('category = ?', f.category);
      if (f.active !== undefined) w.add('is_active = ?', f.active);
      const { rows } = await pool.query(`SELECT * FROM license_types WHERE ${w.sql} ORDER BY spdx_id`, w.vals);
      return rows.map(mapLT);
    },
    async update(id, patch) {
      const { sets, vals } = setParts(LT, patch, [id]);
      if (patch.updatedAt === undefined) sets.push('updated_at = now()');
      return one(`UPDATE license_types SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
    },
  };
}

export function createSoftwareProjectsRepo(pool) {
  const map = (r) => r && { code: r.code, name: r.name, licenseId: r.license_id, repositoryUrl: r.repository_url };
  return {
    async create({ code, name, licenseId, repositoryUrl }) {
      const { rows } = await pool.query(
        'INSERT INTO software_projects (code, name, license_id, repository_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [code, name, licenseId, repositoryUrl ?? null],
      );
      return map(rows[0]);
    },
    async findByCode(code) {
      return map((await pool.query('SELECT * FROM software_projects WHERE code = $1', [code])).rows[0]) ?? null;
    },
    async list() {
      return (await pool.query('SELECT * FROM software_projects ORDER BY name')).rows.map(map);
    },
  };
}

// ── Inventario de software (HU-4.2) y revisiones (HU-4.5) ─────────────────────────
const SC = {
  projectCode: 'project_code', name: 'name', version: 'version', kind: 'kind', ecosystem: 'ecosystem',
  repositoryUrl: 'repository_url', declaredLicense: 'declared_license', licenseId: 'license_id',
  licenseStatus: 'license_status', isDirect: 'is_direct', isDev: 'is_dev', addedBy: 'added_by', addedAt: 'added_at', updatedAt: 'updated_at',
};
const mapSC = (r) =>
  r && {
    id: r.id, projectCode: r.project_code, name: r.name, version: r.version, kind: r.kind, ecosystem: r.ecosystem,
    repositoryUrl: r.repository_url, declaredLicense: r.declared_license, licenseId: r.license_id, licenseStatus: r.license_status,
    isDirect: r.is_direct, isDev: r.is_dev, addedBy: r.added_by, addedAt: r.added_at, updatedAt: r.updated_at,
    ...(r.duplicates !== undefined ? { duplicates: r.duplicates } : {}),
  };

export function createComponentsRepo(pool) {
  const one = async (sql, vals) => mapSC((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    async create(d) {
      const { cols, ph, vals } = insertParts(SC, d);
      return one(`INSERT INTO software_components (${cols}) VALUES (${ph}) RETURNING *`, vals);
    },
    findById: (id) => (isUuid(String(id)) ? one('SELECT * FROM software_components WHERE id = $1', [id]) : null),
    findInProject: (projectCode, name, version) =>
      one('SELECT * FROM software_components WHERE project_code = $1 AND lower(name) = lower($2) AND version = $3', [projectCode, name, version]),
    /** RN-4.4: mismo nombre y versión en cualquier proyecto (duplicados potenciales). */
    async findByNameVersion(name, version) {
      const { rows } = await pool.query('SELECT * FROM software_components WHERE lower(name) = lower($1) AND version = $2', [name, version]);
      return rows.map(mapSC);
    },
    async list(f = {}) {
      const w = whereBuilder();
      if (f.projectCode) w.add('c.project_code = ?', f.projectCode);
      if (f.q) w.add("c.name ILIKE ? ESCAPE '\\'", likeEscape(f.q));
      if (f.statuses?.length) w.add('c.license_status = ANY(?::text[])', f.statuses);
      if (f.licenseIds?.length) w.add('c.license_id = ANY(?::int[])', f.licenseIds);
      if (f.isDirect !== undefined) w.add('c.is_direct = ?', f.isDirect);
      if (f.isDev !== undefined) w.add('c.is_dev = ?', f.isDev);
      if (f.ids) w.add('c.id = ANY(?::uuid[])', f.ids);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM software_components c WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = f.limit ? w.page(f.limit, f.offset ?? 0) : '';
      const { rows } = await pool.query(
        `SELECT c.*, (SELECT count(*)::int FROM software_components d
                      WHERE lower(d.name) = lower(c.name) AND d.version = c.version AND d.id <> c.id) AS duplicates
         FROM software_components c WHERE ${w.sql} ORDER BY c.project_code, lower(c.name), c.version ${page}`,
        w.vals,
      );
      return { items: rows.map(mapSC), total };
    },
    async update(id, patch) {
      const { sets, vals } = setParts(SC, patch, [id]);
      if (patch.updatedAt === undefined) sets.push('updated_at = now()');
      return one(`UPDATE software_components SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
    },
  };
}

export function createComponentReviewsRepo(pool) {
  const map = (r) => ({
    id: String(r.id), componentId: r.component_id, version: r.version, decision: r.decision, obligations: r.obligations,
    evaluation: r.evaluation, licenseId: r.license_id, evidenceId: r.evidence_id == null ? null : String(r.evidence_id),
    reviewerId: r.reviewer_id, createdAt: r.created_at,
  });
  return {
    async add({ componentId, version, decision, obligations, evaluation, licenseId, evidenceId, reviewerId, createdAt }) {
      const { rows } = await pool.query(
        `INSERT INTO component_reviews (component_id, version, decision, obligations, evaluation, license_id, evidence_id, reviewer_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [componentId, version, decision, obligations, evaluation, licenseId ?? null, evidenceId ?? null, reviewerId, createdAt],
      );
      return map(rows[0]);
    },
    async listByComponent(componentId) {
      const { rows } = await pool.query('SELECT * FROM component_reviews WHERE component_id = $1 ORDER BY created_at DESC, id DESC', [componentId]);
      return rows.map(map);
    },
    /** Última revisión de cada componente indicado. */
    async latestFor(componentIds) {
      if (!componentIds.length) return new Map();
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (component_id) * FROM component_reviews WHERE component_id = ANY($1::uuid[])
         ORDER BY component_id, created_at DESC, id DESC`,
        [componentIds],
      );
      return new Map(rows.map((r) => [r.component_id, map(r)]));
    },
  };
}

// ── Licencias adquiridas (HU-4.3) y asignaciones (HU-4.4) ─────────────────────────
const PL = {
  vendor: 'vendor', product: 'product', edition: 'edition', modality: 'modality', metric: 'metric', quantity: 'quantity',
  startsOn: 'starts_on', expiresOn: 'expires_on', alertDays: 'alert_days', licenseKey: 'license_key',
  contractRef: 'contract_ref', notes: 'notes', isActive: 'is_active', createdBy: 'created_by', createdAt: 'created_at', updatedAt: 'updated_at',
};
const mapPL = (r) =>
  r && {
    id: r.id, code: r.code, vendor: r.vendor, product: r.product, edition: r.edition, modality: r.modality, metric: r.metric,
    quantity: r.quantity, assigned: r.assigned, startsOn: day(r.starts_on), expiresOn: day(r.expires_on), alertDays: r.alert_days,
    licenseKey: r.license_key, contractRef: r.contract_ref, notes: r.notes, isActive: r.is_active,
    createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  };
const mapLA = (r) =>
  r && {
    id: String(r.id), licenseId: r.license_id, targetType: r.target_type, targetUserId: r.target_user_id, targetName: r.target_name,
    assignedBy: r.assigned_by, assignedAt: r.assigned_at, releasedAt: r.released_at, releasedBy: r.released_by, releaseReason: r.release_reason,
  };

export function createPurchasedLicensesRepo(pool) {
  const one = async (sql, vals) => mapPL((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    async create(d) {
      const { cols, ph, vals } = insertParts(PL, d);
      return one(
        `INSERT INTO purchased_licenses (code, ${cols})
         VALUES ('LIC-' || lpad(nextval('purchased_license_code_seq')::text, 4, '0'), ${ph}) RETURNING *`,
        vals,
      );
    },
    findById: (id) =>
      isUuid(String(id))
        ? one('SELECT * FROM purchased_licenses WHERE id = $1', [id])
        : one('SELECT * FROM purchased_licenses WHERE code = upper($1)', [String(id)]),
    async list(f = {}) {
      const w = whereBuilder();
      if (f.q) w.add("(vendor ILIKE ? ESCAPE '\\' OR product ILIKE ? ESCAPE '\\' OR code ILIKE ? ESCAPE '\\')", likeEscape(f.q), likeEscape(f.q), likeEscape(f.q));
      if (f.vendor) w.add('lower(vendor) = lower(?)', f.vendor);
      if (f.active !== undefined) w.add('is_active = ?', f.active);
      const { rows } = await pool.query(`SELECT * FROM purchased_licenses WHERE ${w.sql} ORDER BY vendor, product`, w.vals);
      return rows.map(mapPL);
    },
    async update(id, patch) {
      const { sets, vals } = setParts(PL, patch, [id]);
      if (patch.updatedAt === undefined) sets.push('updated_at = now()');
      return one(`UPDATE purchased_licenses SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
    },
    /** Cambia la cantidad solo si sigue cubriendo lo ya asignado (RN-4.5). Devuelve null si no. */
    async setQuantity(id, quantity, updatedAt) {
      return one(
        'UPDATE purchased_licenses SET quantity = $2, updated_at = $3 WHERE id = $1 AND ($2::int IS NULL OR assigned <= $2::int) RETURNING *',
        [id, quantity, updatedAt],
      );
    },

    /**
     * RN-4.5: asigna de forma atómica. En UNA sentencia sube el contador solo si queda cupo y crea la asignación.
     * Devuelve { assignment } · { error: 'no_capacity' } · { error: 'duplicate' }.
     */
    async assign({ licenseId, targetType, targetUserId, targetName, assignedBy, assignedAt }) {
      try {
        const { rows } = await pool.query(
          `WITH upd AS (
             UPDATE purchased_licenses SET assigned = assigned + 1, updated_at = $6
             WHERE id = $1 AND is_active AND (quantity IS NULL OR assigned < quantity)
             RETURNING id
           )
           INSERT INTO license_assignments (license_id, target_type, target_user_id, target_name, assigned_by, assigned_at)
           SELECT upd.id, $2, $3, $4, $5, $6 FROM upd RETURNING *`,
          [licenseId, targetType, targetUserId ?? null, targetName, assignedBy, assignedAt],
        );
        return rows[0] ? { assignment: mapLA(rows[0]) } : { error: 'no_capacity' };
      } catch (err) {
        if (err.code === '23505') return { error: 'duplicate' };
        throw err;
      }
    },

    /** Libera una asignación vigente y devuelve el cupo en la misma sentencia. null si ya estaba liberada. */
    async release(assignmentId, { releasedBy, releasedAt, reason }) {
      const { rows } = await pool.query(
        `WITH rel AS (
           UPDATE license_assignments SET released_at = $2, released_by = $3, release_reason = $4
           WHERE id = $1 AND released_at IS NULL RETURNING *
         ), dec AS (
           UPDATE purchased_licenses p SET assigned = p.assigned - 1, updated_at = $2 FROM rel WHERE p.id = rel.license_id RETURNING p.id
         )
         SELECT rel.* FROM rel, dec`,
        [assignmentId, releasedAt, releasedBy, reason],
      );
      return mapLA(rows[0]) ?? null;
    },
  };
}

export function createLicenseAssignmentsRepo(pool) {
  return {
    async findById(id) {
      if (!/^\d+$/.test(String(id))) return null;
      return mapLA((await pool.query('SELECT * FROM license_assignments WHERE id = $1', [id])).rows[0]) ?? null;
    },
    async list(f = {}) {
      const w = whereBuilder();
      if (f.licenseId) w.add('license_id = ?::uuid', f.licenseId);
      if (f.active === true) w.add('released_at IS NULL');
      if (f.active === false) w.add('released_at IS NOT NULL');
      if (f.targetUserId) w.add('target_user_id = ?::uuid', f.targetUserId);
      const { rows } = await pool.query(`SELECT * FROM license_assignments WHERE ${w.sql} ORDER BY assigned_at DESC, id DESC`, w.vals);
      return rows.map(mapLA);
    },
  };
}

// ── Evidencias (HU-4.7) ─────────────────────────────────────────────────────────────
const EV = {
  title: 'title', kind: 'kind', classification: 'classification', version: 'version', url: 'url', storageKey: 'storage_key',
  fileName: 'file_name', fileMime: 'file_mime', fileSize: 'file_size', projectCode: 'project_code', componentId: 'component_id',
  licenseId: 'license_id', authorId: 'author_id', createdAt: 'created_at',
};
const mapEV = (r) =>
  r && {
    id: String(r.id), title: r.title, kind: r.kind, classification: r.classification, version: r.version, url: r.url,
    storageKey: r.storage_key, fileName: r.file_name, fileMime: r.file_mime, fileSize: r.file_size, projectCode: r.project_code,
    componentId: r.component_id, licenseId: r.license_id, authorId: r.author_id, createdAt: r.created_at,
  };

export function createEvidencesRepo(pool) {
  return {
    async create(d) {
      const { cols, ph, vals } = insertParts(EV, d);
      return mapEV((await pool.query(`INSERT INTO license_evidences (${cols}) VALUES (${ph}) RETURNING *`, vals)).rows[0]);
    },
    async findById(id) {
      if (!/^\d+$/.test(String(id))) return null;
      return mapEV((await pool.query('SELECT * FROM license_evidences WHERE id = $1', [id])).rows[0]) ?? null;
    },
    async list(f = {}) {
      const w = whereBuilder();
      if (f.classifications) w.add('classification = ANY(?::text[])', f.classifications);
      if (f.projectCode) w.add('(project_code = ? OR component_id IN (SELECT id FROM software_components WHERE project_code = ?))', f.projectCode, f.projectCode);
      if (f.componentId) w.add('component_id = ?::uuid', f.componentId);
      if (f.licenseId) w.add('license_id = ?::uuid', f.licenseId);
      if (f.kind) w.add('kind = ?', f.kind);
      if (f.q) w.add("title ILIKE ? ESCAPE '\\'", likeEscape(f.q));
      const total = (await pool.query(`SELECT count(*)::int AS n FROM license_evidences WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = f.limit ? w.page(f.limit, f.offset ?? 0) : '';
      const { rows } = await pool.query(`SELECT * FROM license_evidences WHERE ${w.sql} ORDER BY created_at DESC, id DESC ${page}`, w.vals);
      return { items: rows.map(mapEV), total };
    },
  };
}

// ── Alertas de cumplimiento (HU-4.6) ───────────────────────────────────────────────
const mapRule = (r) =>
  r && { kind: r.kind, daysBefore: r.days_before, criticality: r.criticality, dedupeDays: r.dedupe_days, isActive: r.is_active, updatedBy: r.updated_by, updatedAt: r.updated_at };
const mapAlert = (r) =>
  r && {
    id: String(r.id), kind: r.kind, criticality: r.criticality, entityType: r.entity_type, entityId: r.entity_id, title: r.title,
    detail: r.detail, dueOn: day(r.due_on), status: r.status, responsibleId: r.responsible_id, attendedAt: r.attended_at,
    attendedBy: r.attended_by, createdAt: r.created_at,
  };

export function createAlertRulesRepo(pool) {
  const one = async (sql, vals) => mapRule((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    create: ({ kind, daysBefore, criticality, dedupeDays, isActive }) =>
      one('INSERT INTO compliance_alert_rules (kind, days_before, criticality, dedupe_days, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [kind, daysBefore, criticality, dedupeDays, isActive]),
    findByKind: (kind) => one('SELECT * FROM compliance_alert_rules WHERE kind = $1', [kind]),
    async list() {
      return (await pool.query('SELECT * FROM compliance_alert_rules ORDER BY kind')).rows.map(mapRule);
    },
    update(kind, patch) {
      const { sets, vals } = setParts(
        { daysBefore: 'days_before', criticality: 'criticality', dedupeDays: 'dedupe_days', isActive: 'is_active', updatedBy: 'updated_by', updatedAt: 'updated_at' },
        patch, [kind],
      );
      return one(`UPDATE compliance_alert_rules SET ${sets.join(', ')} WHERE kind = $1 RETURNING *`, vals);
    },
  };
}

export function createComplianceAlertsRepo(pool) {
  const one = async (sql, vals) => mapAlert((await pool.query(sql, vals)).rows[0]) ?? null;
  return {
    /** RN-4.12: si ya hay una pendiente igual, no crea otra (índice único parcial). Devuelve null en ese caso. */
    createIfAbsent: ({ kind, criticality, entityType, entityId, title, detail, dueOn, createdAt }) =>
      one(
        `INSERT INTO compliance_alerts (kind, criticality, entity_type, entity_id, title, detail, due_on, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (kind, entity_type, entity_id) WHERE status = 'pendiente' DO NOTHING RETURNING *`,
        [kind, criticality, entityType, entityId, title, detail ?? '', dueOn, createdAt],
      ),
    findById: (id) => (/^\d+$/.test(String(id)) ? one('SELECT * FROM compliance_alerts WHERE id = $1', [id]) : null),
    /** Fecha de la última alerta (pendiente o atendida) de esa entidad y tipo: base de la ventana anti-repetición. */
    async lastCreatedAt(kind, entityType, entityId) {
      const { rows } = await pool.query(
        'SELECT max(created_at) AS at FROM compliance_alerts WHERE kind = $1 AND entity_type = $2 AND entity_id = $3',
        [kind, entityType, entityId],
      );
      return rows[0].at;
    },
    async list(f = {}) {
      const w = whereBuilder();
      if (f.status) w.add('status = ?', f.status);
      if (f.overdueOn) w.add("status = 'pendiente' AND due_on < ?::date", f.overdueOn);
      if (f.notOverdueOn) w.add('due_on >= ?::date', f.notOverdueOn);
      if (f.kind) w.add('kind = ?', f.kind);
      if (f.criticality) w.add('criticality = ?', f.criticality);
      if (f.responsibleId) w.add('responsible_id = ?::uuid', f.responsibleId);
      const total = (await pool.query(`SELECT count(*)::int AS n FROM compliance_alerts WHERE ${w.sql}`, w.vals)).rows[0].n;
      const page = f.limit ? w.page(f.limit, f.offset ?? 0) : '';
      const { rows } = await pool.query(
        `SELECT * FROM compliance_alerts WHERE ${w.sql}
         ORDER BY status DESC, CASE criticality WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, due_on, id ${page}`,
        w.vals,
      );
      return { items: rows.map(mapAlert), total };
    },
    async update(id, patch, { expectedStatus } = {}) {
      const { sets, vals } = setParts(
        { status: 'status', responsibleId: 'responsible_id', attendedAt: 'attended_at', attendedBy: 'attended_by' }, patch, [id],
      );
      let guard = '';
      if (expectedStatus) { vals.push(expectedStatus); guard = ` AND status = $${vals.length}`; }
      return one(`UPDATE compliance_alerts SET ${sets.join(', ')} WHERE id = $1${guard} RETURNING *`, vals);
    },
  };
}

export function createAlertEventsRepo(pool) {
  const map = (r) => ({ id: String(r.id), alertId: String(r.alert_id), kind: r.kind, comment: r.comment, actorId: r.actor_id, createdAt: r.created_at });
  return {
    async add({ alertId, kind, comment, actorId, createdAt }) {
      await pool.query('INSERT INTO compliance_alert_events (alert_id, kind, comment, actor_id, created_at) VALUES ($1, $2, $3, $4, $5)',
        [alertId, kind, comment ?? null, actorId ?? null, createdAt]);
    },
    async listByAlert(alertId) {
      const { rows } = await pool.query('SELECT * FROM compliance_alert_events WHERE alert_id = $1 ORDER BY created_at, id', [alertId]);
      return rows.map(map);
    },
  };
}
