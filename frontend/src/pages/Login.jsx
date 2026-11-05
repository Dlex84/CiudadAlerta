import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Alert, AuthCard, Field } from '../components/ui.jsx';
import { Link, navigate } from '../router.jsx';

// Pantalla 02 del prototipo — HU-1.1
export default function Login({ notice }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const s = await login(form.email, form.password);
      navigate(s.redirectTo); // el backend decide el dashboard según el rol
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Iniciar sesión" subtitle="Bienvenido de nuevo" back="/">
      <Alert kind="ok">{notice}</Alert>
      <form className="stack" onSubmit={submit}>
        <Field label="Correo electrónico" type="email" autoComplete="email" placeholder="nombre@ejemplo.com" required value={form.email} onChange={set('email')} />
        <Field label="Contraseña" type="password" autoComplete="current-password" placeholder="••••••••" required value={form.password} onChange={set('password')} />
        <div style={{ textAlign: 'right' }}><Link to="/recuperar">¿Olvidaste tu contraseña?</Link></div>
        <Alert>{error}</Alert>
        <button className="btn block" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <p className="muted center">¿Todavía no tienes cuenta? <Link to="/registro">Crear cuenta</Link></p>
    </AuthCard>
  );
}
