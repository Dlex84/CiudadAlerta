// Repositorios en memoria con el MISMO contrato que src/repositories/pg/*.
// Permiten probar servicios y API completa sin PostgreSQL.
import { randomUUID } from 'node:crypto';
import { CLOSED_STATUSES } from '../../src/domain/operations.js';
import { conflict } from '../../src/http/errors.js';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function createMemoryRepos() {
  const db = { users: new Map(), roles: new Map(), perms: new Map(), sessions: new Map(), logs: [], tokens: new Map() };
  let roleSeq = 0;
  let logSeq = 0;

  const users = {
    async findById(id) {
      const u = db.users.get(id);
      return u && !u.deletedAt ? { ...u } : null;
    },
    async findByEmail(email) {
      const e = email.toLowerCase();
      for (const u of db.users.values()) if (!u.deletedAt && u.email.toLowerCase() === e) return { ...u };
      return null;
    },
    async list({ q, status, roleId, limit, offset }) {
      let items = [...db.users.values()].filter((u) => !u.deletedAt).reverse();
      if (q) items = items.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
      if (status) items = items.filter((u) => u.status === status);
      if (roleId) items = items.filter((u) => u.roleId === roleId);
      return { items: items.slice(offset, offset + limit).map((u) => ({ ...u })), total: items.length };
    },
    async create(data) {
      if (await this.findByEmail(data.email)) throw conflict('email_taken', 'Ya existe un usuario con ese correo electrónico.');
      const now = new Date();
      const u = {
        id: randomUUID(), phone: null, sector: null, photoUrl: null, passwordHash: null, status: 'active',
        blockedReason: null, blockedAt: null, blockedBy: null, lastLoginAt: null, profileUpdatedAt: null,
        createdBy: null, deletedAt: null, ...clean(data), createdAt: now, updatedAt: now,
      };
      db.users.set(u.id, u);
      return { ...u };
    },
    async update(id, patch) {
      const u = db.users.get(id);
      if (!u || u.deletedAt) return null;
      Object.assign(u, clean(patch), { updatedAt: new Date() });
      return { ...u };
    },
    async countByRole(roleId, { onlyActive = false } = {}) {
      return [...db.users.values()].filter((u) => !u.deletedAt && u.roleId === roleId && (!onlyActive || u.status === 'active')).length;
    },
  };

  const roles = {
    async list() { return [...db.roles.values()].map((r) => ({ ...r })); },
    async findById(id) { const r = db.roles.get(id); return r ? { ...r } : null; },
    async findByCode(code) { return [...db.roles.values()].find((r) => r.code === code) ?? null; },
    async findByName(name) { return [...db.roles.values()].find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null; },
    async create({ code = null, name, description = '', dashboardPath, isActive, isSystem }) {
      if (await this.findByName(name)) throw conflict('role_name_taken', 'Ya existe un rol con ese nombre.');
      const r = { id: ++roleSeq, code, name, description, dashboardPath, isActive, isSystem, createdAt: new Date(), updatedAt: new Date() };
      db.roles.set(r.id, r);
      return { ...r };
    },
    async update(id, patch) {
      const r = db.roles.get(id);
      Object.assign(r, clean(patch), { updatedAt: new Date() });
      return { ...r };
    },
    async delete(id) { db.roles.delete(id); db.perms.delete(id); },
    async getPermissions(roleId) { return (db.perms.get(roleId) ?? []).map((p) => ({ ...p })); },
    async setPermissions(roleId, rows) { db.perms.set(roleId, rows.map((p) => ({ ...p }))); },
  };

  const sessions = {
    async create({ userId, tokenHash, ip, userAgent, expiresAt }) {
      const s = { id: randomUUID(), userId, tokenHash, ip, userAgent, createdAt: new Date(), expiresAt, revokedAt: null };
      db.sessions.set(s.id, s);
      return { ...s };
    },
    async findByTokenHash(h) { const s = [...db.sessions.values()].find((x) => x.tokenHash === h); return s ? { ...s } : null; },
    async revoke(id) { const s = db.sessions.get(id); if (s && !s.revokedAt) s.revokedAt = new Date(); },
    async revokeAllForUser(userId, exceptId = null) {
      for (const s of db.sessions.values()) if (s.userId === userId && !s.revokedAt && s.id !== exceptId) s.revokedAt = new Date();
    },
  };

  const accessLogs = {
    async create(e) { db.logs.push({ id: String(++logSeq), ...e }); },
    async search({ userId, email, event, ip, from, to, limit, offset }) {
      let items = db.logs.filter((l) => (!userId || l.userId === userId) && (!email || (l.email ?? '').includes(email)) &&
        (!event || l.event === event) && (!ip || l.ip === ip) && (!from || l.createdAt >= from) && (!to || l.createdAt <= to));
      items = [...items].reverse();
      return { items: items.slice(offset, offset + limit).map((l) => ({ ...l, email: l.email })), total: items.length };
    },
  };

  const resetTokens = {
    async create({ userId, tokenHash, purpose, expiresAt }) {
      const t = { id: randomUUID(), userId, tokenHash, purpose, expiresAt, usedAt: null, createdAt: new Date() };
      db.tokens.set(t.id, t);
      return { ...t };
    },
    async findByTokenHash(h) { const t = [...db.tokens.values()].find((x) => x.tokenHash === h); return t ? { ...t } : null; },
    async markUsed(id) { const t = db.tokens.get(id); if (!t || t.usedAt) return false; t.usedAt = new Date(); return true; },
    async invalidateAllForUser(userId) { for (const t of db.tokens.values()) if (t.userId === userId && !t.usedAt) t.usedAt = new Date(); },
  };

  return { users, roles, sessions, accessLogs, resetTokens, ...createOperationsMemoryRepos(), _db: db };
}

