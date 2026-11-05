import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate } from '../../components/ui.jsx';
import { Pager } from '../../ops.jsx';
import { Link } from '../../router.jsx';

// HU-2.8 — Bitácora de cambios (solo lectura: no hay forma de editarla ni borrarla).
const ENTITIES = { report: 'Reporte', approval: 'Aprobación', approval_steps: 'Pasos de aprobación', incident: 'Incidencia', report_type: 'Tipo de reporte', export: 'Exportación' };
const ACTIONS = { create: 'Creó', status_change: 'Cambió estado', assign: 'Asignó', request: 'Solicitó', decide: 'Decidió', update: 'Modificó', comment: 'Comentó', export_csv: 'Exportó CSV' };

function Values({ v }) {
  if (!v) return <span className="muted">—</span>;
  return (
    <dl className="kv">
      {Object.entries(v).map(([k, val]) => <React.Fragment key={k}><dt>{k}</dt><dd>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</dd></React.Fragment>)}
    </dl>
  );
}

export default function ChangeLog({ query = {} }) {
  const { can } = useAuth();
  const empty = { report: '', actorId: '', entity: '', result: '', from: '', to: '' };
  const [filters, setFilters] = useState({ ...empty, report: query.report ?? '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 25 });
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.get(`/changelog${qs({ ...applied, page })}`)); setError(''); } catch (e) { setError(e.message); }
  }, [applied, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (can('usuarios', 'read')) api.get('/users?limit=100').then((r) => setUsers(r.items)).catch(() => {}); }, []);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h1>Bitácora de cambios</h1>
      <p className="muted">Cada cambio en reportes, aprobaciones, incidencias y configuración: quién, cuándo, qué había antes y qué quedó. No se puede modificar ni borrar.</p>
      <Alert>{error}</Alert>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
        <Field label="Reporte" placeholder="CA-0001" value={filters.report} onChange={set('report')} />
        {users.length > 0 && (
          <Field label="Usuario"><select value={filters.actorId} onChange={set('actorId')}><option value="">Todos</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></Field>
        )}
        <Field label="Entidad"><select value={filters.entity} onChange={set('entity')}><option value="">Todas</option>{Object.entries(ENTITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Resultado"><select value={filters.result} onChange={set('result')}><option value="">Todos</option><option value="success">Aplicado</option><option value="rejected">Rechazado</option></select></Field>
        <Field label="Desde" type="date" value={filters.from} onChange={set('from')} />
        <Field label="Hasta" type="date" value={filters.to} onChange={set('to')} />
        <button className="btn">Buscar</button>
        <button type="button" className="btn ghost" onClick={() => { setFilters(empty); setApplied(empty); setPage(1); }}>Limpiar</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Reporte</th><th>Resultado</th><th>Antes</th><th>Después</th></tr></thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.createdAt)}</td>
                <td>{e.actorName}</td>
                <td>{ACTIONS[e.action] ?? e.action}<div className="muted">{ENTITIES[e.entity] ?? e.entity}{e.entityId ? ` · ${e.entityId}` : ''}</div></td>
                <td>{e.reportCode ? <Link to={`/admin/reporte?id=${e.reportId}`}>#{e.reportCode}</Link> : '—'}</td>
                <td><span className={`chip ${e.result === 'success' ? 'ok' : 'bad'}`}>{e.result === 'success' ? 'Aplicado' : 'Rechazado'}</span></td>
                <td><Values v={e.oldValues} /></td>
                <td><Values v={e.newValues} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <div className="empty">No hay registros con esos filtros.</div>}
      </div>
      <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />
    </>
  );
}
