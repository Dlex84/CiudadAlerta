import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { Alert, Field, fmtDate } from '../../components/ui.jsx';

const EVENTS = {
  login_success: ['Inicio de sesión', 'ok'],
  login_failed: ['Intento fallido', 'warn'],
  login_blocked: ['Acceso denegado', 'bad'],
  logout: ['Cierre de sesión', ''],
};
const place = (l) => [l.city, l.country].filter(Boolean).join(', ') || '—';
const browser = (ua = '') => (/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua ? 'Otro' : '—');

// HU-1.8
export default function Audit() {
  const empty = { email: '', event: '', ip: '', from: '', to: '' };
  const [filters, setFilters] = useState(empty);
  const [applied, setApplied] = useState(empty);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 25 });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.get(`/audit/access${qs({ ...applied, page })}`)); setError(''); } catch (e) { setError(e.message); }
  }, [applied, page]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <>
      <h1>Auditoría de accesos</h1>
      <p className="muted">Quién entró, cuándo, desde dónde y con qué resultado.</p>
      <Alert>{error}</Alert>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
        <Field label="Correo" placeholder="contiene…" value={filters.email} onChange={set('email')} />
        <Field label="Evento"><select value={filters.event} onChange={set('event')}><option value="">Todos</option>{Object.entries(EVENTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="IP" placeholder="203.0.113.9" value={filters.ip} onChange={set('ip')} />
        <Field label="Desde" type="date" value={filters.from} onChange={set('from')} />
        <Field label="Hasta" type="date" value={filters.to} onChange={set('to')} />
        <button className="btn">Filtrar</button>
        <button type="button" className="btn ghost" onClick={() => { setFilters(empty); setApplied(empty); setPage(1); }}>Limpiar</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Evento</th><th>IP</th><th>Localización</th><th>Navegador</th></tr></thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.createdAt)}</td>
                <td>{l.userName ? <b>{l.userName}</b> : <span className="muted">Desconocido</span>}<div className="muted">{l.email}</div></td>
                <td><span className={`chip ${EVENTS[l.event]?.[1] ?? ''}`}>{EVENTS[l.event]?.[0] ?? l.event}</span></td>
                <td>{l.ip ?? '—'}</td>
                <td>{place(l)}</td>
                <td>{browser(l.userAgent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <div className="empty">No hay registros con esos filtros.</div>}
      </div>
      <div className="pager">
        <span className="muted">{data.total} registro(s)</span>
        <span>
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Anterior</button>{' '}
          <span className="muted">Página {page} de {pages}</span>{' '}
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente ›</button>
        </span>
      </div>
    </>
  );
}
