import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Alert, fmtDate } from '../components/ui.jsx';
import { StatusChip, typeIcon, useOpsMeta } from '../ops.jsx';
import CitizenShell from './CitizenShell.jsx';

// Pantallas 07 (detalle) y 13 (seguimiento) del prototipo — HU-2.2
export default function Tracking({ id, isNew }) {
  const meta = useOpsMeta();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return setError('Falta el código del reporte.');
    api.get(`/reports/${encodeURIComponent(id)}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  const r = data?.report;
  // Próximos pasos del camino normal, para mostrarlos "pendientes" como en el prototipo.
  const happyPath = ['reportado', 'validado', 'en_revision', 'en_proceso', 'resuelto'];
  const reached = new Set(data?.history.map((h) => h.toStatus));
  const upcoming = r && !['resuelto', 'rechazado'].includes(r.status)
    ? happyPath.slice(happyPath.indexOf(r.status) + 1).filter((s) => !reached.has(s))
    : [];
  const label = (k) => meta?.statuses.find((s) => s.key === k)?.label ?? k;

  return (
    <CitizenShell path="/seguimiento" title="Seguimiento" subtitle={r ? `Reporte #${r.code}` : ''} back="/reportes">
      <Alert kind="ok">{isNew && r ? `¡Listo! Tu reporte quedó registrado con el código #${r.code}.` : ''}</Alert>
      <Alert>{error}</Alert>
      {r && (
        <div className="stack">
          <div className="card stack">
            <div className="row-between">
              <b style={{ fontSize: 17 }}>{typeIcon(r.typeCode)} {r.title}</b>
            </div>
            <div><StatusChip report={r} /></div>
            <dl className="review">
              <dt>Categoría</dt><dd>{r.typeName}</dd>
              <dt>Ubicación</dt><dd>{r.location}</dd>
              <dt>Descripción</dt><dd>{r.description}</dd>
              <dt>Publicado</dt><dd>{fmtDate(r.createdAt)}</dd>
              {!r.closedAt && <><dt>Fecha límite de atención</dt><dd>{fmtDate(r.dueAt)}</dd></>}
              <dt>Responsable</dt><dd>{r.hasAssignee ? 'Asignado a un equipo' : 'Pendiente de asignar'}</dd>
            </dl>
          </div>

          <div className="section-title">Historial de actualizaciones</div>
          <ol className="timeline card">
            {data.history.map((h, i) => (
              <li key={i} className={`done ${h.toStatus === 'rechazado' ? 'bad' : ''}`}>
                <b>{i === 0 ? 'Reporte publicado' : h.label}</b>
                <small className="muted">{fmtDate(h.createdAt)}</small>
                {h.reason && <small>Motivo: {h.reason}</small>}
              </li>
            ))}
            {upcoming.map((s) => (
              <li key={s} className="pending"><b>{label(s)}</b><small className="muted">Pendiente</small></li>
            ))}
          </ol>
        </div>
      )}
    </CitizenShell>
  );
}
