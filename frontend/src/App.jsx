import React, { useEffect } from 'react';
import { useAuth } from './auth.jsx';
import { navigate, useRoute } from './router.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import MyReports from './pages/MyReports.jsx';
import NewReport from './pages/NewReport.jsx';
import Profile from './pages/Profile.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Tracking from './pages/Tracking.jsx';
import Welcome from './pages/Welcome.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Audit from './pages/admin/Audit.jsx';
import ChangeLog from './pages/admin/ChangeLog.jsx';
import ReportDetail from './pages/admin/ReportDetail.jsx';
import Reports from './pages/admin/Reports.jsx';
import Roles from './pages/admin/Roles.jsx';
import Users from './pages/admin/Users.jsx';

const PUBLIC = new Set(['/', '/login', '/registro', '/recuperar', '/restablecer']);
const CITIZEN = new Set(['/inicio', '/perfil', '/reportes', '/reportes/nuevo', '/seguimiento']);

/** Primera sección del panel a la que el rol tiene acceso. */
function adminHome(can) {
  if (can('operaciones', 'read')) return '/admin/reportes';
  if (can('usuarios', 'read')) return '/admin/usuarios';
  if (can('roles', 'read')) return '/admin/roles';
  if (can('auditoria', 'read')) return '/admin/auditoria';
  return '/admin/perfil';
}

/** Rutas del panel: [componente, módulo que hay que poder consultar]. */
const ADMIN_PAGES = {
  '/admin/reportes': [(q) => <Reports key={JSON.stringify(q)} query={q} />, 'operaciones'],
  '/admin/reporte': [(q) => <ReportDetail key={q.id} id={q.id} />, 'operaciones'],
  '/admin/bitacora': [(q) => <ChangeLog key={q.report ?? ''} query={q} />, 'bitacora'],
  '/admin/usuarios': [() => <Users />, 'usuarios'],
  '/admin/roles': [() => <Roles />, 'roles'],
  '/admin/auditoria': [() => <Audit />, 'auditoria'],
  '/admin/perfil': [() => <><h1>Mi perfil</h1><Profile embedded /></>, null],
};

export default function App() {
  const { session, loading, can } = useAuth();
  const { path, query } = useRoute();

  // Guardas de ruta: se calcula a dónde redirigir y se navega en un efecto.
  let redirect = null;
  if (!loading) {
    if (!session && !PUBLIC.has(path)) redirect = '/login';
    else if (session && PUBLIC.has(path) && path !== '/restablecer') redirect = session.redirectTo;
    else if (session && path === '/admin') redirect = adminHome(can);
    else if (session && path.startsWith('/admin') && session.redirectTo !== '/admin') redirect = '/inicio';
    else if (session && CITIZEN.has(path) && session.redirectTo === '/admin') redirect = '/admin';
  }
  useEffect(() => { if (redirect) navigate(redirect); }, [redirect]);

  if (loading || redirect) return <div className="auth-wrap muted">Cargando…</div>;

  switch (path) {
    case '/': return <Welcome />;
    case '/login': return <Login notice={query.ok ? 'Contraseña actualizada. Ya puedes iniciar sesión.' : ''} />;
    case '/registro': return <Register />;
    case '/recuperar': return <ForgotPassword />;
    case '/restablecer': return <ResetPassword token={query.token} invitation={!!query.invitacion} />;
    case '/inicio': return <Home />;
    case '/perfil': return <Profile />;
    case '/reportes': return <MyReports />;
    case '/reportes/nuevo': return can('reportes', 'create') ? <NewReport /> : <MyReports />;
    case '/seguimiento': return <Tracking key={query.id} id={query.id} isNew={!!query.nuevo} />;
  }

  const page = ADMIN_PAGES[path];
  if (page) {
    const [render, module] = page;
    return (
      <AdminLayout path={path}>
        {!module || can(module, 'read') ? render(query) : <NoAccess />}
      </AdminLayout>
    );
  }
  return <div className="auth-wrap"><div className="phone-card center">Página no encontrada. <a href="#/">Volver al inicio</a></div></div>;
}

function NoAccess() {
  return <><h1>Sin acceso</h1><p className="muted">Tu rol no tiene permiso para ver esta sección.</p></>;
}
