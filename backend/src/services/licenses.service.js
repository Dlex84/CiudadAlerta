// Épica 4 — HU-4.3 licencias propietarias adquiridas · HU-4.4 asignación y conciliación.
import { can } from '../domain/permissions.js';
import { METRICS, MODALITIES, PURCHASED_CODE_RE, VALIDITY_LABEL, labelOf, licenseValidity } from '../domain/licensing.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { isUuid } from '../lib/tokens.js';
import { optionalText, requireText } from '../lib/validate.js';
import { dateOrThrow, oneOf } from './software.service.js';

/** RN-4.8: contratos y claves solo para quien tiene el permiso «confidencial». */
export const seesConfidential = (actor) => can(actor.permissions, 'confidencial', 'read');

function quantityOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw badRequest('invalid_quantity', 'La cantidad debe ser un número entero mayor que cero (vacío = sin límite).');
  return n;
}

export function createLicensesService({ repos, ctx, changeLog, clock = () => new Date() }) {
  const today = () => clock().toISOString().slice(0, 10);

  const view = (actor, l) => {
    const validity = licenseValidity(l, today());
    const secret = seesConfidential(actor);
    return {
      ...l,
      licenseKey: secret ? l.licenseKey : null,
      contractRef: secret ? l.contractRef : null,
      hasLicenseKey: Boolean(l.licenseKey),
      hasContractRef: Boolean(l.contractRef),
      confidentialHidden: !secret && Boolean(l.licenseKey || l.contractRef),
      modalityLabel: labelOf(MODALITIES, l.modality),
      metricLabel: labelOf(METRICS, l.metric),
      validity,
      validityLabel: VALIDITY_LABEL[validity],
      available: l.quantity === null ? null : l.quantity - l.assigned,
    };
  };

  async function load(id) {
    const v = String(id ?? '');
    const l = isUuid(v) || PURCHASED_CODE_RE.test(v) ? await repos.purchasedLicenses.findById(v) : null;
    if (!l) throw notFound('license_not_found', 'Licencia adquirida no encontrada.');
    return l;
  }

  async function serializeAssignments(list) {
    const names = await ctx.userNames(list.flatMap((a) => [a.assignedBy, a.releasedBy]));
    return list.map((a) => ({
      ...a,
      active: !a.releasedAt,
      assignedByName: names.get(a.assignedBy) ?? null,
      releasedByName: a.releasedBy ? names.get(a.releasedBy) : null,
    }));
  }

  function assertConfidentialWrite(actor, body) {
    const touches = ['licenseKey', 'contractRef'].some((k) => body[k] !== undefined && body[k] !== null && body[k] !== '');
    if (touches && !seesConfidential(actor)) throw forbidden('confidential_forbidden', 'No tienes permiso para registrar claves ni contratos.');
  }

  /** Destinatario según la métrica de la licencia (RN-4.5). */
  async function targetOf(lic, body) {
    const targetType = oneOf(body.targetType, METRICS.map((m) => ({ ...m })), 'target_type', 'El tipo de destinatario');
    if (targetType !== lic.metric) {
      throw conflict('wrong_target_type', `Esta licencia se asigna ${labelOf(METRICS, lic.metric).toLowerCase()}, no ${labelOf(METRICS, targetType).toLowerCase()}.`);
    }
    if (targetType === 'usuario') {
      const user = isUuid(String(body.targetUserId ?? '')) ? await repos.users.findById(String(body.targetUserId)) : null;
      if (!user || user.status !== 'active') throw badRequest('invalid_target_user', 'Elige un usuario activo.');
      return { targetType, targetUserId: user.id, targetName: user.fullName };
    }
    const label = targetType === 'equipo' ? 'El nombre del equipo' : 'El nombre de la aplicación';
    return { targetType, targetUserId: null, targetName: requireText(body.targetName, { field: 'target_name', label, min: 2, max: 120 }) };
  }

  async function assignTo(actor, lic, target) {
    if (!lic.isActive) throw conflict('license_inactive', 'La licencia está desactivada.');
    if (licenseValidity(lic, today()) === 'vencida') throw conflict('license_expired', `La licencia ${lic.code} venció el ${lic.expiresOn}: renuévala antes de asignarla.`);
    const r = await repos.purchasedLicenses.assign({ licenseId: lic.id, ...target, assignedBy: actor.user.id, assignedAt: clock() });
    if (r.error === 'duplicate') throw conflict('already_assigned', `${target.targetName} ya tiene asignada esta licencia.`);
    if (r.error === 'no_capacity') {
      throw conflict('no_licenses_available', `No quedan licencias disponibles de ${lic.product}: ${lic.assigned} de ${lic.quantity} asignadas.`, {
        quantity: lic.quantity, assigned: lic.assigned,
      });
    }
    return r.assignment;
  }

  return {
    meta: () => ({ modalities: MODALITIES, metrics: METRICS, validity: VALIDITY_LABEL }),

    async list(actor, query = {}) {
      const f = {};
      if (query.q) f.q = String(query.q).trim().slice(0, 60);
      if (query.vendor) f.vendor = String(query.vendor).slice(0, 80);
      if (query.active !== 'all') f.active = query.active !== 'false';
      let items = (await repos.purchasedLicenses.list(f)).map((l) => view(actor, l));
      if (query.validity) {
        if (!VALIDITY_LABEL[query.validity]) throw badRequest('invalid_validity', 'La vigencia debe ser vigente, por_vencer o vencida.');
        items = items.filter((l) => l.validity === query.validity);
      }
      return { items };
    },

    async get(actor, id) {
      const l = await load(id);
      const assignments = await serializeAssignments(await repos.licenseAssignments.list({ licenseId: l.id }));
      return { license: view(actor, l), assignments };
    },

    async create(actor, body = {}) {
      assertConfidentialWrite(actor, body);
      return changeLog.track(actor, { entity: 'purchased_license', action: 'create' }, async () => {
        const modality = oneOf(body.modality, MODALITIES, 'modality', 'La modalidad');
        const startsOn = dateOrThrow(body.startsOn, 'starts_on', 'La fecha de inicio');
        const expiresOn = dateOrThrow(body.expiresOn, 'expires_on', 'La fecha de vencimiento', { optional: true });
        if (modality === 'suscripcion' && !expiresOn) throw badRequest('expires_on_required', 'Una suscripción debe tener fecha de vencimiento.');
        if (expiresOn && expiresOn < startsOn) throw badRequest('invalid_expires_on', 'El vencimiento no puede ser anterior al inicio.');
        const alertDays = body.alertDays === undefined ? 30 : Number(body.alertDays);
        if (!Number.isInteger(alertDays) || alertDays < 0 || alertDays > 365) throw badRequest('invalid_alert_days', 'Los días de aviso deben ser un entero entre 0 y 365.');
        const data = {
          vendor: requireText(body.vendor, { field: 'vendor', label: 'El proveedor', min: 2, max: 80 }),
          product: requireText(body.product, { field: 'product', label: 'El producto', min: 2, max: 120 }),
          edition: optionalText(body.edition, { field: 'edition', label: 'La edición', max: 60 }),
          modality,
          metric: oneOf(body.metric, METRICS, 'metric', 'La métrica'),
          quantity: quantityOrNull(body.quantity),
          startsOn, expiresOn, alertDays,
          licenseKey: optionalText(body.licenseKey, { field: 'license_key', label: 'La clave', max: 500 }),
          contractRef: optionalText(body.contractRef, { field: 'contract_ref', label: 'La referencia del contrato', max: 200 }),
          notes: optionalText(body.notes, { field: 'notes', label: 'Las notas', max: 1000 }),
          isActive: true, createdBy: actor.user.id, createdAt: clock(),
        };
        const l = await repos.purchasedLicenses.create(data);
        const { licenseKey, contractRef, ...logged } = data;
        return { value: view(actor, l), entityId: l.id, newValues: { code: l.code, ...logged, hasLicenseKey: Boolean(licenseKey), hasContractRef: Boolean(contractRef) } };
      });
    },

    async update(actor, id, body = {}) {
      const l = await load(id);
      assertConfidentialWrite(actor, body);
      return changeLog.track(actor, { entity: 'purchased_license', action: 'update', entityId: l.id }, async () => {
        const patch = {};
        if (body.edition !== undefined) patch.edition = optionalText(body.edition, { field: 'edition', label: 'La edición', max: 60 });
        if (body.expiresOn !== undefined) {
          patch.expiresOn = dateOrThrow(body.expiresOn, 'expires_on', 'La fecha de vencimiento', { optional: true });
          if (l.modality === 'suscripcion' && !patch.expiresOn) throw badRequest('expires_on_required', 'Una suscripción debe tener fecha de vencimiento.');
          if (patch.expiresOn && patch.expiresOn < l.startsOn) throw badRequest('invalid_expires_on', 'El vencimiento no puede ser anterior al inicio.');
        }
        if (body.alertDays !== undefined) {
          const n = Number(body.alertDays);
          if (!Number.isInteger(n) || n < 0 || n > 365) throw badRequest('invalid_alert_days', 'Los días de aviso deben ser un entero entre 0 y 365.');
          patch.alertDays = n;
        }
        if (body.licenseKey !== undefined) patch.licenseKey = optionalText(body.licenseKey, { field: 'license_key', label: 'La clave', max: 500 });
        if (body.contractRef !== undefined) patch.contractRef = optionalText(body.contractRef, { field: 'contract_ref', label: 'La referencia del contrato', max: 200 });
        if (body.notes !== undefined) patch.notes = optionalText(body.notes, { field: 'notes', label: 'Las notas', max: 1000 });
        if (body.isActive !== undefined) {
          if (typeof body.isActive !== 'boolean') throw badRequest('invalid_is_active', 'isActive debe ser verdadero o falso.');
          if (!body.isActive && l.assigned > 0) throw conflict('license_in_use', `Libera las ${l.assigned} asignaciones vigentes antes de desactivarla.`);
          patch.isActive = body.isActive;
        }
        let updated = l;
        if (body.quantity !== undefined) {
          const quantity = quantityOrNull(body.quantity);
          updated = await repos.purchasedLicenses.setQuantity(l.id, quantity, clock());
          if (!updated) throw conflict('quantity_below_assigned', `Hay ${l.assigned} asignaciones vigentes: la cantidad no puede ser menor.`, { assigned: l.assigned });
        }
        if (Object.keys(patch).length) updated = await repos.purchasedLicenses.update(l.id, { ...patch, updatedAt: clock() });
        else if (body.quantity === undefined) throw badRequest('nothing_to_update', 'No hay cambios que guardar.');
        const pick = (x) => ({ edition: x.edition, quantity: x.quantity, expiresOn: x.expiresOn, alertDays: x.alertDays, notes: x.notes, isActive: x.isActive, hasLicenseKey: Boolean(x.licenseKey), hasContractRef: Boolean(x.contractRef) });
        return { value: view(actor, updated), oldValues: pick(l), newValues: pick(updated) };
      });
    },

    // ── HU-4.4 ─────────────────────────────────────────────────────────────────────
    async assign(actor, id, body = {}) {
      const lic = await load(id);
      return changeLog.track(actor, { entity: 'license_assignment', action: 'assign', entityId: lic.id }, async () => {
        const target = await targetOf(lic, body);
        const a = await assignTo(actor, lic, target);
        const [value] = await serializeAssignments([a]);
        return { value: { assignment: value, license: view(actor, await repos.purchasedLicenses.findById(lic.id)) }, newValues: { code: lic.code, ...target } };
      });
    },

    /** Liberar conserva la fila con fecha, responsable y motivo (historial). */
    async release(actor, assignmentId, body = {}) {
      const a = await repos.licenseAssignments.findById(assignmentId);
      if (!a) throw notFound('assignment_not_found', 'Asignación no encontrada.');
      return changeLog.track(actor, { entity: 'license_assignment', action: 'release', entityId: a.id }, async () => {
        const reason = requireText(body.reason, { field: 'reason', label: 'El motivo', min: 3, max: 300 });
        const released = await repos.purchasedLicenses.release(a.id, { releasedBy: actor.user.id, releasedAt: clock(), reason });
        if (!released) throw conflict('already_released', 'Esa asignación ya estaba liberada.');
        const [value] = await serializeAssignments([released]);
        return { value: { assignment: value, license: view(actor, await repos.purchasedLicenses.findById(a.licenseId)) }, newValues: { targetName: a.targetName, reason } };
      });
    },

    /** Reasignar = liberar con motivo + asignar al nuevo destinatario; si lo segundo falla, se restituye lo primero. */
    async reassign(actor, assignmentId, body = {}) {
      const a = await repos.licenseAssignments.findById(assignmentId);
      if (!a || a.releasedAt) throw notFound('assignment_not_found', 'Asignación vigente no encontrada.');
      const lic = await repos.purchasedLicenses.findById(a.licenseId);
      return changeLog.track(actor, { entity: 'license_assignment', action: 'reassign', entityId: a.id }, async () => {
        const reason = requireText(body.reason, { field: 'reason', label: 'El motivo', min: 3, max: 300 });
        const target = await targetOf(lic, { ...body, targetType: lic.metric });
        if ((target.targetUserId ?? target.targetName.toLowerCase()) === (a.targetUserId ?? a.targetName.toLowerCase())) {
          throw badRequest('same_target', 'El nuevo destinatario es el mismo que el actual.');
        }
        await repos.purchasedLicenses.release(a.id, { releasedBy: actor.user.id, releasedAt: clock(), reason: `Reasignada: ${reason}` });
        let created;
        try {
          created = await assignTo(actor, await repos.purchasedLicenses.findById(lic.id), target);
        } catch (err) {
          await repos.purchasedLicenses.assign({ licenseId: lic.id, targetType: a.targetType, targetUserId: a.targetUserId, targetName: a.targetName, assignedBy: actor.user.id, assignedAt: clock() });
          throw err;
        }
        const [value] = await serializeAssignments([created]);
        return { value: { assignment: value, license: view(actor, await repos.purchasedLicenses.findById(lic.id)) }, newValues: { from: a.targetName, to: target.targetName, reason } };
      });
    },

    /**
     * Conciliación: adquiridas vs asignadas vs disponibles, y verificación de que el contador coincide
     * con las asignaciones vigentes registradas.
     */
    async reconciliation(actor) {
      const out = [];
      for (const l of await repos.purchasedLicenses.list({ active: true })) {
        const active = (await repos.licenseAssignments.list({ licenseId: l.id, active: true })).length;
        const v = view(actor, l);
        out.push({
          id: l.id, code: l.code, vendor: l.vendor, product: l.product, metric: l.metric, quantity: l.quantity, assigned: l.assigned,
          available: v.available, activeAssignments: active, consistent: active === l.assigned, validity: v.validity, validityLabel: v.validityLabel,
          usage: l.quantity ? Math.round((l.assigned / l.quantity) * 100) : null,
        });
      }
      return { generatedAt: clock(), items: out };
    },

    view,
  };
}
