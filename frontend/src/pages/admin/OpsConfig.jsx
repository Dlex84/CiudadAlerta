import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../components/ui.jsx';
import { Pager } from '../../ops.jsx';

// HU-2.5 (plazos y alertas) + HU-2.4 (pasos de aprobación por tipo)
export default function OpsConfig() {
  const { can } = useAuth();
  const editable = can('configuracion', 'update');
  const [types, setTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const t = (await api.get('/config/report-types')).items;
      const withSteps = await Promise.all(t.map(async (x) => ({ ...x, steps: (await api.get(`/config/report-types/${x.code}/approval-steps`)).steps })));
      setTypes(withSteps);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (can('roles', 'read')) api.get('/roles').then((r) => setRoles(r.items.filter((x) => x.code && x.isActive))).catch(() => {}); }, []);

  async function runAlerts() {
    try {
      const r = await api.post('/alerts/run');
      setNotice(`Revisión hecha: ${r.checked} abiertos, ${r.overdue} vencidos, ${r.dueSoon} por vencer · ${r.sent} avisos enviados, ${r.failed} fallidos, ${r.skipped} omitidos por repetidos.`);
    } catch (e) { setError(e.message); }
  }

  return (
    <>
      <div className="row-between">
        <h1>Configuración de operaciones</h1>
        {editable && <button className="btn ghost" onClick={runAlerts}>Revisar vencimientos ahora</button>}
      </div>
      <p className="muted">El plazo se suma a la fecha de creación de cada reporte nuevo. Los avisos «por vencer» salen dentro de la ventana de aviso previo.</p>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tipo</th><th>Plazo</th><th>Aviso previo</th><th>Pasos de aprobación</th><th>Activo</th><th>Actualizado</th><th /></tr></thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.code}>
                <td><b>{t.name}</b></td>
                <td>{t.slaHours} h</td>
                <td>{t.warnBeforeHours} h</td>
                <td>{t.steps.length === 0 ? <span className="muted">No requiere aprobación</span> : t.steps.map((s) => `${s.stepOrder}. ${s.name}${s.required ? '' : ' (opc.)'}`).join(' · ')}</td>
                <td>{t.isActive ? 'Sí' : 'No'}</td>
                <td>{fmtDate(t.updatedAt)}</td>
                <td className="actions">{editable && <button className="btn ghost sm" onClick={() => setEditing(t)}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="h2" style={{ marginTop: 26 }}>Registro de envíos de alertas</h2>
      <Deliveries />
      {editing && <TypeForm type={editing} roles={roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice('Configuración guardada.'); load(); }} />}
    </>
  );
}

function Deliveries() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [data, setData] = useState({ items: [], total: 0, limit: 25 });
  useEffect(() => { api.get(`/alerts/deliveries${qs({ page, status })}`).then(setData).catch(() => {}); }, [page, status]);
  return (
    <>
      <div className="toolbar">
        <Field label="Resultado"><select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}><option value="">Todos</option><option value="sent">Enviado</option><option value="failed">Fallido</option></select></Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Reporte</th><th>Alerta</th><th>Para</th><th>Canal</th><th>Resultado</th></tr></thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d.id}>
                <td>{fmtDate(d.createdAt)}</td><td>#{d.reportCode}</td>
                <td>{d.kind === 'overdue' ? 'Vencido' : 'Por vencer'}</td><td>{d.userName ?? '—'}</td>
                <td>{d.channel === 'email' ? 'Correo' : 'App'}</td>
                <td><span className={`chip ${d.status === 'sent' ? 'ok' : 'bad'}`} title={d.error ?? ''}>{d.status === 'sent' ? 'Enviado' : `Fallido${d.error ? `: ${d.error}` : ''}`}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <div className="empty">Aún no se han enviado alertas.</div>}
      </div>
      <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} noun="envío(s)" />
    </>
  );
}

function TypeForm({ type, roles, onClose, onSaved }) {
  const [form, setForm] = useState({ slaHours: type.slaHours, warnBeforeHours: type.warnBeforeHours, isActive: type.isActive });
  const [steps, setSteps] = useState(type.steps.map(({ name, approverRoleCode, required }) => ({ name, approverRoleCode: approverRoleCode ?? '', required })));
  const [error, setError] = useState('');
  const setStep = (i, patch) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => { const c = [...steps]; [c[i], c[i + d]] = [c[i + d], c[i]]; setSteps(c); };

  async function submit(e) {
    e.preventDefault();
    try {
      const changed = form.slaHours !== type.slaHours || form.warnBeforeHours !== type.warnBeforeHours || form.isActive !== type.isActive;
      if (changed) await api.patch(`/config/report-types/${type.code}`, form);
      await api.put(`/config/report-types/${type.code}/approval-steps`, { steps: steps.map((s) => ({ ...s, approverRoleCode: s.approverRoleCode || null })) });
      onSaved();
    } catch (x) { setError(x.message); }
  }
  const num = (k) => (e) => setForm({ ...form, [k]: Number.parseInt(e.target.value, 10) });

  return (
    <Modal title={`Tipo: ${type.name}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="toolbar" style={{ margin: 0 }}>
          <Field label="Plazo (horas)" type="number" min={1} max={8760} required value={form.slaHours} onChange={num('slaHours')} />
          <Field label="Aviso previo (horas)" type="number" min={0} max={8759} required value={form.warnBeforeHours} onChange={num('warnBeforeHours')} />
          <label className="check" style={{ alignSelf: 'center' }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Activo para nuevos reportes</label>
        </div>
        <div className="section-title" style={{ margin: 0 }}>Pasos de aprobación antes de «Resuelto»</div>
        {steps.length === 0 && <p className="muted" style={{ margin: 0 }}>Sin pasos: los reportes de este tipo se cierran sin aprobación.</p>}
        {steps.map((s, i) => (
          <div key={i} className="step-row">
            <b>{i + 1}.</b>
            <input aria-label="Nombre del paso" required minLength={3} maxLength={80} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
            <select aria-label="Rol aprobador" value={s.approverRoleCode} onChange={(e) => setStep(i, { approverRoleCode: e.target.value })}>
              <option value="">Cualquiera con permiso</option>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              {s.approverRoleCode && !roles.some((r) => r.code === s.approverRoleCode) && <option value={s.approverRoleCode}>{s.approverRoleCode}</option>}
            </select>
            <label className="check"><input type="checkbox" checked={s.required} onChange={(e) => setStep(i, { required: e.target.checked })} /> Obligatorio</label>
            <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
            <button type="button" className="btn ghost sm" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
            <button type="button" className="btn danger sm" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
          </div>
        ))}
        {steps.length < 5 && <div><button type="button" className="btn ghost sm" onClick={() => setSteps([...steps, { name: '', approverRoleCode: 'supervisor', required: true }])}>+ Agregar paso</button></div>}
        <p className="muted" style={{ margin: 0 }}>Los cambios aplican a las solicitudes nuevas; las que ya están en curso conservan sus pasos.</p>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}
