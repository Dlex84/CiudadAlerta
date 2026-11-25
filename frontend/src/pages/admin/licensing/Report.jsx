import React, { useEffect, useState } from 'react';
import { api, qs } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Alert, Field, fmtDate } from '../../../components/ui.jsx';
import { LEGAL_NOTE, Options, VALIDITY_CHIP, useLicensingMeta } from './shared.jsx';

// HU-4.8 — Reportes de inventario y cumplimiento, con fecha de corte, filtros y exportación.
export default function Report() {
  const { can } = useAuth();
  const meta = useLicensingMeta();
  const [filters, setFilters] = useState({ project: '', category: '', status: '', vendor: '', validity: '', expiresBefore: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/compliance/report${qs(filters)}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)); }, [filters]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const filterText = data && (Object.entries(data.filters).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'ninguno');

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Fecha de corte: <b>{fmtDate(data?.cutoff)}</b> · Filtros: <b>{filterText}</b></p>
        {can('cumplimiento', 'create') && <a className="btn" href={`/api/compliance/report.csv${qs(filters)}`} download>⬇ Exportar CSV</a>}
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <Field label="Proyecto"><select value={filters.project} onChange={set('project')}><Options list={meta?.projects} all="Todos" /></select></Field>
        <Field label="Tipo de licencia"><select value={filters.category} onChange={set('category')}><Options list={meta?.licenseCategories} all="Todos" /></select></Field>
        <Field label="Estado"><select value={filters.status} onChange={set('status')}><Options list={meta?.componentStatuses} all="Todos" /></select></Field>
        <Field label="Proveedor" placeholder="Microsoft" value={filters.vendor} onChange={set('vendor')} />
        <Field label="Vigencia"><select value={filters.validity} onChange={set('validity')}><option value="">Todas</option><option value="vigente">Vigentes</option><option value="por_vencer">Por vencer</option><option value="vencida">Vencidas</option></select></Field>
        <Field label="Vence antes de" type="date" value={filters.expiresBefore} onChange={set('expiresBefore')} />
      </div>
      {data && (
        <>
          <div className="tiles">
            <div className="tile"><b>{data.components.total}</b><small>Componentes</small></div>
            <div className="tile"><b>{data.components.unconfirmed.length}</b><small>Sin licencia confirmada</small></div>
            <div className="tile"><b>{data.components.pendingReviews.length}</b><small>Revisiones pendientes</small></div>
            <div className="tile"><b>{data.components.flagged.length}</b><small>Posibles incompatibilidades</small></div>
            <div className="tile"><b>{data.licenses.items.filter((l) => l.validity !== 'vigente').length}</b><small>Licencias por vencer o vencidas</small></div>
          </div>
          <div className="grid-2">
            <Breakdown title="Por tipo de licencia" rows={data.components.byCategory} />
            <Breakdown title="Por estado" rows={data.components.byStatus} />
          </div>
          <h2 className="h2" style={{ marginTop: 16 }}>Componentes que requieren atención</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Componente</th><th>Proyecto</th><th>Licencia</th><th>Motivo</th></tr></thead>
              <tbody>
                {[...new Map([...data.components.unconfirmed, ...data.components.flagged, ...data.components.pendingReviews].map((c) => [c.id, c])).values()].map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b> {c.version}</td><td>{c.project}</td><td>{c.license ?? <span className="muted">declarada: {c.declaredLicense ?? '—'}</span>}</td>
                    <td>{c.flags.length ? <span className="chip bad">Posible incompatibilidad</span> : c.license ? <span className="chip info">Revisión pendiente</span> : <span className="chip warn">{c.status}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="h2" style={{ marginTop: 16 }}>Licencias adquiridas: renovaciones</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Licencia</th><th>Proveedor</th><th className="num">Asignadas</th><th>Vence</th><th>Vigencia</th></tr></thead>
              <tbody>
                {data.licenses.items.map((l) => (
                  <tr key={l.code}><td>{l.code} · {l.product}</td><td>{l.vendor}</td><td className="num">{l.assigned} / {l.quantity ?? '∞'}</td><td>{l.expiresOn ?? 'No vence'}</td><td><span className={`chip ${VALIDITY_CHIP[l.validity]}`}>{l.validityLabel}</span></td></tr>
                ))}
              </tbody>
            </table>
            {data.licenses.items.length === 0 && <div className="empty">Sin licencias con esos filtros.</div>}
          </div>
          <p className="muted"><small>{LEGAL_NOTE}</small></p>
        </>
      )}
    </>
  );
}

function Breakdown({ title, rows }) {
  return (
    <section className="table-wrap">
      <table>
        <thead><tr><th>{title}</th><th className="num">Componentes</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{r.count}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
