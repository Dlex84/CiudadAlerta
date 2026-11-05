import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../components/ui.jsx';
import { Pager, useOpsMeta } from '../../ops.jsx';
import { Link } from '../../router.jsx';
import { useAssignees } from './Reports.jsx';

// HU-2.6 — Incidencias operativas
const PRIORITY_KIND = { baja: '', media: '', alta: 'warn', critica: 'bad' };

export default function Incidents() {
  const meta = useOpsMeta();
  const empty = { report: '', status: '', priority: '', category: '' };
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 25 });
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const assignees = useAssignees();

  const load = useCallback(async () => {
    try { setData(await api.get(`/incidents${qs({ ...filters, page })}`)); setError(''); } catch (e) { setError(e.message); }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  return (
    <>
      <h1>Incidencias operativas</h1>
      <p className="muted">Problemas internos al atender un reporte (falta de material, equipo, clima…). No son el reporte del ciudadano.</p>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <Field label="Reporte" placeholder="CA-0001" value={filters.report} onChange={set('report')} />
        <Field label="Estado"><select value={filters.status} onChange={set('status')}><option value="">Todos</option>{meta?.incidentStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Prioridad"><select value={filters.priority} onChange={set('priority')}><option value="">Todas</option>{meta?.incidentPriorities.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Categoría"><select value={filters.category} onChange={set('category')}><option value="">Todas</option>{meta?.incidentCategories.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Reporte</th><th>Categoría</th><th>Descripción</th><th>Prioridad</th><th>Estado</th><th>Responsable</th><th>Creada</th></tr></thead>
          <tbody>
            {data.items.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => setOpen(i.id)}>
                <td><Link to={`/admin/reporte?id=${i.reportId}`} onClick={(e) => e.stopPropagation()}>#{i.reportCode}</Link></td>
                <td>{i.categoryLabel}</td>
                <td>{i.description}</td>
                <td><span className={`chip ${PRIORITY_KIND[i.priority]}`}>{i.priorityLabel}</span></td>
                <td>{i.statusLabel}</td>
                <td>{i.assignee?.name ?? '—'}</td>
                <td>{fmtDate(i.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <div className="empty">No hay incidencias con esos filtros.</div>}
      </div>
      <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} noun="incidencia(s)" />
      {open && <IncidentModal id={open} assignees={assignees} onClose={() => { setOpen(null); load(); }} />}
    </>
  );
}

export function IncidentForm({ reportId, assignees, onClose, onSaved }) {
  const meta = useOpsMeta();
  const [form, setForm] = useState({ category: 'material', priority: 'media', description: '', assigneeId: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { await api.post(`/reports/${reportId}/incidents`, { ...form, assigneeId: form.assigneeId || undefined }); onSaved(); }
    catch (x) { setError(x.message); }
  }
  return (
    <Modal title="Registrar incidencia" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Categoría"><select value={form.category} onChange={set('category')}>{meta?.incidentCategories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
        <Field label="Prioridad"><select value={form.priority} onChange={set('priority')}>{meta?.incidentPriorities.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></Field>
        <Field label="Descripción"><textarea rows={3} required minLength={5} maxLength={1000} placeholder="Ej.: no hay bombillas LED en almacén" value={form.description} onChange={set('description')} /></Field>
        <Field label="Responsable (opcional)">
          <select value={form.assigneeId} onChange={set('assigneeId')}><option value="">Sin responsable</option>{assignees.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
        </Field>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Registrar</button></div>
      </form>
    </Modal>
  );
}

const EVENT_TEXT = { created: 'Creó la incidencia', status: 'Cambió el estado', comment: 'Comentó', update: 'Actualizó' };

export function IncidentModal({ id, assignees, onClose }) {
  const { can } = useAuth();
  const meta = useOpsMeta();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [nextStatus, setNextStatus] = useState('');

  const load = useCallback(() => api.get(`/incidents/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(body) {
    try { setData(await api.patch(`/incidents/${id}`, body)); setError(''); setNextStatus(''); setResolution(''); } catch (e) { setError(e.message); }
  }
  async function addComment(e) {
    e.preventDefault();
    try { setData(await api.post(`/incidents/${id}/comments`, { comment })); setComment(''); setError(''); } catch (x) { setError(x.message); }
  }

  const i = data?.incident;
  const label = (list, k) => meta?.[list].find((x) => x.key === k)?.label ?? k;
  const next = i ? meta?.incidentTransitions[i.status] ?? [] : [];
  const editable = can('incidencias', 'update');

  return (
    <Modal title={i ? `Incidencia · ${i.categoryLabel} · #${i.reportCode}` : 'Incidencia'} onClose={onClose}>
      <Alert>{error}</Alert>
      {i && (
        <div className="stack">
          <p style={{ margin: 0 }}>{i.description}</p>
          <p className="muted" style={{ margin: 0 }}>
            Estado: <b>{i.statusLabel}</b> · Prioridad: <b>{i.priorityLabel}</b> · Responsable: <b>{i.assignee?.name ?? '—'}</b> · Registró {i.createdByName}
          </p>
          {i.resolution && <Alert kind="ok">Resolución: {i.resolution}</Alert>}

          {editable && (
            <div className="toolbar" style={{ margin: 0 }}>
              <Field label="Prioridad"><select value={i.priority} onChange={(e) => patch({ priority: e.target.value })}>{meta?.incidentPriorities.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>
              <Field label="Responsable">
                <select value={i.assigneeId ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
                  <option value="">Sin responsable</option>{assignees.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              </Field>
              {next.length > 0 && (
                <Field label="Cambiar estado">
                  <select value={nextStatus} onChange={(e) => { const v = e.target.value; setNextStatus(v); if (v && v !== 'resuelta') patch({ status: v }); }}>
                    <option value="">—</option>{next.map((s) => <option key={s} value={s}>{label('incidentStatuses', s)}</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}
          {nextStatus === 'resuelta' && (
            <form className="stack" onSubmit={(e) => { e.preventDefault(); patch({ status: 'resuelta', resolution }); }}>
              <Field label="¿Cómo se resolvió? (obligatorio)"><textarea rows={2} required minLength={5} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
              <div><button className="btn sm">Marcar como resuelta</button></div>
            </form>
          )}

          <div className="section-title" style={{ margin: '8px 0 0' }}>Historial y comentarios</div>
          <ol className="timeline">
            {data.events.map((e) => (
              <li key={e.id} className="done">
                <b>{EVENT_TEXT[e.kind]}{e.kind === 'status' && `: ${label('incidentStatuses', e.fromValue)} → ${label('incidentStatuses', e.toValue)}`}{e.kind === 'update' && `: ${e.fromValue} → ${e.toValue}`}</b>
                <small className="muted">{fmtDate(e.createdAt)} · {e.actorName}</small>
                {e.comment && e.kind !== 'created' && <small>{e.comment}</small>}
              </li>
            ))}
          </ol>
          {editable && (
            <form className="row" style={{ marginTop: 0 }} onSubmit={addComment}>
              <input className="grow-input" placeholder="Escribe un comentario…" required value={comment} onChange={(e) => setComment(e.target.value)} />
              <button className="btn sm">Comentar</button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
