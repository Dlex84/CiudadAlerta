import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../components/ui.jsx';
import { APPROVAL_LABEL, StatusChip } from '../../ops.jsx';
import { Link } from '../../router.jsx';
import { IncidentForm, IncidentModal } from './Incidents.jsx';
import { useAssignees } from './Reports.jsx';

// Ficha de trabajo de un reporte: HU-2.2 (estado e historial), HU-2.3 (responsable), HU-2.4 (aprobación), HU-2.6 (incidencias).
export default function ReportDetail({ id }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [assignHistory, setAssignHistory] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const assignees = useAssignees();

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/reports/${encodeURIComponent(id)}`);
      setData(d);
      const rid = d.report.id;
      const [a, h, i] = await Promise.all([
        api.get(`/reports/${rid}/approvals`),
        api.get(`/reports/${rid}/assignments`),
        can('incidencias', 'read') ? api.get(`/incidents?report=${rid}&limit=100`) : Promise.resolve({ items: [] }),
      ]);
      setApprovals(a);
      setAssignHistory(h.items);
      setIncidents(i.items);
      setError('');
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn, ok) {
    try { await fn(); setNotice(ok); setError(''); setModal(null); await load(); }
    catch (e) { setError(e.message); setModal(null); }
  }

  if (!data) return <><h1>Reporte</h1><Alert>{error}</Alert>{!error && <p className="muted">Cargando…</p>}</>;
  const r = data.report;
  const closed = ['resuelto', 'rechazado'].includes(r.status);
  const latest = approvals?.rounds.at(-1);
  const actionable = latest?.status === 'pending'
    ? latest.steps.find((s, i) => s.decision === 'pending' && latest.steps.slice(0, i).filter((p) => p.required).every((p) => p.decision === 'approved'))
    : null;

  return (
    <>
      <p className="muted"><Link to="/admin/reportes">‹ Reportes</Link></p>
      <div className="row-between">
        <h1>#{r.code} · {r.title}</h1>
        <span><StatusChip report={r} /></span>
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>

      <div className="grid-2">
        <section className="card">
          <dl className="review">
            <dt>Tipo</dt><dd>{r.typeName}</dd>
            <dt>Ubicación</dt><dd>{r.location}</dd>
            <dt>Descripción</dt><dd>{r.description}</dd>
            <dt>Reportado por</dt><dd>{r.createdBy.name} · {fmtDate(r.createdAt)}</dd>
            <dt>Fecha límite</dt><dd>{fmtDate(r.dueAt)}{r.overdue && <b className="text-bad"> · vencido</b>}</dd>
            <dt>Responsable</dt><dd>{r.assignee ? `${r.assignee.name} (desde ${fmtDate(r.assignedAt)})` : 'Sin asignar'}</dd>
            {r.resolvedAt && <><dt>Resuelto</dt><dd>{fmtDate(r.resolvedAt)}</dd></>}
          </dl>
        </section>

        <section className="card stack">
          <h2 className="h2">Acciones</h2>
          {data.allowedTransitions.length === 0 && !closed && <p className="muted" style={{ margin: 0 }}>No tienes acciones disponibles sobre este reporte.</p>}
          {closed && <p className="muted" style={{ margin: 0 }}>Reporte cerrado.</p>}
          <div className="btn-row">
            {data.allowedTransitions.map((t) => (
              <button key={t.to} className={`btn sm ${t.to === 'rechazado' ? 'danger' : t.to === 'en_revision' && r.status === 'en_proceso' ? 'ghost' : ''}`}
                disabled={!!t.blocked} title={t.blocked ?? ''} onClick={() => setModal({ type: 'transition', t })}>
                {t.to === 'en_revision' && r.status === 'en_proceso' ? 'Devolver a revisión' : `→ ${t.label}`}
              </button>
            ))}
          </div>
          {can('asignaciones', 'update') && !closed && (
            <button className="btn ghost sm" onClick={() => setModal({ type: 'assign' })}>{r.assignee ? 'Reasignar responsable' : 'Asignar responsable'}</button>
          )}
          {can('bitacora', 'read') && <Link to={`/admin/bitacora?report=${r.code}`}>Ver en la bitácora →</Link>}
        </section>
      </div>

      <section className="card stack" style={{ marginTop: 16 }}>
        <div className="row-between">
          <h2 className="h2">Aprobación de cierre</h2>
          {approvals && <span className={`chip ${APPROVAL_LABEL[approvals.currentStatus]?.[1] ?? ''}`}>{APPROVAL_LABEL[approvals.currentStatus]?.[0]}</span>}
        </div>
        {approvals?.configuredSteps.length === 0 && <p className="muted" style={{ margin: 0 }}>Este tipo de reporte no requiere aprobación para cerrarse.</p>}
        {approvals?.rounds.length === 0 && approvals?.configuredSteps.length > 0 && (
          <p className="muted" style={{ margin: 0 }}>Pasos: {approvals.configuredSteps.map((s) => `${s.stepOrder}. ${s.name}${s.required ? '' : ' (opcional)'}`).join(' · ')}. Se solicita cuando el trabajo está «En proceso» y terminado.</p>
        )}
        {approvals?.rounds.slice().reverse().map((round) => (
          <div key={round.round} className="round">
            <div className="muted">Solicitud {round.round} · {APPROVAL_LABEL[round.status]?.[0]}</div>
            <table>
              <tbody>
                {round.steps.map((s) => (
                  <tr key={s.id}>
                    <td>{s.stepOrder}. {s.stepName}{!s.required && <span className="muted"> (opcional)</span>}</td>
                    <td><span className={`chip ${APPROVAL_LABEL[s.decision]?.[1] ?? ''}`}>{APPROVAL_LABEL[s.decision]?.[0]}</span></td>
                    <td>{s.decidedBy ? `${s.decidedBy} · ${fmtDate(s.decidedAt)}` : `Solicitó ${s.requestedBy} · ${fmtDate(s.requestedAt)}`}</td>
                    <td>{s.comment && <i>“{s.comment}”</i>}</td>
                    <td className="actions">
                      {actionable?.id === s.id && can('aprobaciones', 'update') && <>
                        <button className="btn sm" onClick={() => setModal({ type: 'decide', step: s, decision: 'approved' })}>Aprobar</button>
                        <button className="btn ghost sm" onClick={() => setModal({ type: 'decide', step: s, decision: 'returned' })}>Devolver</button>
                        <button className="btn danger sm" onClick={() => setModal({ type: 'decide', step: s, decision: 'rejected' })}>Rechazar</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {approvals?.canRequest && can('operaciones', 'update') && (
          <div><button className="btn sm" onClick={() => act(() => api.post(`/reports/${r.id}/approvals`), 'Aprobación solicitada. Se avisó a los aprobadores.')}>Solicitar aprobación de cierre</button></div>
        )}
      </section>

      {can('incidencias', 'read') && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <div className="row-between">
            <h2 className="h2">Incidencias operativas</h2>
            {can('incidencias', 'create') && r.status !== 'rechazado' && <button className="btn ghost sm" onClick={() => setModal({ type: 'incident' })}>+ Registrar incidencia</button>}
          </div>
          {incidents.length === 0 && <p className="muted" style={{ margin: 0 }}>Sin incidencias.</p>}
          <ul className="plain">
            {incidents.map((i) => (
              <li key={i.id}>
                <button type="button" className="linklike" onClick={() => setModal({ type: 'incidentView', id: i.id })}>{i.categoryLabel}</button> · <span className="chip">{i.statusLabel}</span> · prioridad {i.priorityLabel.toLowerCase()}
                <div className="muted">{i.description}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2 className="h2">Historial de estados</h2>
          <ol className="timeline">
            {data.history.map((h, i) => (
              <li key={i} className={`done ${h.toStatus === 'rechazado' ? 'bad' : ''}`}>
                <b>{h.label}</b>
                <small className="muted">{fmtDate(h.createdAt)} · {h.changedBy}</small>
                {h.reason && <small>Motivo: {h.reason}</small>}
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h2 className="h2">Asignaciones</h2>
          {assignHistory.length === 0 && <p className="muted">Nunca se ha asignado.</p>}
          <ol className="timeline">
            {assignHistory.map((a, i) => (
              <li key={i} className="done">
                <b>{a.previousAssignee ? `${a.previousAssignee.name} → ${a.assignee.name}` : a.assignee.name}</b>
                <small className="muted">{fmtDate(a.createdAt)} · asignó {a.assignedBy.name}</small>
                {a.reason && <small>Motivo: {a.reason}</small>}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {modal?.type === 'transition' && (
        <ReasonModal title={`Cambiar a «${modal.t.label}»`} required={modal.t.reasonRequired} label={modal.t.reasonRequired ? 'Motivo (obligatorio)' : 'Comentario (opcional)'}
          onClose={() => setModal(null)} onSubmit={(reason) => act(() => api.post(`/reports/${r.id}/transitions`, { to: modal.t.to, reason }), `Estado actualizado a «${modal.t.label}».`)} />
      )}
      {modal?.type === 'assign' && (
        <AssignModal report={r} assignees={assignees} onClose={() => setModal(null)}
          onSubmit={(body) => act(() => api.put(`/reports/${r.id}/assignee`, body), 'Responsable actualizado y notificado.')} />
      )}
      {modal?.type === 'decide' && (
        <ReasonModal title={{ approved: 'Aprobar', returned: 'Devolver para corrección', rejected: 'Rechazar' }[modal.decision] + ` · ${modal.step.stepName}`}
          required={modal.decision !== 'approved'} label={modal.decision === 'approved' ? 'Comentario (opcional)' : 'Motivo (obligatorio)'}
          danger={modal.decision === 'rejected'}
          onClose={() => setModal(null)}
          onSubmit={(comment) => act(() => api.post(`/reports/${r.id}/approvals/${modal.step.id}/decision`, { decision: modal.decision, comment }), 'Decisión registrada.')} />
      )}
      {modal?.type === 'incident' && (
        <IncidentForm reportId={r.id} assignees={assignees} onClose={() => setModal(null)} onSaved={() => { setModal(null); setNotice('Incidencia registrada.'); load(); }} />
      )}
      {modal?.type === 'incidentView' && <IncidentModal id={modal.id} assignees={assignees} onClose={() => { setModal(null); load(); }} />}
    </>
  );
}

export function ReasonModal({ title, label, required, danger, onClose, onSubmit }) {
  const [text, setText] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim() || undefined); }}>
        <Field label={label}><textarea rows={3} required={required} minLength={required ? 3 : undefined} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className={`btn ${danger ? 'danger' : ''}`}>Confirmar</button></div>
      </form>
    </Modal>
  );
}

function AssignModal({ report, assignees, onClose, onSubmit }) {
  const [assigneeId, setAssigneeId] = useState('');
  const [reason, setReason] = useState('');
  const reassign = Boolean(report.assignee);
  return (
    <Modal title={reassign ? 'Reasignar responsable' : 'Asignar responsable'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit({ assigneeId, reason: reason.trim() || undefined }); }}>
        <Field label="Responsable">
          <select required value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Elige…</option>
            {assignees.filter((u) => u.id !== report.assignee?.id).map((u) => (
              <option key={u.id} value={u.id}>{u.fullName} · {u.roleName} · {u.openAssigned} abierto(s)</option>
            ))}
          </select>
        </Field>
        <Field label={reassign ? 'Motivo de la reasignación (obligatorio)' : 'Nota (opcional)'}>
          <textarea rows={2} required={reassign} minLength={reassign ? 3 : undefined} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="muted" style={{ margin: 0 }}>Solo aparecen usuarios activos con permiso para atender reportes. Se les avisará en la app y por correo.</p>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}
