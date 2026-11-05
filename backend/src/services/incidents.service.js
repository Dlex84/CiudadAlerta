// HU-2.6 — Incidencias operativas: problemas internos al atender un reporte (p. ej. «falta material»).
// No son el reporte del ciudadano. Categoría, descripción, prioridad, responsable, estado, resolución e historial.
import {
  INCIDENT_CATEGORIES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
  INCIDENT_TRANSITIONS,
} from '../domain/operations.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { isUuid } from '../lib/tokens.js';
import { intInRange, requireText } from '../lib/validate.js';

const DESCRIPTION = { field: 'description', label: 'La descripción', min: 5, max: 1000 };
const RESOLUTION = { field: 'resolution', label: 'La resolución', min: 5, max: 1000 };
const COMMENT = { field: 'comment', label: 'El comentario', min: 1, max: 1000 };
const keys = (list) => list.map((x) => x.key);
const label = (list, key) => list.find((x) => x.key === key)?.label ?? key;

function oneOf(v, list, field, what) {
  if (!keys(list).includes(v)) throw badRequest(`invalid_${field}`, `${what} debe ser una de: ${list.map((x) => x.label).join(', ')}.`);
  return v;
}

export function createIncidentsService({ repos, ctx, changeLog, notifications, clock = () => new Date() }) {
  async function assigneeOrThrow(id) {
    if (id === undefined || id === null || id === '') return null;
    const ok = isUuid(String(id)) && (await ctx.usersWithPermission('operaciones', 'update')).some((u) => u.id === id);
    if (!ok) throw badRequest('invalid_assignee', 'El responsable debe ser un usuario activo con permiso para atender reportes.');
    return id;
  }

  async function loadIncident(id) {
    const incident = await repos.incidents.findById(id);
    if (!incident) throw notFound('incident_not_found', 'Incidencia no encontrada.');
    return incident;
  }

  async function serialize(list) {
    const names = await ctx.userNames(list.flatMap((i) => [i.assigneeId, i.createdBy]));
    const codes = new Map();
    for (const id of new Set(list.map((i) => i.reportId))) codes.set(id, (await repos.reports.findById(id))?.code ?? null);
    return list.map((i) => ({
      ...i,
      reportCode: codes.get(i.reportId),
      categoryLabel: label(INCIDENT_CATEGORIES, i.category),
      priorityLabel: label(INCIDENT_PRIORITIES, i.priority),
      statusLabel: label(INCIDENT_STATUSES, i.status),
      assignee: i.assigneeId ? { id: i.assigneeId, name: names.get(i.assigneeId) } : null,
      createdByName: names.get(i.createdBy),
    }));
  }

  async function detail(id) {
    const incident = await loadIncident(id);
    const [value] = await serialize([incident]);
    const events = await repos.incidentEvents.listByIncident(incident.id);
    const names = await ctx.userNames(events.map((e) => e.actorId));
    return { incident: value, events: events.map((e) => ({ ...e, actorName: names.get(e.actorId) ?? null })) };
  }

  return {
    async create(actor, idOrCode, body = {}) {
      const report = await ctx.loadReport(actor, idOrCode);
      return changeLog.track(actor, { entity: 'incident', action: 'create', reportId: report.id }, async () => {
        if (report.status === 'rechazado') throw conflict('report_closed', 'No se registran incidencias en un reporte rechazado.');
        const category = oneOf(body.category, INCIDENT_CATEGORIES, 'category', 'La categoría');
        const priority = oneOf(body.priority, INCIDENT_PRIORITIES, 'priority', 'La prioridad');
        const description = requireText(body.description, DESCRIPTION);
        const assigneeId = await assigneeOrThrow(body.assigneeId);
        const now = clock();
        const incident = await repos.incidents.create({
          reportId: report.id, category, description, priority, status: 'abierta', assigneeId, createdBy: actor.user.id, createdAt: now,
        });
        await repos.incidentEvents.add({ incidentId: incident.id, kind: 'created', toValue: 'abierta', comment: description, actorId: actor.user.id, createdAt: now });
        if (assigneeId && assigneeId !== actor.user.id) {
          await notifications.notify({
            userId: assigneeId, kind: 'incident_assigned', title: `Incidencia en ${report.code}: ${label(INCIDENT_CATEGORIES, category)}`,
            body: description, reportId: report.id,
          });
        }
        return {
          value: await detail(incident.id),
          entityId: incident.id,
          newValues: { category, priority, description, assigneeId, status: 'abierta' },
        };
      });
    },

    async list(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 25, min: 1, max: 100 });
      const f = { limit, offset: (page - 1) * limit };
      if (query.report) {
        const report = await ctx.findReport(query.report);
        if (!report) return { items: [], total: 0, page, limit };
        f.reportId = report.id;
      }
      if (query.status) {
        f.statuses = String(query.status).split(',').filter(Boolean);
        for (const s of f.statuses) oneOf(s, INCIDENT_STATUSES, 'status', 'El estado');
      }
      if (query.priority) f.priority = oneOf(query.priority, INCIDENT_PRIORITIES, 'priority', 'La prioridad');
      if (query.category) f.category = oneOf(query.category, INCIDENT_CATEGORIES, 'category', 'La categoría');
      if (query.assigneeId) {
        if (!isUuid(String(query.assigneeId))) throw badRequest('invalid_assignee', 'El responsable no es válido.');
        f.assigneeId = String(query.assigneeId);
      }
      const { items, total } = await repos.incidents.list(f);
      return { items: await serialize(items), total, page, limit };
    },

    get: detail,

    /** Cambia estado, prioridad o responsable. Resolver exige documentar la resolución. */
    async update(actor, id, body = {}) {
      const incident = await loadIncident(id);
      return changeLog.track(actor, { entity: 'incident', action: 'update', entityId: incident.id, reportId: incident.reportId }, async () => {
        const now = clock();
        const patch = {};
        const events = [];
        if (body.status !== undefined && body.status !== incident.status) {
          const to = oneOf(body.status, INCIDENT_STATUSES, 'status', 'El estado');
          if (!INCIDENT_TRANSITIONS[incident.status].includes(to)) {
            throw conflict('invalid_transition', `Una incidencia «${label(INCIDENT_STATUSES, incident.status)}» no puede pasar a «${label(INCIDENT_STATUSES, to)}».`);
          }
          patch.status = to;
          if (to === 'resuelta') {
            patch.resolution = requireText(body.resolution, RESOLUTION);
            patch.resolvedAt = now;
          }
          events.push({ kind: 'status', fromValue: incident.status, toValue: to, comment: patch.resolution ?? null });
        }
        if (body.priority !== undefined && body.priority !== incident.priority) {
          patch.priority = oneOf(body.priority, INCIDENT_PRIORITIES, 'priority', 'La prioridad');
          events.push({ kind: 'update', fromValue: `prioridad: ${incident.priority}`, toValue: `prioridad: ${patch.priority}` });
        }
        if (body.assigneeId !== undefined && (body.assigneeId || null) !== incident.assigneeId) {
          patch.assigneeId = await assigneeOrThrow(body.assigneeId);
          const names = await ctx.userNames([incident.assigneeId, patch.assigneeId]);
          events.push({
            kind: 'update',
            fromValue: `responsable: ${incident.assigneeId ? names.get(incident.assigneeId) : '—'}`,
            toValue: `responsable: ${patch.assigneeId ? names.get(patch.assigneeId) : '—'}`,
          });
        }
        if (!events.length) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const updated = await repos.incidents.update(incident.id, { ...patch, updatedAt: now }, { expectedStatus: incident.status });
        if (!updated) throw conflict('status_changed', 'La incidencia cambió mientras la editabas. Recarga e inténtalo de nuevo.');
        for (const e of events) await repos.incidentEvents.add({ incidentId: incident.id, actorId: actor.user.id, createdAt: now, ...e });
        const pick = (i) => ({ status: i.status, priority: i.priority, assigneeId: i.assigneeId ?? null, resolution: i.resolution ?? null });
        return { value: await detail(incident.id), oldValues: pick(incident), newValues: pick(updated) };
      });
    },

    async comment(actor, id, body = {}) {
      const incident = await loadIncident(id);
      return changeLog.track(actor, { entity: 'incident', action: 'comment', entityId: incident.id, reportId: incident.reportId }, async () => {
        const comment = requireText(body.comment, COMMENT);
        await repos.incidentEvents.add({ incidentId: incident.id, kind: 'comment', comment, actorId: actor.user.id, createdAt: clock() });
        return { value: await detail(incident.id), newValues: { comment } };
      });
    },
  };
}
