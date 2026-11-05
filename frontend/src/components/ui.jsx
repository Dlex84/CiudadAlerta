import React, { useEffect } from 'react';
import { Link } from '../router.jsx';

export const Field = ({ label, children, ...props }) => (
  <label className="field">
    <span>{label}</span>
    {children ?? <input {...props} />}
  </label>
);

export const Alert = ({ kind = '', children }) =>
  children ? (
    <div className={`alert ${kind}`} role={kind === 'ok' ? 'status' : 'alert'}>
      {children}
    </div>
  ) : null;

/** Tarjeta centrada tipo "teléfono", como en las pantallas de cuenta del prototipo. */
export function AuthCard({ title, subtitle, back, children }) {
  return (
    <div className="auth-wrap">
      <div className="phone-card stack">
        <div className="brand">
          {back && <Link to={back} aria-label="Volver">‹</Link>}
          <span>◉ CiudadAlerta</span>
        </div>
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const fmtDate = (v) =>
  v ? new Date(v).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
