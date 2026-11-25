// Gemelos en memoria de src/repositories/pg/licensing.js (mismo contrato) para las pruebas de la Épica 4.
// Replican también las restricciones de la base que las reglas de negocio necesitan (RN-4.4, RN-4.5, RN-4.12).
import { randomUUID } from 'node:crypto';

const copy = (o) => (o ? structuredClone(o) : null);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const t = (d) => new Date(d).getTime();
const lc = (s) => String(s).toLowerCase();

export function createLicensingMemoryRepos(users) {
  const T = { types: [], projects: [], components: [], reviews: [], licenses: [], assignments: [], evidences: [], rules: [], alerts: [], events: [] };
  let seq = 0;
  const next = () => ++seq;
  let licCode = 0;

  const licenseTypes = {
    async create(d) { const r = { id: next(), version: null, sourceUrl: null, verifiedOn: null, verifiedBy: null, isActive: true, ...clean(d), createdAt: new Date(), updatedAt: new Date() }; T.types.push(r); return copy(r); },
    async findById(id) { return copy(T.types.find((x) => String(x.id) === String(id)) ?? null); },
    async findBySpdx(spdx) { return copy(T.types.find((x) => lc(x.spdxId) === lc(spdx)) ?? null); },
    async list(f = {}) {
      return T.types.filter((x) => (!f.q || lc(x.spdxId).includes(lc(f.q)) || lc(x.name).includes(lc(f.q))) && (!f.category || x.category === f.category) &&
        (f.active === undefined || x.isActive === f.active)).sort((a, b) => a.spdxId.localeCompare(b.spdxId)).map(copy);
    },
    async update(id, patch) { const r = T.types.find((x) => String(x.id) === String(id)); if (!r) return null; Object.assign(r, clean(patch)); return copy(r); },
  };

  const softwareProjects = {
    async create(d) { T.projects.push({ repositoryUrl: null, ...clean(d) }); return copy(T.projects.at(-1)); },
    async findByCode(code) { return copy(T.projects.find((p) => p.code === code) ?? null); },
    async list() { return [...T.projects].sort((a, b) => a.name.localeCompare(b.name)).map(copy); },
  };

  const dupCount = (c) => T.components.filter((d) => d.id !== c.id && lc(d.name) === lc(c.name) && d.version === c.version).length;
  const components = {
    async create(d) {
      if (T.components.some((c) => c.projectCode === d.projectCode && lc(c.name) === lc(d.name) && c.version === d.version)) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      const r = { id: randomUUID(), ecosystem: null, repositoryUrl: null, declaredLicense: null, licenseId: null, isDirect: true, isDev: false, ...clean(d), updatedAt: d.addedAt };
      T.components.push(r);
      return copy(r);
    },
    async findById(id) { return copy(T.components.find((c) => c.id === id) ?? null); },
    async findInProject(p, name, version) { return copy(T.components.find((c) => c.projectCode === p && lc(c.name) === lc(name) && c.version === version) ?? null); },
    async findByNameVersion(name, version) { return T.components.filter((c) => lc(c.name) === lc(name) && c.version === version).map(copy); },
    async list(f = {}) {
      const items = T.components.filter((c) => (!f.projectCode || c.projectCode === f.projectCode) && (!f.q || lc(c.name).includes(lc(f.q))) &&
        (!f.statuses?.length || f.statuses.includes(c.licenseStatus)) && (!f.licenseIds?.length || f.licenseIds.includes(c.licenseId)) &&
        (f.isDirect === undefined || c.isDirect === f.isDirect) && (f.isDev === undefined || c.isDev === f.isDev) && (!f.ids || f.ids.includes(c.id)))
        .sort((a, b) => a.projectCode.localeCompare(b.projectCode) || lc(a.name).localeCompare(lc(b.name)) || a.version.localeCompare(b.version));
      const page = f.limit ? items.slice(f.offset ?? 0, (f.offset ?? 0) + f.limit) : items;
      return { items: page.map((c) => ({ ...copy(c), duplicates: dupCount(c) })), total: items.length };
    },
    async update(id, patch) { const r = T.components.find((c) => c.id === id); if (!r) return null; Object.assign(r, clean(patch)); return copy(r); },
  };

  const componentReviews = {
    async add(d) { const r = Object.freeze({ id: String(next()), licenseId: null, evidenceId: null, ...clean(d) }); T.reviews.push(r); return { ...r }; },
    async listByComponent(id) { return T.reviews.filter((r) => r.componentId === id).sort((a, b) => t(b.createdAt) - t(a.createdAt) || b.id - a.id).map((r) => ({ ...r })); },
    async latestFor(ids) {
      const out = new Map();
      for (const id of ids) { const [first] = await componentReviews.listByComponent(id); if (first) out.set(id, first); }
      return out;
    },
  };

  const purchasedLicenses = {
    async create(d) {
      const r = { id: randomUUID(), code: `LIC-${String(++licCode).padStart(4, '0')}`, edition: null, quantity: null, assigned: 0, expiresOn: null, alertDays: 30,
        licenseKey: null, contractRef: null, notes: null, isActive: true, ...clean(d), updatedAt: d.createdAt };
      T.licenses.push(r);
      return copy(r);
    },
    async findById(id) { return copy(T.licenses.find((l) => l.id === id || l.code === String(id).toUpperCase()) ?? null); },
    async list(f = {}) {
      return T.licenses.filter((l) => (!f.q || [l.vendor, l.product, l.code].some((v) => lc(v).includes(lc(f.q)))) && (!f.vendor || lc(l.vendor) === lc(f.vendor)) &&
        (f.active === undefined || l.isActive === f.active)).sort((a, b) => a.vendor.localeCompare(b.vendor) || a.product.localeCompare(b.product)).map(copy);
    },
    async update(id, patch) { const r = T.licenses.find((l) => l.id === id); if (!r) return null; Object.assign(r, clean(patch)); return copy(r); },
    async setQuantity(id, quantity, updatedAt) {
      const r = T.licenses.find((l) => l.id === id);
      if (!r || (quantity !== null && r.assigned > quantity)) return null;
      Object.assign(r, { quantity, updatedAt });
      return copy(r);
    },
    async assign({ licenseId, targetType, targetUserId, targetName, assignedBy, assignedAt }) {
      const l = T.licenses.find((x) => x.id === licenseId);
      if (!l || !l.isActive || (l.quantity !== null && l.assigned >= l.quantity)) return { error: 'no_capacity' };
      const key = (x) => x.targetUserId ?? lc(x.targetName);
      if (T.assignments.some((a) => a.licenseId === licenseId && !a.releasedAt && a.targetType === targetType && key(a) === key({ targetUserId, targetName }))) {
        return { error: 'duplicate' };
      }
      l.assigned += 1;
      const a = { id: String(next()), licenseId, targetType, targetUserId: targetUserId ?? null, targetName, assignedBy, assignedAt, releasedAt: null, releasedBy: null, releaseReason: null };
      T.assignments.push(a);
      return { assignment: copy(a) };
    },
    async release(id, { releasedBy, releasedAt, reason }) {
      const a = T.assignments.find((x) => x.id === String(id));
      if (!a || a.releasedAt) return null;
      Object.assign(a, { releasedAt, releasedBy, releaseReason: reason });
      T.licenses.find((l) => l.id === a.licenseId).assigned -= 1;
      return copy(a);
    },
  };

  const licenseAssignments = {
    async findById(id) { return copy(T.assignments.find((a) => a.id === String(id)) ?? null); },
    async list(f = {}) {
      return T.assignments.filter((a) => (!f.licenseId || a.licenseId === f.licenseId) && (f.active === undefined || !a.releasedAt === f.active) &&
        (!f.targetUserId || a.targetUserId === f.targetUserId)).sort((a, b) => t(b.assignedAt) - t(a.assignedAt) || b.id - a.id).map(copy);
    },
  };

  const evidences = {
    async create(d) { const r = Object.freeze({ id: String(next()), version: '1', url: null, storageKey: null, fileName: null, fileMime: null, fileSize: null, projectCode: null, componentId: null, licenseId: null, ...clean(d) }); T.evidences.push(r); return { ...r }; },
    async findById(id) { const r = T.evidences.find((e) => e.id === String(id)); return r ? { ...r } : null; },
    async list(f = {}) {
      const inProject = (e) => e.projectCode === f.projectCode || T.components.some((c) => c.id === e.componentId && c.projectCode === f.projectCode);
      const items = T.evidences.filter((e) => (!f.classifications || f.classifications.includes(e.classification)) && (!f.projectCode || inProject(e)) &&
        (!f.componentId || e.componentId === f.componentId) && (!f.licenseId || e.licenseId === f.licenseId) && (!f.kind || e.kind === f.kind) &&
        (!f.q || lc(e.title).includes(lc(f.q)))).sort((a, b) => t(b.createdAt) - t(a.createdAt) || b.id - a.id);
      const page = f.limit ? items.slice(f.offset ?? 0, (f.offset ?? 0) + f.limit) : items;
      return { items: page.map((e) => ({ ...e })), total: items.length };
    },
  };

  const alertRules = {
    async create(d) { T.rules.push({ updatedBy: null, updatedAt: new Date(), ...clean(d) }); return copy(T.rules.at(-1)); },
    async findByKind(kind) { return copy(T.rules.find((r) => r.kind === kind) ?? null); },
    async list() { return [...T.rules].sort((a, b) => a.kind.localeCompare(b.kind)).map(copy); },
    async update(kind, patch) { const r = T.rules.find((x) => x.kind === kind); if (!r) return null; Object.assign(r, clean(patch)); return copy(r); },
  };

  const RANK = { critica: 0, alta: 1, media: 2, baja: 3 };
  const complianceAlerts = {
    async createIfAbsent(d) {
      if (T.alerts.some((a) => a.status === 'pendiente' && a.kind === d.kind && a.entityType === d.entityType && a.entityId === d.entityId)) return null;
      const r = { id: String(next()), detail: '', status: 'pendiente', responsibleId: null, attendedAt: null, attendedBy: null, ...clean(d) };
      T.alerts.push(r);
      return copy(r);
    },
    async findById(id) { return copy(T.alerts.find((a) => a.id === String(id)) ?? null); },
    async lastCreatedAt(kind, entityType, entityId) {
      const hits = T.alerts.filter((a) => a.kind === kind && a.entityType === entityType && a.entityId === entityId);
      return hits.length ? new Date(Math.max(...hits.map((a) => t(a.createdAt)))) : null;
    },
    async list(f = {}) {
      const items = T.alerts.filter((a) => (!f.status || a.status === f.status) && (!f.overdueOn || (a.status === 'pendiente' && a.dueOn < f.overdueOn)) &&
        (!f.notOverdueOn || a.dueOn >= f.notOverdueOn) && (!f.kind || a.kind === f.kind) && (!f.criticality || a.criticality === f.criticality) &&
        (!f.responsibleId || a.responsibleId === f.responsibleId))
        .sort((a, b) => b.status.localeCompare(a.status) || RANK[a.criticality] - RANK[b.criticality] || a.dueOn.localeCompare(b.dueOn) || a.id - b.id);
      const page = f.limit ? items.slice(f.offset ?? 0, (f.offset ?? 0) + f.limit) : items;
      return { items: page.map(copy), total: items.length };
    },
    async update(id, patch, { expectedStatus } = {}) {
      const r = T.alerts.find((a) => a.id === String(id));
      if (!r || (expectedStatus && r.status !== expectedStatus)) return null;
      Object.assign(r, clean(patch));
      return copy(r);
    },
  };

  const alertEvents = {
    async add(d) { T.events.push(Object.freeze({ id: String(next()), comment: null, actorId: null, ...clean(d), alertId: String(d.alertId) })); },
    async listByAlert(id) { return T.events.filter((e) => e.alertId === String(id)).map((e) => ({ ...e })); },
  };

  return { licenseTypes, softwareProjects, components, componentReviews, purchasedLicenses, licenseAssignments, evidences, alertRules, complianceAlerts, alertEvents };
}
