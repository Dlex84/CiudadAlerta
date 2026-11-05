import React from 'react';
import { useAuth } from '../../auth.jsx';
import { Link, navigate } from '../../router.jsx';

const ITEMS = [
  { to: '/admin/usuarios', label: 'Usuarios', module: 'usuarios' },
  { to: '/admin/roles', label: 'Roles y permisos', module: 'roles' },
  { to: '/admin/auditoria', label: 'Auditoría de accesos', module: 'auditoria' },
  { to: '/admin/perfil', label: 'Mi perfil' },
];

export default function AdminLayout({ path, children }) {
  const { session, can, logout } = useAuth();
  const visible = ITEMS.filter((i) => !i.module || can(i.module, 'read'));
  return (
    <div className="admin">
      <aside className="sidebar">
        <div className="brand">◉ CiudadAlerta</div>
        {visible.map((i) => (
          <Link key={i.to} to={i.to} className={path === i.to ? 'active' : ''}>{i.label}</Link>
        ))}
        <div className="spacer" />
        <div className="who">{session.user.fullName}<br />{session.role.name}</div>
        <a onClick={async () => { await logout(); navigate('/login'); }}>Cerrar sesión</a>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
