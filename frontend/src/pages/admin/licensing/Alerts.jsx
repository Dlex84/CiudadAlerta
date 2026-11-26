import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../../components/ui.jsx';
import { CRIT_CHIP, Options, STATE_CHIP, useLicensingMeta } from './shared.jsx';

// HU-4.6 — Alertas de cumplimiento: reglas por tipo y criticidad, responsable y seguimiento, sin duplicados.
export default function Alerts() {
  const { can } = useAuth();
  const meta = useLicensingMeta();
  const [filters, setFilters] = useState({ state: '', kind: '', criticality: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const load = useCallback(() => api.get(`/compliance/alerts${qs(filters)}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [filters]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  async function scan() {
    try { const r = await api.post('/compliance/scan'); setNotice(`Revisión hecha: ${r.created} alertas nuevas, ${r.skipped} omitidas por estar repetidas.`); load(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Vencimientos de licencias y componentes pendientes de revisar. El servidor las revisa solo cada 15 minutos.</p>
        {can('cumplimiento', 'update') && (
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setShowRules(true)}>Reglas</button>
            <button className="btn" onClick={scan}>Revisar ahora</button>
          </div>
        )}
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      {data && (
        <div className="tiles">
          {['pendiente', 'vencida', 'atendida'].map((s) => (
            <button key={s} type="button" className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setFilters({ ...filters, state: filters.state === s ? '' : s })}>
              <b>{data.counts[s]}</b><small>{{ pendiente: 'Pendientes', vencida: 'Vencidas', atendida: 'Atendidas' }[s]}</small>
            </button>
          ))}
        </div>
      )}
      <div className="toolbar">
        <Field label="Estado"><select value={filters.state} onChange={set('state')}><option value="">Todos</option><option value="pendiente">Pendientes</option><option value="vencida">Vencidas</option><option value="atendida">Atendidas</option></select></Field>
        <Field label="Tipo"><select value={filters.kind} onChange={set('kind')}><Options list={meta?.alertKinds} all="Todos" /></select></Field>
        <Field label="Criticidad"><select value={filters.criticality} onChange={set('criticality')}><Options list={meta?.criticalities} all="Todas" /></select></Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Alerta</th><th>Tipo</th><th>Criticidad</th><th>Fecha límite</th><th>Estado</th><th>Responsable</th></tr></thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td><button type="button" className="linklike" onClick={() => setOpen(a.id)}><b>{a.title}</b></button><br /><small className="muted">{a.detail}</small></td>
                <td>{a.kindLabel}</td>
                <td><span className={`chip ${CRIT_CHIP[a.criticality]}`}>{a.criticalityLabel}</span></td>
                <td>{a.dueOn}</td>
                <td><span className={`chip ${STATE_CHIP[a.state]}`}>{a.stateLabel}</span></td>
                <td>{a.responsibleName ?? <span className="muted">Sin asignar</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="empty">No hay alertas con esos filtros.</div>}
      </div>
      {open && <AlertDetail id={open} onClose={() => { setOpen(null); load(); }} />}
      {showRules && <Rules meta={meta} onClose={() => setShowRules(false)} />}
    </>
  );
}

function AlertDetail({ id, onClose }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [eligible, setEligible] = useState([]);
  const [comment, setComment] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api.get(`/compliance/alerts/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
    if (can('usuarios', 'read')) api.get('/users?status=active&limit=100').then((r) => setEligible(r.items)).catch(() => {});
  }, [load]);
  async function act(action) {
    try { setData(await api.post(`/compliance/alerts/${id}/actions`, { action, comment: comment || undefined, responsibleId: responsibleId || undefined })); setComment(''); setError(''); } catch (e) { setError(e.message); }
  }
  const a = data?.alert;
  return (
    <Modal title={a ? a.title : 'Alerta'} onClose={onClose}>
      <Alert>{error}</Alert>
      {a && (
        <div className="stack">
          <p style={{ margin: 0 }}><span className={`chip ${CRIT_CHIP[a.criticality]}`}>{a.criticalityLabel}</span> <span className={`chip ${STATE_CHIP[a.state]}`}>{a.stateLabel}</span> · {a.kindLabel} · fecha límite {a.dueOn}</p>
          <p className="muted" style={{ margin: 0 }}>{a.detail}</p>
          <ol className="timeline">
            {data.events.map((e) => <li key={e.id} className="done"><b>{e.kind}</b><small className="muted">{fmtDate(e.createdAt)} · {e.actorName}</small>{e.comment && <small>{e.comment}</small>}</li>)}
          </ol>
          {a.status === 'pendiente' && can('cumplimiento', 'update') && (
            <div className="stack card">
              <Field label="Comentario"><textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Qué se hizo o qué falta" /></Field>
              <div className="row">
                <select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}><option value="">Responsable…</option>{eligible.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>)}</select>
                <button className="btn ghost sm" disabled={!responsibleId} onClick={() => act('responsable')}>Asignar</button>
                <button className="btn ghost sm" onClick={() => act('seguimiento')}>Agregar seguimiento</button>
                <button className="btn sm" onClick={() => act('atender')}>Marcar atendida</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Rules({ meta, onClose }) {
  const [rules, setRules] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { api.get('/compliance/rules').then((r) => setRules(r.items)).catch((e) => setError(e.message)); }, []);
  const set = (kind, k, v) => setRules(rules.map((r) => (r.kind === kind ? { ...r, [k]: v } : r)));
  async function save(r) {
    try { await api.patch(`/compliance/rules/${r.kind}`, { daysBefore: Number(r.daysBefore), dedupeDays: Number(r.dedupeDays), criticality: r.criticality, isActive: r.isActive }); setNotice(`Regla «${r.kindLabel}» guardada.`); setError(''); } catch (e) { setError(e.message); }
  }
  return (
    <Modal title="Reglas de alerta" onClose={onClose}>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <p className="muted" style={{ margin: 0 }}>«Días» = plazo para atender desde que se detecta (en vencimientos manda el aviso de cada licencia). «Ventana» = días en que no se repite la misma alerta.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tipo</th><th>Días</th><th>Criticidad</th><th>Ventana</th><th>Activa</th><th /></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.kind}>
                <td>{r.kindLabel}</td>
                <td><input type="number" min={0} max={365} style={{ width: 70 }} value={r.daysBefore} onChange={(e) => set(r.kind, 'daysBefore', e.target.value)} /></td>
                <td><select value={r.criticality} onChange={(e) => set(r.kind, 'criticality', e.target.value)}><Options list={meta?.criticalities} /></select></td>
                <td><input type="number" min={1} max={365} style={{ width: 70 }} value={r.dedupeDays} onChange={(e) => set(r.kind, 'dedupeDays', e.target.value)} /></td>
                <td><input type="checkbox" checked={r.isActive} onChange={(e) => set(r.kind, 'isActive', e.target.checked)} /></td>
                <td><button className="btn sm" onClick={() => save(r)}>Guardar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
