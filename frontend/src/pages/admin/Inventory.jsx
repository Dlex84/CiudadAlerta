import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../components/ui.jsx';
import { Pager } from '../../ops.jsx';
import { useAssignees } from './Reports.jsx';

// Épica 3 — Recursos e inventario: catálogo (HU-3.1), movimientos (HU-3.2/3.3), disponibilidad (HU-3.4),
// historial (HU-3.5) y reporte de existencias (HU-3.6).
const STOCK_CHIP = { ok: 'ok', bajo: 'warn', agotado: 'bad' };
const TYPE_LABEL = { entrada: 'Entrada', salida: 'Salida', asignacion: 'Asignación', devolucion: 'Devolución' };

export default function Inventory() {
  const { can } = useAuth();
  const [tab, setTab] = useState('recursos');
  const tabs = [['recursos', 'Recursos'], ...(can('movimientos', 'read') ? [['movimientos', 'Historial de movimientos']] : []), ['existencias', 'Existencias y reportes']];
  return (
    <>
      <h1>Inventario</h1>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        {tabs.map(([k, label]) => (
          <button key={k} className={`btn sm ${tab === k ? '' : 'ghost'}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'recursos' && <Resources />}
      {tab === 'movimientos' && <Movements />}
      {tab === 'existencias' && <StockReport />}
    </>
  );
}

function StockChip({ r }) {
  return <span className={`chip ${STOCK_CHIP[r.stockStatus] ?? ''}`}>{r.stockStatusLabel}</span>;
}

function Resources() {
  const { can } = useAuth();
  const [filters, setFilters] = useState({ q: '', kind: '', low: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api.get(`/resources${qs({ ...filters, low: filters.low ? '1' : '' })}`)); setError(''); } catch (e) { setError(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  const done = (msg) => { setModal(null); setNotice(msg); load(); };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Materiales que se consumen y equipos que se prestan a las cuadrillas.</p>
        {can('recursos', 'create') && <button className="btn" onClick={() => setModal({ type: 'new' })}>+ Nuevo recurso</button>}
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="toolbar">
        <div className="grow"><Field label="Buscar" placeholder="Nombre o código (REC-0001)" value={filters.q} onChange={set('q')} /></div>
        <Field label="Tipo"><select value={filters.kind} onChange={set('kind')}><option value="">Todos</option><option value="material">Materiales</option><option value="equipo">Equipos</option></select></Field>
        <label className="check"><input type="checkbox" checked={filters.low} onChange={set('low')} /> Solo bajo mínimo</label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Recurso</th><th>Tipo</th><th className="num">Existencia</th><th className="num">Mínimo</th><th>Estado</th><th>Ubicación</th><th /></tr></thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td>
                <td><button type="button" className="linklike" onClick={() => setModal({ type: 'detail', id: r.id })}><b>{r.name}</b></button></td>
                <td>{r.kind === 'equipo' ? 'Equipo' : 'Material'}</td>
                <td className="num">{r.stock} {r.unit}</td>
                <td className="num">{r.minStock}</td>
                <td><StockChip r={r} /></td>
                <td>{r.location ?? '—'}</td>
                <td className="actions">
                  {can('movimientos', 'create') && <button className="btn sm" onClick={() => setModal({ type: 'move', resource: r })}>Registrar movimiento</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="empty">No hay recursos con esos filtros.</div>}
      </div>
      {modal?.type === 'new' && <ResourceForm onClose={() => setModal(null)} onSaved={(r) => done(`Recurso ${r.code} registrado.`)} />}
      {modal?.type === 'move' && <MovementForm resource={modal.resource} onClose={() => setModal(null)} onSaved={(m) => done(`${TYPE_LABEL[m.type]} registrada. Nuevo saldo: ${m.balanceAfter} ${modal.resource.unit}.`)} />}
      {modal?.type === 'detail' && <ResourceDetail id={modal.id} onClose={() => { setModal(null); load(); }} />}
    </>
  );
}

function ResourceForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', kind: 'material', unit: 'unidades', minStock: 0, location: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { onSaved(await api.post('/resources', { ...form, minStock: Number(form.minStock) })); } catch (x) { setError(x.message); }
  }
  return (
    <Modal title="Nuevo recurso" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Nombre" required minLength={2} maxLength={80} value={form.name} onChange={set('name')} placeholder="Ej.: Bombilla LED 100 W" />
        <Field label="Tipo">
          <select value={form.kind} onChange={set('kind')}><option value="material">Material (se consume)</option><option value="equipo">Equipo (se presta y se devuelve)</option></select>
        </Field>
        <Field label="Unidad" required maxLength={20} value={form.unit} onChange={set('unit')} placeholder="unidades, sacos, metros…" />
        <Field label="Existencia mínima (aviso)" type="number" min={0} required value={form.minStock} onChange={set('minStock')} />
        <Field label="Ubicación (opcional)" maxLength={80} value={form.location} onChange={set('location')} placeholder="Almacén central" />
        <p className="muted" style={{ margin: 0 }}>La existencia empieza en 0 y solo cambia registrando entradas y salidas.</p>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}

function MovementForm({ resource, onClose, onSaved }) {
  const isEquipment = resource.kind === 'equipo';
  const types = isEquipment ? ['entrada', 'asignacion', 'devolucion'] : ['entrada', 'salida'];
  const [form, setForm] = useState({ type: types[0], quantity: 1, report: '', assigneeId: '', reason: '' });
  const [avail, setAvail] = useState(null);
  const [error, setError] = useState('');
  const assignees = useAssignees();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const out = form.type === 'salida' || form.type === 'asignacion';

  // HU-3.4: se valida la disponibilidad mientras se escribe la cantidad.
  useEffect(() => {
    if (!out || !(Number(form.quantity) > 0)) return setAvail(null);
    api.get(`/resources/${resource.id}/availability?quantity=${Number(form.quantity)}`).then(setAvail).catch(() => setAvail(null));
  }, [out, form.quantity, resource.id]);

  async function submit(e) {
    e.preventDefault();
    const body = { type: form.type, quantity: Number(form.quantity), reason: form.reason || undefined };
    if (form.report) body.report = form.report.trim();
    if (form.type === 'asignacion' || form.type === 'devolucion') body.assigneeId = form.assigneeId;
    try { onSaved((await api.post(`/resources/${resource.id}/movements`, body)).movement); } catch (x) { setError(x.message); }
  }

  return (
    <Modal title={`Movimiento · ${resource.name}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="muted" style={{ margin: 0 }}>Existencia actual: <b>{resource.stock} {resource.unit}</b></p>
        <Field label="Tipo de movimiento">
          <select value={form.type} onChange={set('type')}>{types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        </Field>
        <Field label={`Cantidad (${resource.unit})`} type="number" min={1} required value={form.quantity} onChange={set('quantity')} />
        {avail && (
          <Alert kind={avail.sufficient ? 'ok' : ''}>
            {avail.sufficient ? `Disponible: ${avail.available} ${resource.unit}. Hay suficiente.` : `No hay suficiente: disponibles ${avail.available} ${resource.unit}.`}
          </Alert>
        )}
        {(form.type === 'asignacion' || form.type === 'devolucion') && (
          <Field label={form.type === 'asignacion' ? 'Entregar a' : 'Devuelve'}>
            <select required value={form.assigneeId} onChange={set('assigneeId')}>
              <option value="">Elige…</option>
              {assignees.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.roleName}</option>)}
            </select>
          </Field>
        )}
        {(form.type === 'salida' || form.type === 'asignacion') && (
          <Field label={form.type === 'salida' ? 'Reporte que se atiende (obligatorio)' : 'Reporte (opcional)'} required={form.type === 'salida'}
            placeholder="CA-0001" value={form.report} onChange={set('report')} />
        )}
        <Field label={form.type === 'entrada' ? 'Origen (obligatorio): compra, donación…' : 'Motivo o nota (opcional)'} required={form.type === 'entrada'}
          maxLength={300} value={form.reason} onChange={set('reason')} />
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={avail && !avail.sufficient}>Registrar</button></div>
      </form>
    </Modal>
  );
}

function ResourceDetail({ id, onClose }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.get(`/resources/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const r = data?.resource;

  async function toggle() {
    try { await api.patch(`/resources/${id}`, { isActive: !r.isActive }); load(); } catch (e) { setError(e.message); }
  }

  return (
    <Modal title={r ? `${r.code} · ${r.name}` : 'Recurso'} onClose={onClose}>
      <Alert>{error}</Alert>
      {r && (
        <div className="stack">
          <dl className="review">
            <dt>Tipo</dt><dd>{r.kindLabel}</dd>
            <dt>Existencia</dt><dd>{r.stock} {r.unit} · <StockChip r={r} /></dd>
            <dt>Mínimo</dt><dd>{r.minStock}</dd>
            <dt>Ubicación</dt><dd>{r.location ?? '—'}</dd>
            <dt>Estado</dt><dd>{r.isActive ? 'Activo' : 'Desactivado'}</dd>
          </dl>
          {r.kind === 'equipo' && (
            <div><b>En manos de:</b> {data.outstanding.length ? data.outstanding.map((o) => `${o.assigneeName} (${o.quantity})`).join(', ') : 'nadie, todo está en almacén'}</div>
          )}
          {can('movimientos', 'read') && (
            <ul className="plain">
              {data.movements.map((m) => (
                <li key={m.id}>{fmtDate(m.createdAt)} · <b>{m.typeLabel}</b> {m.quantity} → saldo {m.balanceAfter}{m.reportCode ? ` · ${m.reportCode}` : ''}{m.assignee ? ` · ${m.assignee.name}` : ''} · {m.actorName}</li>
              ))}
              {data.movements.length === 0 && <li className="muted">Sin movimientos.</li>}
            </ul>
          )}
          {can('recursos', 'update') && <div><button className="btn ghost sm" onClick={toggle}>{r.isActive ? 'Desactivar recurso' : 'Reactivar recurso'}</button></div>}
        </div>
      )}
    </Modal>
  );
}

function Movements() {
  const empty = { resource: '', type: '', report: '', from: '', to: '' };
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  useEffect(() => {
    api.get(`/movements${qs({ ...filters, page })}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [filters, page]);

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>Cada movimiento queda registrado con su saldo y su autor. El historial no se puede modificar ni borrar.</p>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <Field label="Recurso (código)" placeholder="REC-0001" value={filters.resource} onChange={set('resource')} />
        <Field label="Tipo"><select value={filters.type} onChange={set('type')}><option value="">Todos</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Reporte" placeholder="CA-0001" value={filters.report} onChange={set('report')} />
        <Field label="Desde" type="date" value={filters.from} onChange={set('from')} />
        <Field label="Hasta" type="date" value={filters.to} onChange={set('to')} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Recurso</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">Saldo</th><th>Reporte</th><th>Persona</th><th>Registró</th><th>Motivo</th></tr></thead>
          <tbody>
            {data?.items.map((m) => (
              <tr key={m.id}>
                <td>{fmtDate(m.createdAt)}</td>
                <td>{m.resource?.code} · {m.resource?.name}</td>
                <td><span className={`chip ${m.type === 'entrada' || m.type === 'devolucion' ? 'ok' : ''}`}>{m.typeLabel}</span></td>
                <td className="num">{m.type === 'entrada' || m.type === 'devolucion' ? '+' : '−'}{m.quantity}</td>
                <td className="num">{m.balanceAfter}</td>
                <td>{m.reportCode ?? '—'}</td>
                <td>{m.assignee?.name ?? '—'}</td>
                <td>{m.actorName}</td>
                <td className="muted">{m.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="empty">Sin movimientos con esos filtros.</div>}
      </div>
      {data && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />}
    </>
  );
}

function StockReport() {
  const { can } = useAuth();
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/inventory/summary${qs(period)}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)); }, [period]);
  const set = (k) => (e) => setPeriod({ ...period, [k]: e.target.value });
  const t = data?.totals;

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Generado: <b>{fmtDate(data?.generatedAt)}</b> · Movimientos del periodo: <b>{period.from || 'inicio'} a {period.to || 'hoy'}</b></p>
        {can('movimientos', 'read') && <a className="btn" href={`/api/inventory/summary.csv${qs(period)}`} download>⬇ Exportar CSV</a>}
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <Field label="Desde" type="date" value={period.from} onChange={set('from')} />
        <Field label="Hasta" type="date" value={period.to} onChange={set('to')} />
      </div>
      {t && (
        <div className="tiles">
          <div className="tile"><b>{t.recursos}</b><small>Recursos activos</small></div>
          <div className="tile"><b>{t.disponibles}</b><small>Disponibles</small></div>
          <div className="tile"><b>{t.bajoMinimo}</b><small>Bajo mínimo</small></div>
          <div className="tile"><b>{t.agotados}</b><small>Agotados</small></div>
          <div className="tile"><b>{t.movimientos}</b><small>Movimientos en el periodo</small></div>
        </div>
      )}
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Recurso</th><th className="num">Existencia</th><th className="num">Mínimo</th><th>Estado</th><th className="num">Entradas</th><th className="num">Salidas</th><th className="num">Asignaciones</th><th className="num">Devoluciones</th></tr></thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code} · {r.name}</td><td className="num">{r.stock} {r.unit}</td><td className="num">{r.minStock}</td><td><StockChip r={r} /></td>
                <td className="num">{r.entradas}</td><td className="num">{r.salidas}</td><td className="num">{r.asignaciones}</td><td className="num">{r.devoluciones}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
