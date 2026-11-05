import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, fmtDate } from '../../components/ui.jsx';
import { ReportFilters, useAssignees } from './Reports.jsx';

// HU-2.7 — Reportes operativos: métricas con definición, fecha de generación, filtros y exportación.
const fmt = (m) => (m.value === null || m.value === undefined ? 'n/d' : m.unit === '%' ? `${m.value} %` : m.unit === 'horas' ? `${m.value} h` : m.value);

export default function OpsReport() {
  const { can } = useAuth();
  const empty = { from: '', to: '', status: '', assigneeId: '', typeCode: '' };
  const [filters, setFilters] = useState(empty);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const assignees = useAssignees();

  const load = useCallback(async () => {
    try { setData(await api.get(`/indicators/report${qs(filters)}`)); setError(''); } catch (e) { setError(e.message); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const filterText = data && Object.entries(data.filters).filter(([k]) => k !== 'assigneeId' || !data.filters.assigneeName).map(([k, v]) => `${k}: ${v}`).join(' · ');

  return (
    <>
      <div className="row-between">
        <h1>Reportes operativos</h1>
        {can('indicadores', 'create') && (
          <a className="btn" href={`/api/indicators/report.csv${qs(filters)}`} download>⬇ Exportar CSV</a>
        )}
      </div>
      <p className="muted">
        Generado: <b>{fmtDate(data?.generatedAt)}</b> · Filtros: <b>{filterText || 'ninguno'}</b>
        {data?.truncated && <> · <span className="text-bad">Se calcularon los primeros 5000 reportes</span></>}
      </p>
      <Alert>{error}</Alert>
      <ReportFilters value={filters} onChange={setFilters} assignees={assignees} fields={['from', 'to', 'status', 'assigneeId', 'typeCode']} />

      <div className="table-wrap">
        <table>
          <thead><tr><th>Métrica</th><th>Valor</th><th>Cómo se calcula</th></tr></thead>
          <tbody>
            {data?.metrics.map((m) => (
              <tr key={m.key}><td><b>{m.label}</b></td><td className="num">{fmt(m)}</td><td className="muted">{m.definition}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <Breakdown title="Por tipo de reporte" rows={data?.byType} />
        <Breakdown title="Por responsable" rows={data?.byAssignee} />
      </div>
    </>
  );
}

function Breakdown({ title, rows = [] }) {
  return (
    <section className="table-wrap">
      <table>
        <thead><tr><th>{title}</th><th>Creados</th><th>Resueltos</th><th>Abiertos</th><th>Vencidos</th><th>Prom. h</th><th>A tiempo</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td><td className="num">{r.created}</td><td className="num">{r.resolved}</td><td className="num">{r.open}</td>
              <td className="num">{r.overdueOpen}</td><td className="num">{r.avgResolutionHours ?? 'n/d'}</td><td className="num">{r.onTimeRate == null ? 'n/d' : `${r.onTimeRate} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty">Sin datos.</div>}
    </section>
  );
}
