// Épica 4 — HU-4.1 catálogo de licencias · HU-4.2 inventario de software · HU-4.5 revisión de obligaciones Open Source.
import {
  CLOSING_DECISIONS,
  COMPONENT_KINDS,
  COMPONENT_LICENSE_STATUSES,
  LICENSE_CATEGORIES,
  PERMISSION_LEVELS,
  REVIEW_DECISIONS,
  compatibilityFlags,
  keysOf,
  labelOf,
  packagesFromLockfile,
  parseSpdxExpression,
} from '../domain/licensing.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { intInRange, optionalText, requireText } from '../lib/validate.js';

const SPDX_RE = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;
const MAX_IMPORT = 3000;

export function oneOf(v, list, field, what) {
  if (!keysOf(list).includes(v)) throw badRequest(`invalid_${field}`, `${what} debe ser una de: ${list.map((x) => x.label).join(', ')}.`);
  return v;
}
export function optionalUrl(v, field = 'url', label = 'El enlace') {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  let u;
  try { u = new URL(s); } catch { u = null; }
  if (!u || !['http:', 'https:'].includes(u.protocol) || s.length > 500) throw badRequest(`invalid_${field}`, `${label} debe ser una dirección http(s) válida.`);
  return s;
}
export function dateOrThrow(v, field, label, { optional = false } = {}) {
  if (optional && (v === undefined || v === null || v === '')) return null;
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw badRequest(`invalid_${field}`, `${label} debe tener el formato AAAA-MM-DD.`);
  return s;
}
const bool = (v, field) => {
  if (typeof v !== 'boolean') throw badRequest(`invalid_${field}`, `${field} debe ser verdadero o falso.`);
  return v;
};

