import React, { useState } from 'react';
import { api } from '../api.js';
import { Alert, AuthCard, Field } from '../components/ui.jsx';
import { Link } from '../router.jsx';

// HU-1.5 — solicitar enlace (no existe en el prototipo; sigue su estilo)
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setMsg((await api.post('/auth/forgot-password', { email })).message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace temporal a tu correo" back="/login">
      <form className="stack" onSubmit={submit}>
        <Field label="Correo electrónico" type="email" placeholder="nombre@ejemplo.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Alert kind="ok">{msg}</Alert>
        <Alert>{error}</Alert>
        <button className="btn block" disabled={busy}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
      </form>
      <p className="muted center"><Link to="/login">Volver a iniciar sesión</Link></p>
    </AuthCard>
  );
}
