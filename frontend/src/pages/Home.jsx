import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert } from '../components/ui.jsx';
import { StatusChip, timeAgo, typeIcon } from '../ops.jsx';
import { Link, navigate } from '../router.jsx';
import CitizenShell from './CitizenShell.jsx';

// Pantalla 04 del prototipo, con los números reales de los reportes del vecino (HU-2.2).
export default function Home() {
  const { session } = useAuth();
  const { user } = session;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/reports?limit=3'),
      api.get('/reports?bucket=en_proceso&limit=1'),
      api.get('/reports?bucket=completados&limit=1'),
    ])
      .then(([recent, inProgress, done]) => setData({ recent, inProgress: inProgress.total, done: done.total }))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <CitizenShell path="/inicio" title="Inicio" subtitle={`Sector: ${user.sector || 'sin definir'}`}>
      <p style={{ marginTop: 0 }}>Hola, <b>{user.fullName.split(' ')[0]}</b> 👋</p>
      <Alert>{error}</Alert>
      <div className="card stack">
        <div className="section-title" style={{ margin: 0 }}>Mis reportes</div>
        <div className="stats">
          <div><b>{data ? data.recent.total : '—'}</b><small>En total</small></div>
          <div><b>{data ? data.inProgress : '—'}</b><small>En curso</small></div>
          <div><b>{data ? data.done : '—'}</b><small>Resueltos</small></div>
        </div>
        <button className="btn block" onClick={() => navigate('/reportes/nuevo')}>+ Crear nuevo reporte</button>
      </div>

      <div className="section-title row-between">
        <span>Reportes recientes</span>
        <Link to="/reportes">Ver todos</Link>
      </div>
      {data && data.recent.items.length === 0 && <div className="card muted center">Aún no has creado reportes.</div>}
      <div className="list">
        {data?.recent.items.map((r) => <ReportRow key={r.id} r={r} />)}
      </div>
    </CitizenShell>
  );
}

export function ReportRow({ r }) {
  return (
    <Link to={`/seguimiento?id=${r.code}`} className="list-item">
      <span className="thumb" aria-hidden="true">{typeIcon(r.typeCode)}</span>
      <span className="grow">
        <b>{r.title}</b>
        <small className="muted">{r.location} · {timeAgo(r.createdAt)}</small>
        <span><StatusChip report={r} /></span>
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  );
}
