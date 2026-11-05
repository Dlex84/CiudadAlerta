import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Link, navigate } from '../../router.jsx';

const GROUPS = [
  {
    title: 'Operaciones',
    items: [
      { to: '/admin/reportes', label: 'Reportes', module: 'operaciones', also: ['/admin/reporte'] },
      { to: '/admin/aprobaciones', label: 'Aprobaciones', module: 'aprobaciones' },
      { to: '/admin/incidencias', label: 'Incidencias', module: 'incidencias' },
      { to: '/admin/bitacora', label: 'Bitácora de cambios', module: 'bitacora' },
      { to: '/admin/configuracion', label: 'Plazos y aprobaciones', module: 'configuracion' },
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
      { to: '/admin/notificaciones', label: 'Notificaciones', badge: true },
      { to: '/admin/perfil', label: 'Mi perfil' },
    ],
  },
];

export default function AdminLayout({ path, children }) {
  const { session, can, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => { api.get('/notifications?limit=1').then((r) => setUnread(r.unread)).catch(() => {}); }, [path]);

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
                  {i.label}{i.badge && unread > 0 && <span className="badge">{unread}</span>}
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
