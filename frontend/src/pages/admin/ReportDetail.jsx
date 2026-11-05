import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../components/ui.jsx';
import { StatusChip } from '../../ops.jsx';
import { Link } from '../../router.jsx';

// Ficha de trabajo de un reporte: HU-2.2 (estado e historial).
export default function ReportDetail({ id }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/reports/${encodeURIComponent(id)}`);
      setData(d);
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
          {can('bitacora', 'read') && <Link to={`/admin/bitacora?report=${r.code}`}>Ver en la bitácora →</Link>}
        </section>
      </div>

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
      </div>

      {modal?.type === 'transition' && (
        <ReasonModal title={`Cambiar a «${modal.t.label}»`} required={modal.t.reasonRequired} label={modal.t.reasonRequired ? 'Motivo (obligatorio)' : 'Comentario (opcional)'}
          onClose={() => setModal(null)} onSubmit={(reason) => act(() => api.post(`/reports/${r.id}/transitions`, { to: modal.t.to, reason }), `Estado actualizado a «${modal.t.label}».`)} />
      )}
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
