// Épica 3 — Gestión de recursos e inventario: materiales y equipos que usan las cuadrillas al atender reportes.
// HU-3.1 catálogo · HU-3.2 entradas · HU-3.3 salidas y asignaciones · HU-3.4 disponibilidad
// HU-3.5 historial de movimientos · HU-3.6 reportes de existencias y movimientos.
import { badRequest, conflict, notFound } from '../http/errors.js';
import { parsePeriod } from '../lib/dates.js';
import { isUuid } from '../lib/tokens.js';
import { intInRange, optionalText, requireText } from '../lib/validate.js';
import { csvCell } from './indicators.service.js';

export const KINDS = [
  { key: 'material', label: 'Material (se consume)' },
  { key: 'equipo', label: 'Equipo (se presta y se devuelve)' },
];
export const MOVEMENT_TYPES = [
  { key: 'entrada', label: 'Entrada', sign: 1 },
  { key: 'salida', label: 'Salida', sign: -1 },
  { key: 'asignacion', label: 'Asignación', sign: -1 },
  { key: 'devolucion', label: 'Devolución', sign: 1 },
];
const typeOf = (k) => MOVEMENT_TYPES.find((t) => t.key === k);
const csvRow = (cells) => cells.map(csvCell).join(',');

/** ok · bajo (en o por debajo del mínimo) · agotado */
export const stockStatus = (r) => (r.stock === 0 ? 'agotado' : r.stock <= r.minStock ? 'bajo' : 'ok');
const STATUS_LABEL = { ok: 'Disponible', bajo: 'Bajo mínimo', agotado: 'Agotado' };

