// HU-2.8 — Bitácora de cambios: actor, fecha y hora, entidad, acción, resultado y valores antes/después.
import { REPORT_CODE_RE } from '../domain/operations.js';
import { AppError, badRequest } from '../http/errors.js';
import { parsePeriod } from '../lib/dates.js';
import { isUuid } from '../lib/tokens.js';
import { intInRange } from '../lib/validate.js';

export const ENTITIES = ['report', 'approval', 'approval_steps', 'incident', 'report_type', 'export', 'resource'];
export const RESULTS = ['success', 'rejected'];
const SECRET_KEY = /pass|token|hash|secret|cookie/i;

/** Nunca guarda contraseñas, tokens ni hashes, aunque lleguen por error en los valores. */
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = SECRET_KEY.test(k) ? '[oculto]' : redact(v);
    }
    return out;
  }
  return value;
}

export function createChangeLogService({ repos, clock = () => new Date() }) {
  async function record({ actor, entity, entityId = null, reportId = null, action, result = 'success', oldValues = null, newValues = null }) {
    await repos.changeLog.append({
      actorId: actor?.user?.id ?? null,
      actorName: actor?.user?.fullName ?? 'Sistema',
      entity,
      entityId: entityId == null ? null : String(entityId),
      reportId,
      action,
      result,
      oldValues: oldValues == null ? null : redact(oldValues),
      newValues: newValues == null ? null : redact(newValues),
      createdAt: clock(),
    });
  }

  return {
    record,

    /**
     * Ejecuta un cambio y lo deja en la bitácora. `fn` devuelve { value, entityId?, reportId?, oldValues?, newValues? }.
     * Si una regla de negocio lo rechaza (AppError), también queda registrado con resultado "rejected".
     */
    async track(actor, { entity, action, entityId = null, reportId = null }, fn) {
      let out;
      try {
        out = await fn();
      } catch (err) {
        if (err instanceof AppError && err.status !== 404) {
          await record({
            actor, entity, action, entityId, reportId, result: 'rejected',
            newValues: { error: err.code, message: err.message },
          });
        }
        throw err;
      }
      await record({
        actor, entity, action,
        entityId: out.entityId ?? entityId,
        reportId: out.reportId ?? reportId,
        oldValues: out.oldValues ?? null,
        newValues: out.newValues ?? null,
      });
      return out.value;
    },

    /** Búsqueda por reporte (código o id), usuario, entidad, acción, resultado y periodo. */
    async search(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 25, min: 1, max: 100 });
      const { from, to } = parsePeriod(query);
      const f = { from, to, limit, offset: (page - 1) * limit };
      if (query.report) {
        const v = String(query.report).trim().replace(/^#/, '');
        const report = isUuid(v) ? await repos.reports.findById(v) : REPORT_CODE_RE.test(v) ? await repos.reports.findByCode(v) : null;
        if (!report) return { items: [], total: 0, page, limit };
        f.reportId = report.id;
      }
      if (query.actorId) {
        if (!isUuid(String(query.actorId))) throw badRequest('invalid_actor', 'El usuario no es válido.');
        f.actorId = String(query.actorId);
      }
      if (query.entity) {
        if (!ENTITIES.includes(query.entity)) throw badRequest('invalid_entity', `La entidad debe ser una de: ${ENTITIES.join(', ')}.`);
        f.entity = query.entity;
      }
      if (query.result) {
        if (!RESULTS.includes(query.result)) throw badRequest('invalid_result', 'El resultado debe ser success o rejected.');
        f.result = query.result;
      }
      if (query.action) f.action = String(query.action).slice(0, 40);

      const { items, total } = await repos.changeLog.search(f);
      const codes = new Map();
      for (const id of new Set(items.map((i) => i.reportId).filter(Boolean))) {
        codes.set(id, (await repos.reports.findById(id))?.code ?? null);
      }
      return {
        items: items.map((i) => ({ ...i, reportCode: i.reportId ? (codes.get(i.reportId) ?? null) : null })),
        total,
        page,
        limit,
      };
    },
  };
}
