import React from 'react';
import { useAuth } from '../../auth.jsx';
import { Link, navigate } from '../../router.jsx';

const GROUPS = [
  {
    title: 'Operaciones',
    items: [
      { to: '/admin/reportes', label: 'Reportes', module: 'operaciones', also: ['/admin/reporte'] },
      { to: '/admin/bitacora', label: 'Bitácora de cambios', module: 'bitacora' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { to: '/admin/usuarios', label: 'Usuarios', module: 'usuarios' },
      { to: '/admin/roles', label: 'Roles y permisos', module: 'roles' },
      { to: '/admin/auditoria', label: 'Auditoría de accesos', module: 'auditoria' },
    ],
  },
  {
    title: 'Mi cuenta',
    items: [
      { to: '/admin/perfil', label: 'Mi perfil' },
    ],
  },
];

export default function AdminLayout({ path, children }) {
  const { session, can, logout } = useAuth();

  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="brand">◉ CiudadAlerta</div>
        {GROUPS.map((g) => {
          const visible = g.items.filter((i) => !i.module || can(i.module, 'read'));
          if (!visible.length) return null;
          return (
            <React.Fragment key={g.title}>
              <div className="nav-group">{g.title}</div>
              {visible.map((i) => (
                <Link key={i.to} to={i.to} className={path === i.to || i.also?.includes(path) ? 'active' : ''}>
                  {i.label}
                </Link>
              ))}
            </React.Fragment>
          );
        })}
        <div className="spacer" />
        <div className="who">{session.user.fullName}<br />{session.role.name}</div>
        <a onClick={async () => { await logout(); navigate('/login'); }}>Cerrar sesión</a>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
