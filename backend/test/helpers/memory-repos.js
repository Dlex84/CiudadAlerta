// Repositorios en memoria con el MISMO contrato que src/repositories/pg/*.
// Permiten probar servicios y API completa sin PostgreSQL.
import { randomUUID } from 'node:crypto';
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

  return { users, roles, sessions, accessLogs, resetTokens, _db: db };
}
