import React, { useEffect } from 'react';
import { useAuth } from './auth.jsx';
import { navigate, useRoute } from './router.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Register from './pages/Register.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Welcome from './pages/Welcome.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Audit from './pages/admin/Audit.jsx';
import Roles from './pages/admin/Roles.jsx';
import Users from './pages/admin/Users.jsx';

const PUBLIC = new Set(['/', '/login', '/registro', '/recuperar', '/restablecer']);

/** Primera sección del panel a la que el rol tiene acceso. */
function adminHome(can) {
  if (can('usuarios', 'read')) return '/admin/usuarios';
  if (can('roles', 'read')) return '/admin/roles';
  if (can('auditoria', 'read')) return '/admin/auditoria';
  return '/admin/perfil';
}

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
    else if (session && (path === '/inicio' || path === '/perfil') && session.redirectTo === '/admin') redirect = '/admin';
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
    case '/admin/usuarios': return can('usuarios', 'read') ? <AdminLayout path={path}><Users /></AdminLayout> : <NoAccess path={path} />;
    case '/admin/roles': return can('roles', 'read') ? <AdminLayout path={path}><Roles /></AdminLayout> : <NoAccess path={path} />;
    case '/admin/auditoria': return can('auditoria', 'read') ? <AdminLayout path={path}><Audit /></AdminLayout> : <NoAccess path={path} />;
    case '/admin/perfil': return <AdminLayout path={path}><h1>Mi perfil</h1><Profile embedded /></AdminLayout>;
    default: return <div className="auth-wrap"><div className="phone-card center">Página no encontrada. <a href="#/">Volver al inicio</a></div></div>;
  }
}

function NoAccess({ path }) {
  return <AdminLayout path={path}><h1>Sin acceso</h1><p className="muted">Tu rol no tiene permiso para ver esta sección.</p></AdminLayout>;
}
