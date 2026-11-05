import React, { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { Alert, AuthCard, Field } from '../components/ui.jsx';
import { Link, navigate } from '../router.jsx';

// Pantalla 03 del prototipo (registro ciudadano)
export default function Register() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', sector: '', acceptTerms: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const s = await register(form);
      navigate(s.redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Crear cuenta" subtitle="Completa tus datos para comenzar" back="/">
      <form className="stack" onSubmit={submit}>
        <Field label="Nombre completo" autoComplete="name" placeholder="Tu nombre y apellido" required minLength={2} value={form.fullName} onChange={set('fullName')} />
        <Field label="Correo electrónico" type="email" autoComplete="email" placeholder="nombre@ejemplo.com" required value={form.email} onChange={set('email')} />
        <Field label="Contraseña" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" required minLength={8} value={form.password} onChange={set('password')} />
        <Field label="Sector o comunidad" placeholder="Ej.: Villa Mella" value={form.sector} onChange={set('sector')} />
        <label className="check">
          <input type="checkbox" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
          Acepto los términos y la política de privacidad.
        </label>
        <Alert>{error}</Alert>
        <button className="btn block" disabled={busy || !form.acceptTerms}>{busy ? 'Creando…' : 'Crear mi cuenta'}</button>
      </form>
      <p className="muted center">¿Ya tienes una cuenta? <Link to="/login">Inicia sesión</Link></p>
    </AuthCard>
  );
}