export function createSoftwareService({ repos, ctx, changeLog, clock = () => new Date() }) {
  const today = () => clock().toISOString().slice(0, 10);

  // ── HU-4.1 Catálogo de licencias ───────────────────────────────────────────────
  const viewLicense = (l) => l && { ...l, categoryLabel: labelOf(LICENSE_CATEGORIES, l.category) };
  async function loadLicenseType(id) {
    const l = /^\d+$/.test(String(id)) ? await repos.licenseTypes.findById(id) : await repos.licenseTypes.findBySpdx(String(id));
    if (!l) throw notFound('license_type_not_found', 'Licencia no encontrada en el catálogo.');
    return l;
  }

  function licenseFields(body, { partial }) {
    const out = {};
    const has = (k) => body[k] !== undefined;
    if (!partial || has('name')) out.name = requireText(body.name, { field: 'name', label: 'El nombre', min: 2, max: 120 });
    if (!partial || has('version')) out.version = optionalText(body.version, { field: 'version', label: 'La versión', max: 20 });
    if (!partial || has('category')) out.category = oneOf(body.category, LICENSE_CATEGORIES, 'category', 'La categoría');
    if (!partial || has('sourceUrl')) out.sourceUrl = optionalUrl(body.sourceUrl, 'source_url', 'La fuente');
    if (!partial || has('obligations')) out.obligations = requireText(body.obligations, { field: 'obligations', label: 'El resumen de obligaciones', min: 3, max: 2000 });
    if (!partial || has('requiresAttribution')) out.requiresAttribution = bool(body.requiresAttribution ?? false, 'requiresAttribution');
    if (!partial || has('redistribution')) out.redistribution = oneOf(body.redistribution, PERMISSION_LEVELS, 'redistribution', 'La redistribución');
    if (!partial || has('modification')) out.modification = oneOf(body.modification, PERMISSION_LEVELS, 'modification', 'La modificación');
    if (!partial || has('restrictions')) out.restrictions = optionalText(body.restrictions, { field: 'restrictions', label: 'Las restricciones', max: 2000 }) ?? '';
    return out;
  }

  // ── HU-4.2 Inventario ──────────────────────────────────────────────────────────
  async function loadComponent(id) {
    const c = await repos.components.findById(String(id ?? ''));
    if (!c) throw notFound('component_not_found', 'Componente no encontrado.');
    return c;
  }
  async function loadProject(code) {
    const p = await repos.softwareProjects.findByCode(String(code ?? ''));
    if (!p) throw badRequest('invalid_project', 'El proyecto no existe.');
    return p;
  }

  /** RN-4.3: de lo declarado en el manifest a (licencia, estado). Solo un identificador conocido se confirma. */
  async function resolveDeclared(declared) {
    const ids = parseSpdxExpression(declared);
    if (!ids.length) return { licenseId: null, licenseStatus: 'sin_licencia' };
    if (ids.length > 1) return { licenseId: null, licenseStatus: 'pendiente' };
    const lic = await repos.licenseTypes.findBySpdx(ids[0]);
    return lic?.isActive ? { licenseId: lic.id, licenseStatus: 'confirmada' } : { licenseId: null, licenseStatus: 'pendiente' };
  }

  /** Datos para la API: licencia, última revisión, alertas de compatibilidad y duplicados. */
  async function serializeComponents(list) {
    const types = new Map((await repos.licenseTypes.list()).map((l) => [l.id, l]));
    const projects = new Map((await repos.softwareProjects.list()).map((p) => [p.code, p]));
    const latest = await repos.componentReviews.latestFor(list.map((c) => c.id));
    const names = await ctx.userNames(list.map((c) => c.addedBy));
    return list.map((c) => {
      const lic = c.licenseId ? types.get(c.licenseId) : null;
      const project = projects.get(c.projectCode);
      const review = latest.get(c.id) ?? null;
      const flags = compatibilityFlags({ componentCategory: lic?.category ?? null, projectCategory: types.get(project?.licenseId)?.category, isDev: c.isDev });
      return {
        ...c,
        kindLabel: labelOf(COMPONENT_KINDS, c.kind),
        licenseStatusLabel: labelOf(COMPONENT_LICENSE_STATUSES, c.licenseStatus),
        license: lic ? { id: lic.id, spdxId: lic.spdxId, name: lic.name, category: lic.category, categoryLabel: labelOf(LICENSE_CATEGORIES, lic.category) } : null,
        project: project ? { code: project.code, name: project.name } : null,
        addedByName: names.get(c.addedBy) ?? null,
        latestReview: review && { ...review, decisionLabel: labelOf(REVIEW_DECISIONS, review.decision) },
        reviewClosed: Boolean(review && CLOSING_DECISIONS.includes(review.decision)),
        flags,
        duplicates: c.duplicates ?? 0,
      };
    });
  }

  function componentFilters(query) {
    const f = {};
    if (query.project) f.projectCode = String(query.project);
    if (query.q) f.q = String(query.q).trim().slice(0, 80);
    if (query.status) {
      f.statuses = String(query.status).split(',').filter(Boolean);
      for (const s of f.statuses) oneOf(s, COMPONENT_LICENSE_STATUSES, 'status', 'El estado');
    }
    if (query.direct === '1') f.isDirect = true;
    if (query.dev === '0') f.isDev = false;
    if (query.dev === '1') f.isDev = true;
    return f;
  }

  return {
    meta: async () => ({
      licenseCategories: LICENSE_CATEGORIES, permissionLevels: PERMISSION_LEVELS, componentStatuses: COMPONENT_LICENSE_STATUSES,
      componentKinds: COMPONENT_KINDS, reviewDecisions: REVIEW_DECISIONS, projects: await repos.softwareProjects.list(),
    }),

    async listLicenseTypes(query = {}) {
      const f = {};
      if (query.q) f.q = String(query.q).trim().slice(0, 60);
      if (query.category) f.category = oneOf(query.category, LICENSE_CATEGORIES, 'category', 'La categoría');
      if (query.active !== 'all') f.active = query.active !== 'false';
      const items = await repos.licenseTypes.list(f);
      const used = new Map();
      for (const l of items) used.set(l.id, (await repos.components.list({ licenseIds: [l.id], limit: 1 })).total);
      return { items: items.map((l) => ({ ...viewLicense(l), components: used.get(l.id) })) };
    },

    async getLicenseType(id) {
      const l = await loadLicenseType(id);
      const { items } = await repos.components.list({ licenseIds: [l.id], limit: 200 });
      return { license: viewLicense(l), components: await serializeComponents(items) };
    },

    async createLicenseType(actor, body = {}) {
      return changeLog.track(actor, { entity: 'license_type', action: 'create' }, async () => {
        const spdxId = String(body.spdxId ?? '').trim();
        if (!SPDX_RE.test(spdxId)) throw badRequest('invalid_spdx_id', 'El identificador debe ser un código SPDX (p. ej. MIT, GPL-3.0-only) o LicenseRef-…');
        if (await repos.licenseTypes.findBySpdx(spdxId)) throw conflict('license_type_exists', 'Esa licencia ya está en el catálogo.');
        const fields = licenseFields(body, { partial: false });
        const verifiedOn = dateOrThrow(body.verifiedOn, 'verified_on', 'La fecha de verificación', { optional: true });
        // RN-4.2: verificar exige una fuente (salvo licencias propias LicenseRef-…).
        if (verifiedOn && !fields.sourceUrl && !spdxId.startsWith('LicenseRef-')) throw badRequest('source_required', 'Para marcar la licencia como verificada indica la fuente consultada.');
        if (verifiedOn && verifiedOn > today()) throw badRequest('invalid_verified_on', 'La fecha de verificación no puede ser futura.');
        const l = await repos.licenseTypes.create({ spdxId, ...fields, verifiedOn, verifiedBy: verifiedOn ? actor.user.id : null, isActive: true });
        return { value: viewLicense(l), entityId: l.id, newValues: { spdxId, ...fields, verifiedOn } };
      });
    },

    /** RN-4.2: si cambian las condiciones y no se indica una nueva verificación, la licencia vuelve a «sin verificar». */
    async updateLicenseType(actor, id, body = {}) {
      const l = await loadLicenseType(id);
      return changeLog.track(actor, { entity: 'license_type', action: 'update', entityId: l.id }, async () => {
        const patch = licenseFields(body, { partial: true });
        if (body.isActive !== undefined) patch.isActive = bool(body.isActive, 'isActive');
        const conditionsChanged = ['category', 'obligations', 'requiresAttribution', 'redistribution', 'modification', 'restrictions']
          .some((k) => patch[k] !== undefined && patch[k] !== l[k]);
        if (body.verifiedOn !== undefined) {
          patch.verifiedOn = dateOrThrow(body.verifiedOn, 'verified_on', 'La fecha de verificación', { optional: true });
          if (patch.verifiedOn && patch.verifiedOn > today()) throw badRequest('invalid_verified_on', 'La fecha de verificación no puede ser futura.');
          patch.verifiedBy = patch.verifiedOn ? actor.user.id : null;
        } else if (conditionsChanged) {
          patch.verifiedOn = null;
          patch.verifiedBy = null;
        }
        const source = patch.sourceUrl !== undefined ? patch.sourceUrl : l.sourceUrl;
        if (patch.verifiedOn && !source && !l.spdxId.startsWith('LicenseRef-')) throw badRequest('source_required', 'Para marcar la licencia como verificada indica la fuente consultada.');
        if (!Object.keys(patch).length) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const updated = await repos.licenseTypes.update(l.id, { ...patch, updatedAt: clock() });
        const pick = ({ createdAt, updatedAt, id: _id, ...rest }) => rest;
        return { value: viewLicense(updated), oldValues: pick(l), newValues: pick(updated) };
      });
    },

    // ── HU-4.2 ───────────────────────────────────────────────────────────────────
    async listComponents(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 50, min: 1, max: 500 });
      const f = componentFilters(query);
      if (query.category) {
        oneOf(query.category, LICENSE_CATEGORIES, 'category', 'La categoría');
        f.licenseIds = (await repos.licenseTypes.list({ category: query.category })).map((l) => l.id);
        if (!f.licenseIds.length) return { items: [], total: 0, page, limit };
      }
      // Filtros calculados (marcas de compatibilidad, revisión pendiente): se evalúan sobre el conjunto filtrado.
      if (query.flagged === '1' || query.unreviewed === '1') {
        const all = await serializeComponents((await repos.components.list(f)).items);
        const hits = all.filter((c) => (query.flagged !== '1' || c.flags.length) && (query.unreviewed !== '1' || !c.reviewClosed));
        return { items: hits.slice((page - 1) * limit, page * limit), total: hits.length, page, limit };
      }
      const { items, total } = await repos.components.list({ ...f, limit, offset: (page - 1) * limit });
      return { items: await serializeComponents(items), total, page, limit };
    },

    async getComponent(id) {
      const c = await loadComponent(id);
      const dups = (await repos.components.findByNameVersion(c.name, c.version)).filter((d) => d.id !== c.id);
      const [value] = await serializeComponents([{ ...c, duplicates: dups.length }]);
      const reviews = await repos.componentReviews.listByComponent(c.id);
      const names = await ctx.userNames(reviews.map((r) => r.reviewerId));
      const types = new Map((await repos.licenseTypes.list()).map((l) => [l.id, l]));
      return {
        component: value,
        reviews: reviews.map((r) => ({ ...r, decisionLabel: labelOf(REVIEW_DECISIONS, r.decision), reviewerName: names.get(r.reviewerId), license: r.licenseId ? types.get(r.licenseId)?.spdxId : null })),
        potentialDuplicates: dups.map((d) => ({ id: d.id, projectCode: d.projectCode, name: d.name, version: d.version })),
      };
    },

    /** HU-4.2: registro manual. Sin licencia elegida queda «revisión pendiente» (o «sin licencia» si no se declaró ninguna). */
    async createComponent(actor, body = {}) {
      return changeLog.track(actor, { entity: 'component', action: 'create' }, async () => {
        const project = await loadProject(body.projectCode);
        const name = requireText(body.name, { field: 'name', label: 'El nombre', min: 1, max: 214 });
        const version = requireText(body.version, { field: 'version', label: 'La versión', min: 1, max: 64 });
        const kind = oneOf(body.kind, COMPONENT_KINDS, 'kind', 'El tipo');
        const repositoryUrl = optionalUrl(body.repositoryUrl, 'repository_url', 'El repositorio');
        const declaredLicense = optionalText(body.declaredLicense, { field: 'declared_license', label: 'La licencia declarada', max: 200 });
        let licenseId = null;
        let licenseStatus = declaredLicense ? 'pendiente' : 'sin_licencia';
        if (body.licenseId !== undefined && body.licenseId !== null && body.licenseId !== '') {
          const lic = await loadLicenseType(body.licenseId);
          if (!lic.isActive) throw badRequest('license_type_inactive', 'Esa licencia está desactivada en el catálogo.');
          licenseId = lic.id;
          licenseStatus = 'confirmada';
        }
        if (await repos.components.findInProject(project.code, name, version)) {
          throw conflict('component_exists', `${name} ${version} ya está registrado en ${project.name}.`);
        }
        const dups = await repos.components.findByNameVersion(name, version);
        const c = await repos.components.create({
          projectCode: project.code, name, version, kind, ecosystem: optionalText(body.ecosystem, { field: 'ecosystem', label: 'El ecosistema', max: 30 }),
          repositoryUrl, declaredLicense, licenseId, licenseStatus, isDirect: true, isDev: Boolean(body.isDev), addedBy: actor.user.id, addedAt: clock(),
        });
        const [value] = await serializeComponents([{ ...c, duplicates: dups.length }]);
        return {
          value: { component: value, potentialDuplicates: dups.map((d) => ({ id: d.id, projectCode: d.projectCode, name: d.name, version: d.version })) },
          entityId: c.id,
          newValues: { projectCode: project.code, name, version, kind, licenseStatus, licenseId },
        };
      });
    },

    /** Asociar o quitar la licencia de un componente (confirmar o devolver a revisión). */
    async updateComponent(actor, id, body = {}) {
      const c = await loadComponent(id);
      return changeLog.track(actor, { entity: 'component', action: 'update', entityId: c.id }, async () => {
        const patch = {};
        if (body.licenseId !== undefined) {
          if (body.licenseId === null || body.licenseId === '') {
            patch.licenseId = null;
            patch.licenseStatus = c.declaredLicense ? 'pendiente' : 'sin_licencia';
          } else {
            const lic = await loadLicenseType(body.licenseId);
            if (!lic.isActive) throw badRequest('license_type_inactive', 'Esa licencia está desactivada en el catálogo.');
            patch.licenseId = lic.id;
            patch.licenseStatus = 'confirmada';
          }
        }
        if (body.repositoryUrl !== undefined) patch.repositoryUrl = optionalUrl(body.repositoryUrl, 'repository_url', 'El repositorio');
        if (body.kind !== undefined) patch.kind = oneOf(body.kind, COMPONENT_KINDS, 'kind', 'El tipo');
        if (!Object.keys(patch).length) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const updated = await repos.components.update(c.id, { ...patch, updatedAt: clock() });
        const pick = (x) => ({ licenseId: x.licenseId, licenseStatus: x.licenseStatus, repositoryUrl: x.repositoryUrl, kind: x.kind });
        const [value] = await serializeComponents([updated]);
        return { value, oldValues: pick(c), newValues: pick(updated) };
      });
    },

    /**
     * Importa un package-lock.json (respuesta a la pregunta de refinamiento sobre manifests).
     * Por defecto solo las dependencias directas; `includeTransitive` agrega todo el árbol.
     */
    async importLockfile(actor, body = {}) {
      const project = await loadProject(body.projectCode);
      return changeLog.track(actor, { entity: 'component', action: 'import', entityId: project.code }, async () => {
        const packages = packagesFromLockfile(body.lockfile);
        if (!packages) throw badRequest('invalid_lockfile', 'El archivo no es un package-lock.json válido (versión 2 o 3).');
        const selected = body.includeTransitive ? packages : packages.filter((p) => p.isDirect);
        if (selected.length > MAX_IMPORT) throw badRequest('too_many_packages', `Se pueden importar hasta ${MAX_IMPORT} paquetes por vez.`);
        const summary = { projectCode: project.code, read: packages.length, considered: selected.length, created: 0, existing: 0, confirmed: 0, pending: 0, withoutLicense: 0 };
        const now = clock();
        for (const p of selected) {
          if (await repos.components.findInProject(project.code, p.name, p.version)) { summary.existing += 1; continue; }
          const { licenseId, licenseStatus } = await resolveDeclared(p.license);
          await repos.components.create({
            projectCode: project.code, name: p.name, version: p.version, kind: 'libreria', ecosystem: 'npm', repositoryUrl: p.repositoryUrl,
            declaredLicense: p.license, licenseId, licenseStatus, isDirect: p.isDirect, isDev: p.isDev, addedBy: actor.user.id, addedAt: now,
          });
          summary.created += 1;
          if (licenseStatus === 'confirmada') summary.confirmed += 1;
          else if (licenseStatus === 'pendiente') summary.pending += 1;
          else summary.withoutLicense += 1;
        }
        return { value: summary, newValues: summary };
      });
    },

    // ── HU-4.5 Revisión de obligaciones ────────────────────────────────────────────
    /**
     * Registra la evaluación de un componente en su versión actual. RN-4.7: decisión, obligaciones, evaluación y revisor
     * son obligatorios; la evidencia es opcional pero debe existir. Si el revisor fija la licencia, se confirma.
     */
    async review(actor, id, body = {}) {
      const c = await loadComponent(id);
      return changeLog.track(actor, { entity: 'component_review', action: 'create', entityId: c.id }, async () => {
        const decision = oneOf(body.decision, REVIEW_DECISIONS, 'decision', 'La decisión');
        const obligations = requireText(body.obligations, { field: 'obligations', label: 'Las obligaciones', min: 3, max: 2000 });
        const evaluation = requireText(body.evaluation, { field: 'evaluation', label: 'La evaluación', min: 10, max: 4000 });
        let licenseId = c.licenseId;
        if (body.licenseId !== undefined && body.licenseId !== null && body.licenseId !== '') licenseId = (await loadLicenseType(body.licenseId)).id;
        if (decision !== 'requiere_revision' && decision !== 'rechazado' && !licenseId) {
          throw badRequest('license_required', 'Para aprobar un componente indica qué licencia aplica.');
        }
        let evidenceId = null;
        if (body.evidenceId !== undefined && body.evidenceId !== null && body.evidenceId !== '') {
          const ev = await repos.evidences.findById(body.evidenceId);
          if (!ev) throw badRequest('invalid_evidence', 'La evidencia indicada no existe.');
          evidenceId = ev.id;
        }
        const r = await repos.componentReviews.add({
          componentId: c.id, version: c.version, decision, obligations, evaluation, licenseId, evidenceId, reviewerId: actor.user.id, createdAt: clock(),
        });
        if (licenseId && licenseId !== c.licenseId && CLOSING_DECISIONS.includes(decision)) {
          await repos.components.update(c.id, { licenseId, licenseStatus: 'confirmada', updatedAt: clock() });
        }
        return { value: await this.getComponent(c.id), entityId: r.id, newValues: { componentId: c.id, version: c.version, decision, licenseId, evidenceId } };
      });
    },

    serializeComponents,
  };
}
