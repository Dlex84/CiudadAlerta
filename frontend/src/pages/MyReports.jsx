import React, { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { Alert } from '../components/ui.jsx';
import { navigate } from '../router.jsx';
import CitizenShell from './CitizenShell.jsx';
import { ReportRow } from './Home.jsx';

// Pantalla 12 del prototipo (HU-2.2)
const FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'pendientes', label: 'Reportados' },
  { key: 'en_proceso', label: 'En curso' },
  { key: 'completados', label: 'Resueltos' },
  { key: 'rechazados', label: 'Rechazados' },
];

export default function MyReports() {
  const [bucket, setBucket] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/reports${qs({ bucket, limit: 50 })}`).then(setData).catch((e) => setError(e.message));
  }, [bucket]);

  return (
    <CitizenShell path="/reportes" title="Mis reportes" subtitle="Consulta lo que has publicado">
      <div className="chips" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={bucket === f.key} className={`chip-btn ${bucket === f.key ? 'active' : ''}`} onClick={() => setBucket(f.key)}>
            {f.label}{bucket === f.key && data ? ` (${data.total})` : ''}
          </button>
        ))}
      </div>
      <Alert>{error}</Alert>
      {data && data.items.length === 0 && <div className="card muted center">No hay reportes en esta lista.</div>}
      <div className="list">{data?.items.map((r) => <ReportRow key={r.id} r={r} />)}</div>
      <button className="btn block" style={{ marginTop: 16 }} onClick={() => navigate('/reportes/nuevo')}>+ Nuevo reporte</button>
    </CitizenShell>
  );
}