function quantityOf(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw badRequest('invalid_quantity', 'La cantidad debe ser un número entero mayor que cero.');
  return n;
}
function minStockOf(v) {
  const n = Number(v ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw badRequest('invalid_min_stock', 'El mínimo debe ser un número entero de 0 en adelante.');
  return n;
}

export function createInventoryService({ repos, ctx, changeLog, notifications, clock = () => new Date() }) {
  async function loadResource(id) {
    const r = await repos.resources.findById(String(id ?? ''));
    if (!r) throw notFound('resource_not_found', 'Recurso no encontrado.');
    return r;
  }

  const view = (r) => ({
    ...r,
    kindLabel: KINDS.find((k) => k.key === r.kind)?.label,
    stockStatus: stockStatus(r),
    stockStatusLabel: STATUS_LABEL[stockStatus(r)],
  });

  async function serializeMovements(items) {
    const names = await ctx.userNames(items.flatMap((m) => [m.actorId, m.assigneeId]));
    const resources = new Map();
    const reports = new Map();
    for (const m of items) {
      if (!resources.has(m.resourceId)) resources.set(m.resourceId, await repos.resources.findById(m.resourceId));
      if (m.reportId && !reports.has(m.reportId)) reports.set(m.reportId, (await repos.reports.findById(m.reportId))?.code ?? null);
    }
    return items.map((m) => {
      const r = resources.get(m.resourceId);
      return {
        ...m,
        typeLabel: typeOf(m.type)?.label,
        resource: r ? { id: r.id, code: r.code, name: r.name, unit: r.unit } : null,
        reportCode: m.reportId ? reports.get(m.reportId) : null,
        actorName: names.get(m.actorId) ?? null,
        assignee: m.assigneeId ? { id: m.assigneeId, name: names.get(m.assigneeId) ?? null } : null,
      };
    });
  }

  async function outstanding(resource) {
    const rows = await repos.movements.outstanding(resource.id);
    const names = await ctx.userNames(rows.map((x) => x.assigneeId));
    return rows.map((x) => ({ ...x, assigneeName: names.get(x.assigneeId) ?? null }));
  }

  /** HU-3.4: avisa a quien gestiona el inventario cuando un recurso queda en o bajo el mínimo. */
  async function warnIfLow(resource, balance) {
    if (balance > resource.minStock) return;
    const users = await ctx.usersWithPermission('recursos', 'update');
    const title = balance === 0 ? `Agotado: ${resource.name}` : `Bajo mínimo: ${resource.name}`;
    for (const u of users) {
      await notifications.notify({ userId: u.id, kind: 'low_stock', title, body: `Quedan ${balance} ${resource.unit} (mínimo ${resource.minStock}).` });
    }
  }

  function movementFilters(query) {
    const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
    const limit = intInRange(query.limit, { def: 25, min: 1, max: 100 });
    const { from, to } = parsePeriod(query);
    const f = { from, to, limit, offset: (page - 1) * limit };
    if (query.type) {
      if (!typeOf(query.type)) throw badRequest('invalid_type', 'El tipo de movimiento no es válido.');
      f.type = query.type;
    }
    if (query.actorId) {
      if (!isUuid(String(query.actorId))) throw badRequest('invalid_actor', 'El usuario no es válido.');
      f.actorId = String(query.actorId);
    }
    return { f, page, limit };
  }

  return {
    meta: () => ({ kinds: KINDS, movementTypes: MOVEMENT_TYPES.map(({ key, label }) => ({ key, label })), stockStatuses: STATUS_LABEL }),

    // ── HU-3.1 Catálogo de recursos ─────────────────────────────────────────────
    async list(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 50, min: 1, max: 200 });
      const f = { limit, offset: (page - 1) * limit };
      if (query.q) f.q = String(query.q).trim().slice(0, 60);
      if (query.kind) {
        if (!KINDS.some((k) => k.key === query.kind)) throw badRequest('invalid_kind', 'El tipo de recurso debe ser material o equipo.');
        f.kind = query.kind;
      }
      if (query.active !== 'all') f.active = query.active !== 'false';
      if (query.low === '1') f.low = true;
      const { items, total } = await repos.resources.list(f);
      return { items: items.map(view), total, page, limit };
    },

    async get(id) {
      const r = await loadResource(id);
      const { items } = await repos.movements.list({ resourceId: r.id, limit: 20, offset: 0 });
      return { resource: view(r), outstanding: await outstanding(r), movements: await serializeMovements(items) };
    },

    async create(actor, body = {}) {
      return changeLog.track(actor, { entity: 'resource', action: 'create' }, async () => {
        const name = requireText(body.name, { field: 'name', label: 'El nombre', min: 2, max: 80 });
        if (!KINDS.some((k) => k.key === body.kind)) throw badRequest('invalid_kind', 'El tipo de recurso debe ser material o equipo.');
        const unit = requireText(body.unit, { field: 'unit', label: 'La unidad', min: 1, max: 20 });
        const minStock = minStockOf(body.minStock);
        const location = optionalText(body.location, { field: 'location', label: 'La ubicación', max: 80 });
        if (await repos.resources.findByName(name)) throw conflict('resource_name_taken', 'Ya existe un recurso con ese nombre.');
        const r = await repos.resources.create({ name, kind: body.kind, unit, minStock, location, createdBy: actor.user.id, createdAt: clock() });
        return { value: view(r), entityId: r.id, newValues: { code: r.code, name, kind: body.kind, unit, minStock, location } };
      });
    },

    async update(actor, id, body = {}) {
      const r = await loadResource(id);
      return changeLog.track(actor, { entity: 'resource', action: 'update', entityId: r.id }, async () => {
        const patch = {};
        if (body.name !== undefined) {
          patch.name = requireText(body.name, { field: 'name', label: 'El nombre', min: 2, max: 80 });
          const other = await repos.resources.findByName(patch.name);
          if (other && other.id !== r.id) throw conflict('resource_name_taken', 'Ya existe un recurso con ese nombre.');
        }
        if (body.unit !== undefined) patch.unit = requireText(body.unit, { field: 'unit', label: 'La unidad', min: 1, max: 20 });
        if (body.minStock !== undefined) patch.minStock = minStockOf(body.minStock);
        if (body.location !== undefined) patch.location = optionalText(body.location, { field: 'location', label: 'La ubicación', max: 80 });
        if (body.isActive !== undefined) {
          if (typeof body.isActive !== 'boolean') throw badRequest('invalid_is_active', 'isActive debe ser true o false.');
          patch.isActive = body.isActive;
        }
        if (body.stock !== undefined) throw badRequest('stock_read_only', 'La existencia solo cambia registrando un movimiento.');
        if (!Object.keys(patch).length) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const updated = await repos.resources.update(r.id, { ...patch, updatedAt: clock() });
        const pick = (x) => ({ name: x.name, unit: x.unit, minStock: x.minStock, location: x.location, isActive: x.isActive });
        return { value: view(updated), oldValues: pick(r), newValues: pick(updated) };
      });
    },

    // ── HU-3.4 Validar disponibilidad ───────────────────────────────────────────
    async availability(id, query = {}) {
      const r = await loadResource(id);
      const requested = query.quantity === undefined || query.quantity === '' ? 1 : quantityOf(query.quantity);
      return {
        resource: { id: r.id, code: r.code, name: r.name, unit: r.unit, kind: r.kind },
        available: r.isActive ? r.stock : 0,
        requested,
        sufficient: r.isActive && r.stock >= requested,
        isActive: r.isActive,
        stockStatus: stockStatus(r),
        outstanding: r.kind === 'equipo' ? await outstanding(r) : [],
      };
    },

    // ── HU-3.2 Entradas · HU-3.3 Salidas, asignaciones y devoluciones ───────────
    async move(actor, id, body = {}) {
      const r = await loadResource(id);
      const type = typeOf(body.type);
      if (!type) throw badRequest('invalid_type', 'El tipo debe ser entrada, salida, asignacion o devolucion.');
      const quantity = quantityOf(body.quantity);
      if (!r.isActive && type.sign < 0) throw conflict('resource_inactive', 'El recurso está desactivado: no se puede entregar.');
      if (type.key === 'salida' && r.kind !== 'material') throw conflict('wrong_kind', 'Los equipos no se consumen: usa «asignación» y luego «devolución».');
      if (['asignacion', 'devolucion'].includes(type.key) && r.kind !== 'equipo') throw conflict('wrong_kind', 'Solo los equipos se asignan y se devuelven; para materiales usa «salida».');

      const reason = optionalText(body.reason, { field: 'reason', label: 'El motivo', max: 300 });
      if (type.key === 'entrada' && !reason) throw badRequest('invalid_reason', 'Indica el origen de la entrada (compra, donación, etc.).');

      let report = null;
      if (body.report) report = await ctx.findReport(String(body.report));
      if (body.report && !report) throw badRequest('invalid_report', 'El reporte indicado no existe.');
      if (type.key === 'salida' && !report) throw badRequest('report_required', 'Una salida de material debe indicar el reporte que se atiende (CA-0000).');

      let assigneeId = null;
      if (['asignacion', 'devolucion'].includes(type.key)) {
        assigneeId = String(body.assigneeId ?? '');
        const eligible = await ctx.usersWithPermission('operaciones', 'update');
        if (!isUuid(assigneeId) || !eligible.some((u) => u.id === assigneeId)) {
          throw badRequest('invalid_assignee', 'Elige un usuario activo con permiso para atender reportes.');
        }
        if (type.key === 'devolucion') {
          const held = (await repos.movements.outstanding(r.id)).find((x) => x.assigneeId === assigneeId)?.quantity ?? 0;
          if (quantity > held) throw conflict('return_exceeds_assigned', `Esa persona solo tiene ${held} ${r.unit} asignados.`, { held });
        }
      }

      return changeLog.track(actor, { entity: 'resource', action: `movement_${type.key}`, entityId: r.id, reportId: report?.id ?? null }, async () => {
        // HU-3.4: la validación final es atómica en el repositorio (no deja la existencia negativa).
        const m = await repos.resources.applyMovement({
          resourceId: r.id, delta: type.sign * quantity, type: type.key, quantity,
          reportId: report?.id ?? null, assigneeId, reason, actorId: actor.user.id, createdAt: clock(),
        });
        if (!m) {
          const fresh = await repos.resources.findById(r.id);
          throw conflict('insufficient_stock', `No hay existencia suficiente: disponibles ${fresh.stock} ${r.unit}, solicitados ${quantity}.`, {
            available: fresh.stock, requested: quantity,
          });
        }
        if (type.sign < 0) await warnIfLow(r, m.balanceAfter);
        const [value] = await serializeMovements([m]);
        return {
          value: { movement: value, resource: view(await repos.resources.findById(r.id)) },
          newValues: { type: type.key, quantity, balanceAfter: m.balanceAfter, report: report?.code ?? null, assigneeId, reason },
          oldValues: { stock: r.stock },
        };
      });
    },

    // ── HU-3.5 Historial de movimientos ─────────────────────────────────────────
    async movements(query = {}) {
      const { f, page, limit } = movementFilters(query);
      if (query.resource) {
        const r = await repos.resources.findById(String(query.resource));
        if (!r) return { items: [], total: 0, page, limit };
        f.resourceId = r.id;
      }
      if (query.report) {
        const rep = await ctx.findReport(String(query.report));
        if (!rep) return { items: [], total: 0, page, limit };
        f.reportId = rep.id;
      }
      const { items, total } = await repos.movements.list(f);
      return { items: await serializeMovements(items), total, page, limit };
    },

    // ── HU-3.6 Reportes de existencias y de movimientos ─────────────────────────
    async summary(query = {}) {
      const { from, to } = parsePeriod(query);
      const { items } = await repos.resources.list({ active: true });
      const totals = await repos.movements.totals({ from, to });
      const sum = (rid, type) => totals.filter((x) => x.resourceId === rid && x.type === type).reduce((a, x) => a + x.quantity, 0);
      const rows = items.map((r) => ({
        ...view(r),
        entradas: sum(r.id, 'entrada'),
        salidas: sum(r.id, 'salida'),
        asignaciones: sum(r.id, 'asignacion'),
        devoluciones: sum(r.id, 'devolucion'),
      }));
      return {
        generatedAt: clock(),
        filters: Object.fromEntries(Object.entries({ from: query.from, to: query.to }).filter(([, v]) => v)),
        totals: {
          recursos: rows.length,
          disponibles: rows.filter((r) => r.stockStatus === 'ok').length,
          bajoMinimo: rows.filter((r) => r.stockStatus === 'bajo').length,
          agotados: rows.filter((r) => r.stockStatus === 'agotado').length,
          movimientos: totals.reduce((a, x) => a + x.count, 0),
        },
        rows,
      };
    },

    async exportCsv(actor, query = {}) {
      const s = await this.summary(query);
      const lines = [
        csvRow(['Reporte de existencias y movimientos — CiudadAlerta']),
        csvRow(['Generado', s.generatedAt.toISOString()]),
        csvRow(['Generado por', actor.user.fullName]),
        csvRow(['Periodo de movimientos', `${query.from || 'inicio'} a ${query.to || 'hoy'}`]),
        '',
        csvRow(['Código', 'Recurso', 'Tipo', 'Unidad', 'Existencia', 'Mínimo', 'Estado', 'Entradas', 'Salidas', 'Asignaciones', 'Devoluciones', 'Ubicación']),
        ...s.rows.map((r) => csvRow([r.code, r.name, r.kind, r.unit, r.stock, r.minStock, r.stockStatusLabel, r.entradas, r.salidas, r.asignaciones, r.devoluciones, r.location])),
      ];
      await changeLog.record({ actor, entity: 'export', action: 'inventory_csv', newValues: { filters: s.filters, rows: s.rows.length } });
      return { filename: `existencias-${s.generatedAt.toISOString().slice(0, 10)}.csv`, csv: `﻿${lines.join('\r\n')}\r\n` };
    },
  };
}
