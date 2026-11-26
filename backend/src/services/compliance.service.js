// Épica 4 — HU-4.6 alertas de cumplimiento · HU-4.7 evidencias · HU-4.8 reportes de inventario y cumplimiento.
import { detectEvidenceType } from '../adapters/evidence-files.js';
import { can } from '../domain/permissions.js';
import {
  ALERT_KINDS,
  CLASSIFICATIONS,
  CLOSING_DECISIONS,
  COMPONENT_LICENSE_STATUSES,
  CRITICALITIES,
  EVIDENCE_KINDS,
  LICENSE_CATEGORIES,
  VALIDITY_LABEL,
  daysBetween,
  isoDate,
  keysOf,
  labelOf,
  licenseValidity,
} from '../domain/licensing.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { isUuid } from '../lib/tokens.js';
import { intInRange, optionalText, requireText } from '../lib/validate.js';
import { csvCell } from './indicators.service.js';
import { optionalUrl, oneOf } from './software.service.js';

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const csvRow = (cells) => cells.map(csvCell).join(',');
const addDays = (date, n) => new Date(Date.parse(`${isoDate(date)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** RN-4.10: qué clasificaciones puede ver cada quien. */
export const visibleClassifications = (actor) =>
  can(actor.permissions, 'confidencial', 'read') ? ['publica', 'interna', 'confidencial'] : ['publica', 'interna'];

export function createComplianceService({ repos, ctx, changeLog, notifications, software, licenses, evidenceFiles, clock = () => new Date() }) {
  const today = () => clock().toISOString().slice(0, 10);

  // ── HU-4.6 Alertas ─────────────────────────────────────────────────────────────
  const state = (a) => (a.status === 'atendida' ? 'atendida' : a.dueOn < today() ? 'vencida' : 'pendiente');
  const STATE_LABEL = { pendiente: 'Pendiente', vencida: 'Vencida', atendida: 'Atendida' };

  async function serializeAlerts(list) {
    const names = await ctx.userNames(list.flatMap((a) => [a.responsibleId, a.attendedBy]));
    return list.map((a) => ({
      ...a,
      kindLabel: labelOf(ALERT_KINDS, a.kind),
      criticalityLabel: labelOf(CRITICALITIES, a.criticality),
      state: state(a),
      stateLabel: STATE_LABEL[state(a)],
      responsibleName: a.responsibleId ? names.get(a.responsibleId) : null,
      attendedByName: a.attendedBy ? names.get(a.attendedBy) : null,
    }));
  }

  async function loadAlert(id) {
    const a = await repos.complianceAlerts.findById(id);
    if (!a) throw notFound('alert_not_found', 'Alerta no encontrada.');
    return a;
  }

  /** Candidatas a alerta según las reglas activas: [{ rule, entityType, entityId, title, detail, dueOn }]. */
  async function candidates(rules) {
    const out = [];
    const rule = (k) => rules.find((r) => r.kind === k && r.isActive);

    const venc = rule('vencimiento_licencia');
    if (venc) {
      for (const l of await repos.purchasedLicenses.list({ active: true })) {
        if (!l.expiresOn) continue;
        const days = daysBetween(today(), l.expiresOn);
        if (days > l.alertDays) continue; // HU-4.3: aviso configurable por licencia
        out.push({
          rule: venc, entityType: 'licencia', entityId: l.id, dueOn: l.expiresOn,
          title: days < 0 ? `${l.code} ${l.product} venció el ${l.expiresOn}` : `${l.code} ${l.product} vence el ${l.expiresOn} (${days} días)`,
          detail: `${l.vendor} · ${l.assigned}${l.quantity ? ` de ${l.quantity}` : ''} asignadas`,
        });
      }
    }

    const unconfirmed = rule('sin_licencia');
    const pending = rule('revision_pendiente');
    const incompatible = rule('incompatibilidad');
    if (unconfirmed || pending || incompatible) {
      const list = await software.serializeComponents((await repos.components.list({})).items);
      for (const c of list) {
        if (c.reviewClosed) continue; // una revisión que decidió cierra el pendiente
        const base = { entityType: 'componente', entityId: c.id };
        const label = `${c.name} ${c.version} (${c.project?.name ?? c.projectCode})`;
        if (unconfirmed && c.licenseStatus !== 'confirmada') {
          out.push({ ...base, rule: unconfirmed, dueOn: addDays(c.addedAt, unconfirmed.daysBefore), title: `Sin licencia confirmada: ${label}`, detail: `Declarada: ${c.declaredLicense ?? 'ninguna'}` });
        }
        if (incompatible && c.flags.length) {
          out.push({ ...base, rule: incompatible, dueOn: addDays(c.addedAt, incompatible.daysBefore), title: `Posible incompatibilidad: ${label}`, detail: `${c.flags.map((f) => f.message).join(' ')} Requiere revisión humana; no es un dictamen legal.` });
        }
        if (pending && c.licenseStatus === 'confirmada' && c.isDirect && !c.isDev && !c.latestReview && !c.flags.length) {
          out.push({ ...base, rule: pending, dueOn: addDays(c.addedAt, pending.daysBefore), title: `Revisar obligaciones de ${label}`, detail: `Licencia ${c.license?.spdxId}: ${c.license?.categoryLabel}` });
        }
      }
    }
    return out;
  }

  // ── HU-4.7 Evidencias ──────────────────────────────────────────────────────────
  async function serializeEvidences(list) {
    const names = await ctx.userNames(list.map((e) => e.authorId));
    const comps = new Map();
    const lics = new Map();
    for (const e of list) {
      if (e.componentId && !comps.has(e.componentId)) comps.set(e.componentId, await repos.components.findById(e.componentId));
      if (e.licenseId && !lics.has(e.licenseId)) lics.set(e.licenseId, await repos.purchasedLicenses.findById(e.licenseId));
    }
    return list.map(({ storageKey, ...e }) => {
      const c = e.componentId ? comps.get(e.componentId) : null;
      const l = e.licenseId ? lics.get(e.licenseId) : null;
      return {
        ...e,
        hasFile: Boolean(storageKey),
        kindLabel: labelOf(EVIDENCE_KINDS, e.kind),
        classificationLabel: labelOf(CLASSIFICATIONS, e.classification),
        authorName: names.get(e.authorId) ?? null,
        component: c ? { id: c.id, name: c.name, version: c.version, projectCode: c.projectCode } : null,
        license: l ? { id: l.id, code: l.code, product: l.product } : null,
      };
    });
  }

  async function evidenceFields(actor, src) {
    const classification = oneOf(src.classification, CLASSIFICATIONS, 'classification', 'La clasificación');
    if (!visibleClassifications(actor).includes(classification)) {
      throw forbidden('confidential_forbidden', 'No tienes permiso para registrar evidencias confidenciales.');
    }
    const f = {
      title: requireText(src.title, { field: 'title', label: 'El título', min: 3, max: 160 }),
      kind: oneOf(src.kind, EVIDENCE_KINDS, 'kind', 'El tipo'),
      classification,
      version: optionalText(src.version, { field: 'version', label: 'La versión', max: 20 }) ?? '1',
      projectCode: null, componentId: null, licenseId: null,
    };
    if (src.projectCode) {
      if (!(await repos.softwareProjects.findByCode(String(src.projectCode)))) throw badRequest('invalid_project', 'El proyecto no existe.');
      f.projectCode = String(src.projectCode);
    }
    if (src.componentId) {
      if (!isUuid(String(src.componentId)) || !(await repos.components.findById(String(src.componentId)))) throw badRequest('invalid_component', 'El componente no existe.');
      f.componentId = String(src.componentId);
    }
    if (src.licenseId) {
      const l = await repos.purchasedLicenses.findById(String(src.licenseId));
      if (!l) throw badRequest('invalid_license', 'La licencia adquirida no existe.');
      f.licenseId = l.id;
    }
    // RN-4.10: toda evidencia queda ligada a algo localizable.
    if (!f.projectCode && !f.componentId && !f.licenseId) {
      throw badRequest('evidence_unlinked', 'Relaciona la evidencia con un proyecto, un componente o una licencia adquirida.');
    }
    return f;
  }

  async function loadVisibleEvidence(actor, id) {
    const e = await repos.evidences.findById(id);
    // Si no puede verla, se responde como si no existiera (no se revela la existencia de documentos confidenciales).
    if (!e || !visibleClassifications(actor).includes(e.classification)) throw notFound('evidence_not_found', 'Evidencia no encontrada.');
    return e;
  }

  return {
    meta: async () => ({
      alertKinds: ALERT_KINDS, criticalities: CRITICALITIES, evidenceKinds: EVIDENCE_KINDS, classifications: CLASSIFICATIONS,
      states: STATE_LABEL, rules: await repos.alertRules.list(),
    }),

    async listRules() {
      return { items: (await repos.alertRules.list()).map((r) => ({ ...r, kindLabel: labelOf(ALERT_KINDS, r.kind) })) };
    },

    async updateRule(actor, kind, body = {}) {
      const r = await repos.alertRules.findByKind(String(kind));
      if (!r) throw notFound('rule_not_found', 'Regla no encontrada.');
      return changeLog.track(actor, { entity: 'alert_rule', action: 'update', entityId: r.kind }, async () => {
        const patch = {};
        const int = (v, field, label, min, max) => {
          if (!Number.isInteger(v) || v < min || v > max) throw badRequest(`invalid_${field}`, `${label} debe ser un entero entre ${min} y ${max}.`);
          return v;
        };
        if (body.daysBefore !== undefined) patch.daysBefore = int(body.daysBefore, 'days_before', 'Los días', 0, 365);
        if (body.dedupeDays !== undefined) patch.dedupeDays = int(body.dedupeDays, 'dedupe_days', 'La ventana anti-repetición', 1, 365);
        if (body.criticality !== undefined) patch.criticality = oneOf(body.criticality, CRITICALITIES, 'criticality', 'La criticidad');
        if (body.isActive !== undefined) {
          if (typeof body.isActive !== 'boolean') throw badRequest('invalid_is_active', 'isActive debe ser verdadero o falso.');
          patch.isActive = body.isActive;
        }
        if (!Object.keys(patch).length) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const updated = await repos.alertRules.update(r.kind, { ...patch, updatedBy: actor.user.id, updatedAt: clock() });
        const pick = (x) => ({ daysBefore: x.daysBefore, dedupeDays: x.dedupeDays, criticality: x.criticality, isActive: x.isActive });
        return { value: updated, oldValues: pick(r), newValues: pick(updated) };
      });
    },

    /**
     * Genera las alertas que correspondan. RN-4.12: no crea otra si hay una pendiente igual (índice único)
     * ni si se creó una igual dentro de la ventana configurada de la regla (aunque ya esté atendida).
     */
    async scan() {
      const now = clock();
      const rules = await repos.alertRules.list();
      const found = await candidates(rules);
      const summary = { checked: found.length, created: 0, skipped: 0 };
      let recipients = null;
      for (const c of found) {
        const last = await repos.complianceAlerts.lastCreatedAt(c.rule.kind, c.entityType, c.entityId);
        if (last && now.getTime() - new Date(last).getTime() < c.rule.dedupeDays * 86_400_000) { summary.skipped += 1; continue; }
        const alert = await repos.complianceAlerts.createIfAbsent({
          kind: c.rule.kind, criticality: c.rule.criticality, entityType: c.entityType, entityId: c.entityId,
          title: c.title.slice(0, 300), detail: c.detail.slice(0, 1000), dueOn: c.dueOn, createdAt: now,
        });
        if (!alert) { summary.skipped += 1; continue; }
        await repos.alertEvents.add({ alertId: alert.id, kind: 'creada', comment: alert.detail, actorId: null, createdAt: now });
        recipients ??= (await ctx.usersWithPermission('cumplimiento', 'update')).map((u) => u.id);
        for (const userId of recipients) {
          await notifications.notify({ userId, kind: 'compliance_alert', title: `[${labelOf(CRITICALITIES, alert.criticality)}] ${alert.title}`, body: alert.detail });
        }
        summary.created += 1;
      }
      return summary;
    },

    async listAlerts(query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 50, min: 1, max: 200 });
      const f = { limit, offset: (page - 1) * limit };
      if (query.state) {
        if (!STATE_LABEL[query.state]) throw badRequest('invalid_state', 'El estado debe ser pendiente, vencida o atendida.');
        if (query.state === 'atendida') f.status = 'atendida';
        if (query.state === 'vencida') f.overdueOn = today();
        if (query.state === 'pendiente') { f.status = 'pendiente'; f.notOverdueOn = today(); }
      }
      if (query.kind) f.kind = oneOf(query.kind, ALERT_KINDS, 'kind', 'El tipo de alerta');
      if (query.criticality) f.criticality = oneOf(query.criticality, CRITICALITIES, 'criticality', 'La criticidad');
      if (query.responsibleId) {
        if (!isUuid(String(query.responsibleId))) throw badRequest('invalid_responsible', 'El responsable no es válido.');
        f.responsibleId = String(query.responsibleId);
      }
      const { items, total } = await repos.complianceAlerts.list(f);
      const counts = {};
      for (const s of Object.keys(STATE_LABEL)) {
        const cf = s === 'atendida' ? { status: 'atendida' } : s === 'vencida' ? { overdueOn: today() } : { status: 'pendiente', notOverdueOn: today() };
        counts[s] = (await repos.complianceAlerts.list({ ...cf, limit: 1 })).total;
      }
      return { items: await serializeAlerts(items), total, page, limit, counts };
    },

    async getAlert(id) {
      const a = await loadAlert(id);
      const [value] = await serializeAlerts([a]);
      const events = await repos.alertEvents.listByAlert(a.id);
      const names = await ctx.userNames(events.map((e) => e.actorId));
      return { alert: value, events: events.map((e) => ({ ...e, actorName: e.actorId ? names.get(e.actorId) : 'Sistema' })) };
    },

    /** Responsable y seguimiento (HU-4.6): asignar responsable, comentar o atender (con comentario obligatorio). */
    async actOnAlert(actor, id, body = {}) {
      const a = await loadAlert(id);
      return changeLog.track(actor, { entity: 'compliance_alert', action: String(body.action ?? 'update').slice(0, 30), entityId: a.id }, async () => {
        const now = clock();
        const comment = optionalText(body.comment, { field: 'comment', label: 'El comentario', max: 1000 });
        if (body.action === 'responsable') {
          const eligible = await ctx.usersWithPermission('cumplimiento', 'update');
          const user = eligible.find((u) => u.id === body.responsibleId);
          if (!user) throw badRequest('invalid_responsible', 'El responsable debe ser un usuario activo con permiso para atender alertas.');
          await repos.complianceAlerts.update(a.id, { responsibleId: user.id });
          await repos.alertEvents.add({ alertId: a.id, kind: 'responsable', comment: `Responsable: ${user.fullName}${comment ? ` — ${comment}` : ''}`, actorId: actor.user.id, createdAt: now });
          if (user.id !== actor.user.id) await notifications.notify({ userId: user.id, kind: 'compliance_alert', title: `Te asignaron la alerta: ${a.title}`, body: comment ?? '' });
        } else if (body.action === 'seguimiento') {
          if (!comment) throw badRequest('invalid_comment', 'Escribe el seguimiento.');
          await repos.alertEvents.add({ alertId: a.id, kind: 'seguimiento', comment, actorId: actor.user.id, createdAt: now });
        } else if (body.action === 'atender') {
          if (!comment) throw badRequest('invalid_comment', 'Indica qué se hizo para atender la alerta.');
          const updated = await repos.complianceAlerts.update(a.id, { status: 'atendida', attendedAt: now, attendedBy: actor.user.id }, { expectedStatus: 'pendiente' });
          if (!updated) throw conflict('alert_already_attended', 'La alerta ya estaba atendida.');
          await repos.alertEvents.add({ alertId: a.id, kind: 'atendida', comment, actorId: actor.user.id, createdAt: now });
        } else {
          throw badRequest('invalid_action', 'La acción debe ser responsable, seguimiento o atender.');
        }
        return { value: await this.getAlert(a.id), newValues: { action: body.action, comment, responsibleId: body.responsibleId } };
      });
    },

    // ── HU-4.7 ─────────────────────────────────────────────────────────────────────
    async listEvidences(actor, query = {}) {
      const page = intInRange(query.page, { def: 1, min: 1, max: 100000 });
      const limit = intInRange(query.limit, { def: 25, min: 1, max: 100 });
      const f = { classifications: visibleClassifications(actor), limit, offset: (page - 1) * limit };
      if (query.project) f.projectCode = String(query.project);
      if (query.component) f.componentId = isUuid(String(query.component)) ? String(query.component) : '00000000-0000-0000-0000-000000000000';
      if (query.license) {
        const l = await repos.purchasedLicenses.findById(String(query.license));
        if (!l) return { items: [], total: 0, page, limit };
        f.licenseId = l.id;
      }
      if (query.kind) f.kind = oneOf(query.kind, EVIDENCE_KINDS, 'kind', 'El tipo');
      if (query.q) f.q = String(query.q).trim().slice(0, 80);
      const { items, total } = await repos.evidences.list(f);
      return { items: await serializeEvidences(items), total, page, limit };
    },

    async getEvidence(actor, id) {
      const [value] = await serializeEvidences([await loadVisibleEvidence(actor, id)]);
      return value;
    },

    /** Evidencia por enlace (contrato en el gestor documental, aviso publicado, etc.). */
    async createEvidenceLink(actor, body = {}) {
      return changeLog.track(actor, { entity: 'evidence', action: 'create' }, async () => {
        const f = await evidenceFields(actor, body);
        const url = optionalUrl(body.url, 'url', 'El enlace');
        if (!url) throw badRequest('invalid_url', 'Indica el enlace de la evidencia o adjunta un archivo.');
        const e = await repos.evidences.create({ ...f, url, authorId: actor.user.id, createdAt: clock() });
        const [value] = await serializeEvidences([e]);
        return { value, entityId: e.id, newValues: { ...f, url } };
      });
    },

    /** Evidencia con archivo: PDF, PNG, JPG o texto de hasta 5 MB. El tipo se verifica por su contenido. */
    async uploadEvidence(actor, meta = {}, buffer, fileName) {
      return changeLog.track(actor, { entity: 'evidence', action: 'upload' }, async () => {
        const f = await evidenceFields(actor, meta);
        if (!buffer?.length) throw badRequest('empty_file', 'No se recibió ningún archivo.');
        if (buffer.length > MAX_EVIDENCE_BYTES) throw new AppError(413, 'file_too_large', 'La evidencia no puede superar 5 MB.');
        const type = detectEvidenceType(buffer);
        if (!type) throw new AppError(415, 'unsupported_file', 'Adjunta un PDF, una imagen PNG/JPG o un archivo de texto.');
        const name = (optionalText(fileName, { field: 'file_name', label: 'El nombre del archivo', max: 160 }) ?? `evidencia.${type.ext}`).replace(/[^\w.\- ]+/g, '_');
        const storageKey = await evidenceFiles.save(buffer, type.ext);
        const e = await repos.evidences.create({
          ...f, storageKey, fileName: name, fileMime: type.mime, fileSize: buffer.length, authorId: actor.user.id, createdAt: clock(),
        });
        const [value] = await serializeEvidences([e]);
        return { value, entityId: e.id, newValues: { ...f, fileName: name, fileSize: buffer.length } };
      });
    },

    async downloadEvidence(actor, id) {
      const e = await loadVisibleEvidence(actor, id);
      if (!e.storageKey) throw notFound('file_not_found', 'Esta evidencia es un enlace, no tiene archivo.');
      const data = await evidenceFiles.read(e.storageKey);
      if (!data) throw notFound('file_not_found', 'No se encontró el archivo de la evidencia.');
      await changeLog.record({ actor, entity: 'evidence', entityId: e.id, action: 'download', newValues: { classification: e.classification } });
      return { data, mime: e.fileMime, fileName: e.fileName };
    },

    // ── HU-4.8 Reportes ────────────────────────────────────────────────────────────
    async report(actor, query = {}) {
      const cutoff = clock();
      const filters = {};
      const f = {};
      if (query.project) { f.projectCode = String(query.project); filters.proyecto = f.projectCode; }
      if (query.status) {
        oneOf(query.status, COMPONENT_LICENSE_STATUSES, 'status', 'El estado');
        f.statuses = [query.status];
        filters.estado = query.status;
      }
      if (query.category) {
        oneOf(query.category, LICENSE_CATEGORIES, 'category', 'La categoría');
        f.licenseIds = (await repos.licenseTypes.list({ category: query.category })).map((l) => l.id);
        filters.tipo_licencia = query.category;
      }
      const comps = query.category && !f.licenseIds.length ? [] : await software.serializeComponents((await repos.components.list(f)).items);
      const group = (fn, label) => {
        const m = new Map();
        for (const c of comps) { const k = fn(c); m.set(k, (m.get(k) ?? 0) + 1); }
        return [...m].map(([key, count]) => ({ key, label: label(key), count })).sort((a, b) => b.count - a.count);
      };
      let lics = (await licenses.list(actor, { vendor: query.vendor || undefined })).items;
      if (query.vendor) filters.proveedor = query.vendor;
      if (query.validity) {
        if (!VALIDITY_LABEL[query.validity]) throw badRequest('invalid_validity', 'La vigencia debe ser vigente, por_vencer o vencida.');
        lics = lics.filter((l) => l.validity === query.validity);
        filters.vigencia = query.validity;
      }
      if (query.expiresBefore) {
        const d = String(query.expiresBefore).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest('invalid_expires_before', 'La fecha debe tener el formato AAAA-MM-DD.');
        lics = lics.filter((l) => l.expiresOn && l.expiresOn <= d);
        filters.vence_antes_de = d;
      }
      const brief = (c) => ({ id: c.id, project: c.projectCode, name: c.name, version: c.version, declaredLicense: c.declaredLicense, license: c.license?.spdxId ?? null, status: c.licenseStatusLabel, flags: c.flags.map((x) => x.message) });
      return {
        cutoff,
        filters,
        components: {
          total: comps.length,
          byCategory: group((c) => c.license?.category ?? 'sin_confirmar', (k) => (k === 'sin_confirmar' ? 'Sin licencia confirmada' : labelOf(LICENSE_CATEGORIES, k))),
          byProject: group((c) => c.projectCode, (k) => k),
          byStatus: group((c) => c.licenseStatus, (k) => labelOf(COMPONENT_LICENSE_STATUSES, k)),
          unconfirmed: comps.filter((c) => c.licenseStatus !== 'confirmada').map(brief),
          pendingReviews: comps.filter((c) => c.isDirect && !c.isDev && !c.reviewClosed).map(brief),
          flagged: comps.filter((c) => c.flags.length && !c.reviewClosed).map(brief),
        },
        licenses: {
          total: lics.length,
          items: lics.map((l) => ({ code: l.code, vendor: l.vendor, product: l.product, edition: l.edition, quantity: l.quantity, assigned: l.assigned, available: l.available, expiresOn: l.expiresOn, validity: l.validity, validityLabel: l.validityLabel })),
          byVendor: [...lics.reduce((m, l) => m.set(l.vendor, (m.get(l.vendor) ?? 0) + 1), new Map())].map(([vendor, count]) => ({ vendor, count })),
        },
      };
    },

    async exportCsv(actor, query = {}) {
      const r = await this.report(actor, query);
      const filt = Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join('; ') || 'ninguno';
      const lines = [
        csvRow(['Reporte de inventario y cumplimiento de licencias — CiudadAlerta']),
        csvRow(['Fecha de corte', r.cutoff.toISOString()]),
        csvRow(['Generado por', actor.user.fullName]),
        csvRow(['Filtros', filt]),
        csvRow(['Aviso', 'Las posibles incompatibilidades son marcas para revisión humana, no un dictamen legal.']),
        '',
        csvRow(['Componentes por tipo de licencia']),
        csvRow(['Tipo', 'Cantidad']),
        ...r.components.byCategory.map((x) => csvRow([x.label, x.count])),
        '',
        csvRow(['Componentes sin licencia confirmada o con revisión pendiente']),
        csvRow(['Proyecto', 'Componente', 'Versión', 'Licencia declarada', 'Licencia confirmada', 'Estado', 'Sin licencia confirmada', 'Revisión pendiente', 'Posible incompatibilidad']),
        ...[...new Map([...r.components.unconfirmed, ...r.components.pendingReviews, ...r.components.flagged].map((c) => [c.id, c])).values()].map((c) => csvRow([
          c.project, c.name, c.version, c.declaredLicense, c.license, c.status,
          r.components.unconfirmed.some((x) => x.id === c.id) ? 'sí' : 'no',
          r.components.pendingReviews.some((x) => x.id === c.id) ? 'sí' : 'no',
          c.flags.join(' '),
        ])),
        '',
        csvRow(['Licencias adquiridas']),
        csvRow(['Código', 'Proveedor', 'Producto', 'Edición', 'Cantidad', 'Asignadas', 'Disponibles', 'Vence', 'Vigencia']),
        ...r.licenses.items.map((l) => csvRow([l.code, l.vendor, l.product, l.edition, l.quantity ?? 'sin límite', l.assigned, l.available ?? 'sin límite', l.expiresOn ?? 'no vence', l.validityLabel])),
      ];
      await changeLog.record({ actor, entity: 'export', action: 'licensing_csv', newValues: { filters: r.filters } });
      return { filename: `licenciamiento-${r.cutoff.toISOString().slice(0, 10)}.csv`, csv: `﻿${lines.join('\r\n')}\r\n` };
    },
  };
}
