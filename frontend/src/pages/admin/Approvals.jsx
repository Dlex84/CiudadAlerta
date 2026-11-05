import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Alert, fmtDate } from '../../components/ui.jsx';
import { StatusChip } from '../../ops.jsx';
import { Link } from '../../router.jsx';

// HU-2.4 — Bandeja de aprobaciones pendientes que le tocan a este usuario.
export default function Approvals() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/approvals/pending').then((r) => setItems(r.items)).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <h1>Aprobaciones pendientes</h1>
      <p className="muted">Reportes cuyo cierre espera tu visto bueno. Abre el reporte para aprobar, devolver o rechazar.</p>
      <Alert>{error}</Alert>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Reporte</th><th>Paso</th><th>Solicitó</th><th>Responsable</th><th>Estado</th></tr></thead>
          <tbody>
            {items?.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/admin/reporte?id=${a.report.id}`}>#{a.report.code}</Link> {a.report.title}</td>
                <td>{a.stepOrder}. {a.stepName}{!a.required && <span className="muted"> (opcional)</span>}</td>
                <td>{a.requestedBy}<div className="muted">{fmtDate(a.requestedAt)}</div></td>
                <td>{a.report.assignee?.name ?? '—'}{a.ownReport && <div className="muted">Lo atiendes tú: debe aprobarlo otra persona</div>}</td>
                <td><StatusChip report={a.report} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items?.length === 0 && <div className="empty">No tienes aprobaciones pendientes.</div>}
      </div>
    </>
  );
}
