import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { Alert, fmtDate } from '../../components/ui.jsx';
import { StatusChip } from '../../ops.jsx';
import { Link } from '../../router.jsx';
import { ReportFilters, useAssignees } from './Reports.jsx';

// HU-2.1 — Panel de operaciones. Cada indicador abre la lista con el mismo filtro: los números cuadran.
const TILES = [
  { key: 'creados', label: 'Creados', link: {} },
  { key: 'pendientes', label: 'Pendientes de validar', link: { bucket: 'pendientes' } },
  { key: 'en_proceso', label: 'En proceso', link: { bucket: 'en_proceso' } },
  { key: 'completados', label: 'Completados', link: { bucket: 'completados' }, kind: 'ok' },
  { key: 'rechazados', label: 'Rechazados', link: { bucket: 'rechazados' } },
  { key: 'vencidos', label: 'Vencidos', link: { overdue: '1' }, kind: 'bad' },
];

export default function Dashboard() {
  const empty = { from: '', to: '', status: '', assigneeId: '', typeCode: '' };
  const [filters, setFilters] = useState(empty);
  const [data, setData] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [error, setError] = useState('');
  const assignees = useAssignees();

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/dashboard${qs(filters)}`));
      setError('');
    } catch (e) { setError(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/alerts/upcoming').then((r) => setUpcoming(r.items)).catch(() => {}); }, []);

  const max = Math.max(1, ...(data?.byStatus.map((s) => s.count) ?? [1]));

  return (
    <>
      <div className="row-between">
        <h1>Panel de operaciones</h1>
        <button className="btn ghost sm" onClick={load}>↻ Actualizar</button>
      </div>
      <p className="muted">
        Última actualización de los reportes: <b>{fmtDate(data?.lastUpdatedAt)}</b> · Consultado: {fmtDate(data?.generatedAt)}
      </p>
      <Alert>{error}</Alert>
      <ReportFilters value={filters} onChange={setFilters} assignees={assignees} fields={['from', 'to', 'status', 'assigneeId', 'typeCode']} />

      <div className="tiles">
        {TILES.map((t) => (
          <Link key={t.key} to={`/admin/reportes${qs({ ...filters, ...t.link })}`} className={`tile ${t.kind ?? ''}`}>
            <b>{data ? data.indicators[t.key] : '—'}</b>
            <span>{t.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="h2">Por estado</h2>
          {data?.byStatus.map((s) => (
            <div key={s.key} className="bar-row">
              <span>{s.label}</span>
              <span className="bar"><i style={{ width: `${(s.count / max) * 100}%` }} /></span>
              <b>{s.count}</b>
            </div>
          ))}
        </section>
        <section className="card">
          <h2 className="h2">Vencidos y por vencer</h2>
          {upcoming.length === 0 && <p className="muted">Nada urgente por ahora.</p>}
          <ul className="plain">
            {upcoming.slice(0, 8).map((r) => (
              <li key={r.id}>
                <Link to={`/admin/reporte?id=${r.id}`}>#{r.code}</Link> {r.title} <StatusChip report={r} />
                <div className="muted">Límite: {fmtDate(r.dueAt)} · {r.assignee?.name ?? 'Sin responsable'}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
