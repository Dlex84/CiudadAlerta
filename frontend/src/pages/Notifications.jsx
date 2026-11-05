import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert } from '../components/ui.jsx';
import { timeAgo } from '../ops.jsx';
import { Link } from '../router.jsx';
import CitizenShell from './CitizenShell.jsx';

// Pantalla 14 del prototipo (servicio de notificaciones de HU-2.3 / HU-2.5). También se usa en el panel (embedded).
export default function Notifications({ embedded = false }) {
  const { session } = useAuth();
  const staff = session.redirectTo === '/admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.get('/notifications?limit=50').then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function open(n) {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    load();
  }
  async function readAll() {
    await api.post('/notifications/read-all');
    load();
  }

  const body = (
    <div className="stack">
      <Alert>{error}</Alert>
      {data?.unread > 0 && <button className="btn ghost sm" onClick={readAll}>Marcar todas como leídas ({data.unread})</button>}
      {data && data.items.length === 0 && <div className="card muted center">No tienes notificaciones.</div>}
      <div className="list">
        {data?.items.map((n) => {
          const target = n.reportId ? (staff ? `/admin/reporte?id=${n.reportId}` : `/seguimiento?id=${n.reportId}`) : null;
          const content = (
            <>
              <span className={`thumb ${n.kind.startsWith('alert') ? 'alert-thumb' : ''}`} aria-hidden="true">!</span>
              <span className="grow">
                <b>{n.title}</b>
                <small className="muted">{n.body}</small>
                <small className="muted">{timeAgo(n.createdAt)}</small>
              </span>
              {!n.readAt && <span className="dot" aria-label="Sin leer" />}
            </>
          );
          return target
            ? <Link key={n.id} to={target} className={`list-item ${n.readAt ? '' : 'unread'}`} onClick={() => open(n)}>{content}</Link>
            : <button key={n.id} className={`list-item ${n.readAt ? '' : 'unread'}`} onClick={() => open(n)}>{content}</button>;
        })}
      </div>
    </div>
  );

  return embedded ? body : (
    <CitizenShell path="/notificaciones" title="Notificaciones" subtitle="Actualizaciones de tus incidencias" back="/inicio">{body}</CitizenShell>
  );
}
