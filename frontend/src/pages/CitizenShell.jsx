import React from 'react';
import { Link } from '../router.jsx';

const NAV = [
  { to: '/inicio', icon: '⌂', label: 'Inicio' },
  { icon: '◇', label: 'Mapa' },
  { icon: '☷', label: 'Explorar' },
  { icon: '▤', label: 'Mis reportes' },
  { to: '/perfil', icon: '○', label: 'Perfil' },
];

/** Marco de la app ciudadana con la navegación inferior del prototipo. */
export default function CitizenShell({ path, title, subtitle, children }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <main className="app-body">{children}</main>
      <nav className="bottom-nav" aria-label="Navegación principal">
        {NAV.map((n) =>
          n.to ? (
            <Link key={n.label} to={n.to} className={path === n.to ? 'active' : ''}><i>{n.icon}</i>{n.label}</Link>
          ) : (
            <span key={n.label} className="soon" title="Disponible en la próxima épica"><i>{n.icon}</i>{n.label}</span>
          ),
        )}
      </nav>
    </div>
  );
}