// ── Épica 2 ──────────────────────────────────────────────────────────────────────
const copy = (o) => (o ? structuredClone(o) : null);
const byCreatedDesc = (a, b) => b.createdAt - a.createdAt || Number(b.seq) - Number(a.seq);
const strip = ({ seq, ...rest }) => rest;
const t = (d) => new Date(d).getTime();

/** Mismos filtros que reportWhere() en src/repositories/pg/reports.js. */
function reportMatches(r, f) {
  if (f.statuses?.length && !f.statuses.includes(r.status)) return false;
  if (f.typeCode && r.typeCode !== f.typeCode) return false;
  if (f.assigneeId && r.assigneeId !== f.assigneeId) return false;
  if (f.unassigned && r.assigneeId) return false;
  if (f.createdBy && r.createdBy !== f.createdBy) return false;
  if (f.from && t(r.createdAt) < t(f.from)) return false;
  if (f.to && t(r.createdAt) > t(f.to)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (![r.code, r.title, r.location].some((v) => v.toLowerCase().includes(q))) return false;
  }
  if (f.overdueAt && (CLOSED_STATUSES.includes(r.status) || t(r.dueAt) >= t(f.overdueAt))) return false;
  return true;
}

export function createOperationsMemoryRepos() {
  let seq = 0;
  let reportSeq = 0;
  const next = () => String(++seq);
  const tables = {
    types: new Map(), reports: new Map(), history: [], assignments: [], steps: [], approvals: [],
    incidents: new Map(), incidentEvents: [], notifications: [], deliveries: [], changeLog: [],
  };

  const reportTypes = {
    async list() { return [...tables.types.values()].sort((a, b) => a.name.localeCompare(b.name)).map(copy); },
    async findByCode(code) { return copy(tables.types.get(code)); },
    async create(data) {
      const row = { updatedBy: null, ...clean(data), updatedAt: new Date() };
      tables.types.set(row.code, row);
      return copy(row);
    },
    async update(code, patch) {
      const row = tables.types.get(code);
      if (!row) return null;
      Object.assign(row, clean({ ...patch, code: undefined }), { updatedAt: new Date() });
      return copy(row);
    },
  };

  const reports = {
    async create(data) {
      const r = {
        id: randomUUID(), code: `CA-${String(++reportSeq).padStart(4, '0')}`, assigneeId: null, assignedAt: null,
        resolvedAt: null, closedAt: null, ...clean(data), updatedAt: data.createdAt, seq: next(),
      };
      tables.reports.set(r.id, r);
      return strip(copy(r));
    },
    async findById(id) { const r = tables.reports.get(id); return r ? strip(copy(r)) : null; },
    async findByCode(code) {
      const r = [...tables.reports.values()].find((x) => x.code.toUpperCase() === String(code).toUpperCase());
      return r ? strip(copy(r)) : null;
    },
    async list(f) {
      const items = [...tables.reports.values()].filter((r) => reportMatches(r, f)).sort(byCreatedDesc);
      return { items: items.slice(f.offset, f.offset + f.limit).map((r) => strip(copy(r))), total: items.length };
    },
    async summarize(f, now) {
      const byStatus = {};
      let overdue = 0;
      let lastUpdatedAt = null;
      for (const r of tables.reports.values()) {
        if (!reportMatches(r, f)) continue;
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        if (!CLOSED_STATUSES.includes(r.status) && t(r.dueAt) < t(now)) overdue += 1;
        if (!lastUpdatedAt || t(r.updatedAt) > t(lastUpdatedAt)) lastUpdatedAt = r.updatedAt;
      }
      return { byStatus, overdue, lastUpdatedAt };
    },
    async update(id, patch, { expectedStatus } = {}) {
      const r = tables.reports.get(id);
      if (!r || (expectedStatus && r.status !== expectedStatus)) return null;
      Object.assign(r, clean(patch));
      if (patch.updatedAt === undefined) r.updatedAt = new Date();
      return strip(copy(r));
    },
  };

  const listBy = (arr, key, val) => arr.filter((x) => x[key] === val).map(copy);
  const reportHistory = {
    async add(e) { tables.history.push({ id: next(), fromStatus: null, reason: null, changedBy: null, ...clean(e) }); },
    async listByReport(reportId) { return listBy(tables.history, 'reportId', reportId); },
  };
  const assignments = {
    async add(e) { tables.assignments.push({ id: next(), previousAssigneeId: null, reason: null, ...clean(e) }); },
    async listByReport(reportId) { return listBy(tables.assignments, 'reportId', reportId); },
  };

  const approvalSteps = {
    async listByType(typeCode) {
      return tables.steps.filter((s) => s.typeCode === typeCode).sort((a, b) => a.stepOrder - b.stepOrder).map(copy);
    },
    async replaceForType(typeCode, steps) {
      tables.steps = tables.steps.filter((s) => s.typeCode !== typeCode);
      for (const s of steps) tables.steps.push({ id: Number(next()), typeCode, approverRoleCode: null, ...clean(s) });
    },
  };

  const approvals = {
    async createRound(reportId, round, rows) {
      if (tables.approvals.some((a) => a.reportId === reportId && a.round === round)) throw new Error('duplicate key report_approvals');
      for (const s of rows) {
        tables.approvals.push({
          id: next(), reportId, round, decision: 'pending', comment: null, decidedBy: null, decidedAt: null,
          approverRoleCode: null, ...clean(s),
        });
      }
    },
    async listByReport(reportId) {
      return tables.approvals.filter((a) => a.reportId === reportId).sort((a, b) => a.round - b.round || a.stepOrder - b.stepOrder).map(copy);
    },
    async findById(id) { return copy(tables.approvals.find((a) => a.id === String(id))); },
    async decide(id, { decision, comment, decidedBy, decidedAt }) {
      const a = tables.approvals.find((x) => x.id === String(id));
      if (!a || a.decision !== 'pending') return null;
      Object.assign(a, { decision, comment: comment ?? null, decidedBy, decidedAt });
      return copy(a);
    },
    async cancelPending(reportId, round) {
      for (const a of tables.approvals) if (a.reportId === reportId && a.round === round && a.decision === 'pending') a.decision = 'cancelled';
    },
    async listPending() { return tables.approvals.filter((a) => a.decision === 'pending').map(copy); },
  };

  const incidents = {
    async create(data) {
      const i = { id: next(), assigneeId: null, resolution: null, resolvedAt: null, ...clean(data), updatedAt: data.createdAt };
      i.seq = i.id;
      tables.incidents.set(i.id, i);
      return strip(copy(i));
    },
    async findById(id) { const i = tables.incidents.get(String(id)); return i ? strip(copy(i)) : null; },
    async list(f) {
      const items = [...tables.incidents.values()].filter((i) =>
        (!f.reportId || i.reportId === f.reportId) && (!f.statuses?.length || f.statuses.includes(i.status)) &&
        (!f.priority || i.priority === f.priority) && (!f.category || i.category === f.category) &&
        (!f.assigneeId || i.assigneeId === f.assigneeId)).sort(byCreatedDesc);
      return { items: items.slice(f.offset, f.offset + f.limit).map((i) => strip(copy(i))), total: items.length };
    },
    async update(id, patch, { expectedStatus } = {}) {
      const i = tables.incidents.get(String(id));
      if (!i || (expectedStatus && i.status !== expectedStatus)) return null;
      Object.assign(i, clean(patch));
      if (patch.updatedAt === undefined) i.updatedAt = new Date();
      return strip(copy(i));
    },
  };
  const incidentEvents = {
    async add(e) { tables.incidentEvents.push({ id: next(), fromValue: null, toValue: null, comment: null, ...clean(e), incidentId: String(e.incidentId) }); },
    async listByIncident(id) { return listBy(tables.incidentEvents, 'incidentId', String(id)); },
  };

  const notifications = {
    async create(data) {
      const n = { id: next(), body: '', reportId: null, readAt: null, ...clean(data) };
      n.seq = n.id;
      tables.notifications.push(n);
      return strip(copy(n));
    },
    async listByUser(userId, { unreadOnly = false, limit, offset }) {
      const mine = tables.notifications.filter((n) => n.userId === userId);
      const items = mine.filter((n) => !unreadOnly || !n.readAt).sort(byCreatedDesc);
      return {
        items: items.slice(offset, offset + limit).map((n) => strip(copy(n))),
        total: items.length,
        unread: mine.filter((n) => !n.readAt).length,
      };
    },
    async markRead(userId, id, at) {
      const n = tables.notifications.find((x) => x.id === String(id) && x.userId === userId);
      if (!n) return false;
      n.readAt ??= at;
      return true;
    },
    async markAllRead(userId, at) { for (const n of tables.notifications) if (n.userId === userId && !n.readAt) n.readAt = at; },
  };

  const alertDeliveries = {
    async create(d) { tables.deliveries.push({ id: next(), error: null, ...clean(d), seq: seq }); },
    async lastSentAt({ reportId, userId, kind }) {
      const sent = tables.deliveries.filter((d) => d.reportId === reportId && d.userId === userId && d.kind === kind && d.status === 'sent');
      return sent.length ? new Date(Math.max(...sent.map((d) => t(d.createdAt)))) : null;
    },
    async list(f) {
      const items = tables.deliveries.filter((d) =>
        (!f.reportId || d.reportId === f.reportId) && (!f.kind || d.kind === f.kind) && (!f.status || d.status === f.status) &&
        (!f.from || t(d.createdAt) >= t(f.from)) && (!f.to || t(d.createdAt) <= t(f.to))).sort(byCreatedDesc);
      return { items: items.slice(f.offset, f.offset + f.limit).map((d) => strip(copy(d))), total: items.length };
    },
  };

  // Bitácora: solo append/search, como en PostgreSQL. Se congela cada fila para detectar mutaciones en pruebas.
  const changeLog = {
    async append(e) {
      tables.changeLog.push(Object.freeze(structuredClone({ id: next(), entityId: null, reportId: null, oldValues: null, newValues: null, ...clean(e), seq: seq })));
    },
    async search(f) {
      const items = tables.changeLog.filter((e) =>
        (!f.reportId || e.reportId === f.reportId) && (!f.actorId || e.actorId === f.actorId) && (!f.entity || e.entity === f.entity) &&
        (!f.action || e.action === f.action) && (!f.result || e.result === f.result) &&
        (!f.from || t(e.createdAt) >= t(f.from)) && (!f.to || t(e.createdAt) <= t(f.to))).sort(byCreatedDesc);
      return { items: items.slice(f.offset, f.offset + f.limit).map((e) => strip(structuredClone(e))), total: items.length };
    },
  };

  return {
    reportTypes, reports, reportHistory, assignments, approvalSteps, approvals,
    incidents, incidentEvents, notifications, alertDeliveries, changeLog,
  };
}
