import React from 'react';
import { Link } from '../router.jsx';

const NAV = [
  { to: '/inicio', icon: '⌂', label: 'Inicio' },
  { icon: '◇', label: 'Mapa' },
  { icon: '☷', label: 'Explorar' },
  { to: '/reportes', icon: '▤', label: 'Mis reportes', match: ['/reportes', '/reportes/nuevo', '/seguimiento'] },
  { to: '/perfil', icon: '○', label: 'Perfil' },
];

/** Marco de la app ciudadana con la navegación inferior del prototipo. */
export default function CitizenShell({ path, title, subtitle, back, children }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-row">
          {back && <Link to={back} className="back" aria-label="Volver">‹</Link>}
          <h1>{title}</h1>
        </div>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <main className="app-body">{children}</main>
      <nav className="bottom-nav" aria-label="Navegación principal">
        {NAV.map((n) =>
          n.to ? (
            <Link key={n.label} to={n.to} className={(n.match ?? [n.to]).includes(path) ? 'active' : ''}><i>{n.icon}</i>{n.label}</Link>
          ) : (
            <span key={n.label} className="soon" title="Disponible en una próxima épica"><i>{n.icon}</i>{n.label}</span>
          ),
        )}
      </nav>
    </div>
  );
}
