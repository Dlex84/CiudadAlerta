import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate } from '../../components/ui.jsx';
import { Pager, StatusChip, useOpsMeta } from '../../ops.jsx';
import { Link } from '../../router.jsx';

// HU-2.2 (lista y filtros) + HU-2.3 (filtro por responsable) + HU-2.5 (vencidos)
export function useAssignees() {
  const { can } = useAuth();
  const [list, setList] = useState([]);
  useEffect(() => {
    if (can('asignaciones', 'read')) api.get('/assignees').then((r) => setList(r.items)).catch(() => {});
  }, []);
  return list;
}

/** Filtros comunes de reportes (lista, panel y reportes operativos). */
export function ReportFilters({ value, onChange, assignees, fields }) {
  const meta = useOpsMeta();
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const has = (k) => fields.includes(k);
  return (
    <div className="toolbar">
      {has('q') && <div className="grow"><Field label="Buscar" placeholder="Código, título o lugar" value={value.q} onChange={set('q')} /></div>}
      {has('from') && <Field label="Desde" type="date" value={value.from} onChange={set('from')} />}
      {has('to') && <Field label="Hasta" type="date" value={value.to} onChange={set('to')} />}
      {has('status') && (
        <Field label="Estado"><select value={value.status} onChange={set('status')}><option value="">Todos</option>{meta?.statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      )}
      {has('bucket') && (
        <Field label="Grupo"><select value={value.bucket} onChange={set('bucket')}><option value="">Todos</option>{meta?.buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select></Field>
      )}
      {has('typeCode') && (
        <Field label="Tipo"><select value={value.typeCode} onChange={set('typeCode')}><option value="">Todos</option>{meta?.types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
      )}
      {has('assigneeId') && (
        <Field label="Responsable">
          <select value={value.assigneeId} onChange={set('assigneeId')}>
            <option value="">Todos</option>
            <option value="me">Asignados a mí</option>
            <option value="none">Sin responsable</option>
            {assignees.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </Field>
      )}
      {has('overdue') && (
        <label className="check" style={{ alignSelf: 'center' }}>
          <input type="checkbox" checked={value.overdue === '1'} onChange={(e) => onChange({ ...value, overdue: e.target.checked ? '1' : '' })} /> Solo vencidos
        </label>
      )}
    </div>
  );
}

export default function Reports({ query }) {
  const empty = { q: '', from: '', to: '', status: '', bucket: '', typeCode: '', assigneeId: '', overdue: '' };
  const [filters, setFilters] = useState({ ...empty, ...pick(query, Object.keys(empty)) });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 20 });
  const [error, setError] = useState('');
  const assignees = useAssignees();

  const load = useCallback(async () => {
    try { setData(await api.get(`/reports${qs({ ...filters, page })}`)); setError(''); } catch (e) { setError(e.message); }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h1>Reportes</h1>
      <p className="muted">Registro y seguimiento de todas las operaciones.</p>
      <Alert>{error}</Alert>
      <ReportFilters value={filters} onChange={(f) => { setPage(1); setFilters(f); }} assignees={assignees}
        fields={['q', 'status', 'bucket', 'typeCode', 'assigneeId', 'from', 'to', 'overdue']} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Reporte</th><th>Tipo</th><th>Estado</th><th>Responsable</th><th>Creado</th><th>Fecha límite</th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/admin/reporte?id=${r.id}`}>#{r.code}</Link></td>
                <td><b>{r.title}</b><div className="muted">{r.location}</div></td>
                <td>{r.typeName}</td>
                <td><StatusChip report={r} /></td>
                <td>{r.assignee?.name ?? <span className="muted">Sin asignar</span>}</td>
                <td>{fmtDate(r.createdAt)}</td>
                <td>{r.closedAt ? <span className="muted">Cerrado</span> : fmtDate(r.dueAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <div className="empty">No hay reportes con esos filtros.</div>}
      </div>
      <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} noun="reporte(s)" />
    </>
  );
}

const pick = (obj = {}, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
