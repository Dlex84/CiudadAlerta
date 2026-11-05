// Épica 2: utilidades compartidas por las pantallas de operaciones.
import React, { useEffect, useState } from 'react';
import { api } from './api.js';

let metaCache = null;
/** Catálogos (estados, transiciones, tipos, categorías…) desde GET /api/meta/operations. Se pide una vez. */
export function useOpsMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return;
    api.get('/meta/operations').then((m) => { metaCache = m; setMeta(m); }).catch(() => {});
  }, []);
  return meta;
}

const STATUS_KIND = { reportado: '', validado: 'info', en_revision: 'warn', en_proceso: 'warn', resuelto: 'ok', rechazado: 'bad' };
export const StatusChip = ({ report }) => (
  <>
    <span className={`chip ${STATUS_KIND[report.status] ?? ''}`}>{report.statusLabel}</span>
    {report.overdue && <> <span className="chip bad" title="Pasó su fecha límite">Vencido</span></>}
    {!report.overdue && report.dueSoon && <> <span className="chip warn" title="Vence pronto">Por vencer</span></>}
  </>
);

const TYPE_ICON = { alumbrado: '💡', basura: '🗑', agua: '≈', vias: '⌁' };
export const typeIcon = (code) => TYPE_ICON[code] ?? '▧';

/** "Hace 2 horas", como en el prototipo. */
export function timeAgo(v) {
  if (!v) return '—';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'Hace un momento';
  if (s < 3600) return `Hace ${Math.floor(s / 60)} min`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `Hace ${h} hora${h > 1 ? 's' : ''}`; }
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Ayer';
  if (d < 14) return `Hace ${d} días`;
  return new Date(v).toLocaleDateString('es-DO', { dateStyle: 'medium' });
}

export const APPROVAL_LABEL = {
  pending: ['Pendiente', 'warn'], approved: ['Aprobado', 'ok'], rejected: ['Rechazado', 'bad'],
  returned: ['Devuelto', 'bad'], cancelled: ['Cancelado', ''], not_requested: ['Sin solicitar', ''], not_required: ['No requiere', ''],
};

/** Paginador reutilizable. */
export function Pager({ page, total, limit, onPage, noun = 'registro(s)' }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span className="muted">{total} {noun}</span>
      <span>
        <button className="btn ghost sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Anterior</button>{' '}
        <span className="muted">Página {page} de {pages}</span>{' '}
        <button className="btn ghost sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente ›</button>
      </span>
    </div>
  );
}
