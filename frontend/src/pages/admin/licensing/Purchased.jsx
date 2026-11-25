import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../../components/ui.jsx';
import { Options, VALIDITY_CHIP, useLicensingMeta } from './shared.jsx';

// HU-4.3 licencias propietarias adquiridas · HU-4.4 asignación y conciliación.
export default function Purchased() {
  const { can } = useAuth();
  const meta = useLicensingMeta();
  const [filters, setFilters] = useState({ q: '', validity: '' });
  const [data, setData] = useState(null);
  const [recon, setRecon] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const load = useCallback(async () => {
    try {
      setData(await api.get(`/licenses${qs(filters)}`));
      setRecon(await api.get('/licenses/reconciliation'));
      setError('');
    } catch (e) { setError(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Licencias comerciales: proveedor, cantidades, vigencia y a quién están asignadas.</p>
        {can('licencias', 'create') && <button className="btn" onClick={() => setModal({ type: 'new' })}>+ Registrar licencia</button>}
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="toolbar">
        <div className="grow"><Field label="Buscar" placeholder="Proveedor, producto o LIC-0001" value={filters.q} onChange={set('q')} /></div>
        <Field label="Vigencia"><select value={filters.validity} onChange={set('validity')}><option value="">Todas</option><option value="vigente">Vigentes</option><option value="por_vencer">Por vencer</option><option value="vencida">Vencidas</option></select></Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Producto</th><th>Modalidad</th><th className="num">Adquiridas</th><th className="num">Asignadas</th><th className="num">Disponibles</th><th>Vence</th><th>Vigencia</th></tr></thead>
          <tbody>
            {data?.items.map((l) => (
              <tr key={l.id}>
                <td>{l.code}</td>
                <td><button type="button" className="linklike" onClick={() => setModal({ type: 'detail', id: l.id })}><b>{l.product}</b></button>{l.edition && ` ${l.edition}`}<br /><small className="muted">{l.vendor}</small></td>
                <td>{l.modalityLabel}<br /><small className="muted">{l.metricLabel}</small></td>
                <td className="num">{l.quantity ?? '∞'}</td>
                <td className="num">{l.assigned}</td>
                <td className="num">{l.available ?? '∞'}</td>
                <td>{l.expiresOn ?? 'No vence'}</td>
                <td><span className={`chip ${VALIDITY_CHIP[l.validity]}`}>{l.validityLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="empty">No hay licencias con esos filtros.</div>}
      </div>

      {recon && recon.items.length > 0 && (
        <>
          <h2 className="h2" style={{ marginTop: 24 }}>Conciliación</h2>
          <p className="muted">Compara lo adquirido con lo asignado y verifica que el contador coincida con las asignaciones vigentes registradas. Corte: {fmtDate(recon.generatedAt)}.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Licencia</th><th className="num">Adquiridas</th><th className="num">Asignadas</th><th className="num">Disponibles</th><th className="num">Uso</th><th>Contador</th></tr></thead>
              <tbody>
                {recon.items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code} · {r.product}</td><td className="num">{r.quantity ?? '∞'}</td><td className="num">{r.assigned}</td><td className="num">{r.available ?? '∞'}</td>
                    <td className="num">{r.usage == null ? '—' : `${r.usage} %`}</td>
                    <td>{r.consistent ? <span className="chip ok">Cuadra</span> : <span className="chip bad">No cuadra ({r.activeAssignments} vigentes)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal?.type === 'new' && <LicenseForm meta={meta} onClose={() => setModal(null)} onSaved={(l) => { setModal(null); setNotice(`Licencia ${l.code} registrada.`); load(); }} />}
      {modal?.type === 'detail' && <LicenseDetail id={modal.id} meta={meta} onClose={() => { setModal(null); load(); }} />}
    </>
  );
}

function LicenseForm({ meta, onClose, onSaved }) {
  const { can } = useAuth();
  const [form, setForm] = useState({ vendor: '', product: '', edition: '', modality: 'suscripcion', metric: 'usuario', quantity: '', startsOn: new Date().toISOString().slice(0, 10), expiresOn: '', alertDays: 30, licenseKey: '', contractRef: '', notes: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    const body = { ...form, quantity: form.quantity === '' ? null : Number(form.quantity), alertDays: Number(form.alertDays), expiresOn: form.expiresOn || null };
    for (const k of ['licenseKey', 'contractRef', 'edition', 'notes']) if (!body[k]) delete body[k];
    try { onSaved(await api.post('/licenses', body)); } catch (x) { setError(x.message); }
  }
  return (
    <Modal title="Registrar licencia adquirida" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <Field label="Proveedor" required value={form.vendor} onChange={set('vendor')} />
          <Field label="Producto" required value={form.product} onChange={set('product')} />
          <Field label="Edición" value={form.edition} onChange={set('edition')} />
          <Field label="Cantidad (vacío = sin límite)" type="number" min={1} value={form.quantity} onChange={set('quantity')} />
          <Field label="Modalidad"><select value={form.modality} onChange={set('modality')}><Options list={meta?.modalities} /></select></Field>
          <Field label="Se asigna"><select value={form.metric} onChange={set('metric')}><Options list={meta?.metrics} /></select></Field>
          <Field label="Inicio" type="date" required value={form.startsOn} onChange={set('startsOn')} />
          <Field label="Vencimiento" type="date" required={form.modality === 'suscripcion'} value={form.expiresOn} onChange={set('expiresOn')} />
          <Field label="Avisar con (días)" type="number" min={0} max={365} value={form.alertDays} onChange={set('alertDays')} />
        </div>
        {can('confidencial', 'read') && (
          <div className="grid-2">
            <Field label="Clave de licencia (confidencial)" value={form.licenseKey} onChange={set('licenseKey')} />
            <Field label="Referencia del contrato (confidencial)" value={form.contractRef} onChange={set('contractRef')} />
          </div>
        )}
        <Field label="Notas"><textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}

function LicenseDetail({ id, meta, onClose }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [target, setTarget] = useState({ targetUserId: '', targetName: '' });
  const [action, setAction] = useState(null); // { type: 'release'|'reassign', a }
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api.get(`/licenses/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); if (can('usuarios', 'read')) api.get('/users?status=active&limit=100').then((r) => setUsers(r.items)).catch(() => {}); }, [load]);
  const l = data?.license;

  async function run(fn, msg) {
    try { await fn(); setNotice(msg); setError(''); setAction(null); setReason(''); setTarget({ targetUserId: '', targetName: '' }); load(); } catch (x) { setError(x.message); }
  }
  const targetBody = () => (l.metric === 'usuario' ? { targetUserId: target.targetUserId } : { targetName: target.targetName });
  const targetInput = l && (l.metric === 'usuario'
    ? <select required value={target.targetUserId} onChange={(e) => setTarget({ ...target, targetUserId: e.target.value })}><option value="">Elige un usuario…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>)}</select>
    : <input required placeholder={l.metric === 'equipo' ? 'Nombre del equipo (PC-ADM-01)' : 'Nombre de la aplicación'} value={target.targetName} onChange={(e) => setTarget({ ...target, targetName: e.target.value })} />);

  return (
    <Modal title={l ? `${l.code} · ${l.product}` : 'Licencia'} onClose={onClose}>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      {l && (
        <div className="stack">
          <dl className="review">
            <dt>Proveedor</dt><dd>{l.vendor} {l.edition && `· ${l.edition}`}</dd>
            <dt>Modalidad</dt><dd>{l.modalityLabel} · {l.metricLabel}</dd>
            <dt>Cantidades</dt><dd>{l.quantity ?? 'Sin límite'} adquiridas · {l.assigned} asignadas · {l.available ?? '∞'} disponibles</dd>
            <dt>Vigencia</dt><dd>{l.startsOn} → {l.expiresOn ?? 'no vence'} · <span className={`chip ${VALIDITY_CHIP[l.validity]}`}>{l.validityLabel}</span> (aviso {l.alertDays} días antes)</dd>
            <dt>Clave</dt><dd>{l.licenseKey ?? (l.hasLicenseKey ? '🔒 Restringida' : '—')}</dd>
            <dt>Contrato</dt><dd>{l.contractRef ?? (l.hasContractRef ? '🔒 Restringido' : '—')}</dd>
          </dl>
          {can('licencias', 'update') && (
            <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => api.post(`/licenses/${l.id}/assignments`, { targetType: l.metric, ...targetBody() }), 'Licencia asignada.'); }}>
              <div className="grow"><Field label={l.available === 0 ? 'Sin licencias disponibles' : 'Asignar a'}>{targetInput}</Field></div><button className="btn" disabled={l.available === 0}>Asignar</button>
            </form>
          )}
          <h3 className="h2">Asignaciones (historial completo)</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Destinatario</th><th>Asignó</th><th>Liberada</th><th /></tr></thead>
              <tbody>
                {data.assignments.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.targetName}</b><br /><small className="muted">{a.targetType}</small></td>
                    <td>{a.assignedByName}<br /><small className="muted">{fmtDate(a.assignedAt)}</small></td>
                    <td>{a.active ? <span className="chip ok">Vigente</span> : <>{fmtDate(a.releasedAt)} · {a.releasedByName}<br /><small className="muted">{a.releaseReason}</small></>}</td>
                    <td className="actions">{a.active && can('licencias', 'update') && <>
                      <button className="btn ghost sm" onClick={() => setAction({ type: 'reassign', a })}>Reasignar</button>
                      <button className="btn danger sm" onClick={() => setAction({ type: 'release', a })}>Liberar</button>
                    </>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.assignments.length === 0 && <div className="empty">Sin asignaciones.</div>}
          </div>
          {action && (
            <form className="stack card" onSubmit={(e) => {
              e.preventDefault();
              if (action.type === 'release') run(() => api.post(`/license-assignments/${action.a.id}/release`, { reason }), 'Asignación liberada.');
              else run(() => api.post(`/license-assignments/${action.a.id}/reassign`, { reason, ...targetBody() }), 'Licencia reasignada.');
            }}>
              <b>{action.type === 'release' ? `Liberar la licencia de ${action.a.targetName}` : `Reasignar desde ${action.a.targetName}`}</b>
              {action.type === 'reassign' && <Field label="Nuevo destinatario">{targetInput}</Field>}
              <Field label="Motivo (obligatorio)"><input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <div className="row"><button type="button" className="btn ghost" onClick={() => setAction(null)}>Cancelar</button><button className="btn">Confirmar</button></div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
