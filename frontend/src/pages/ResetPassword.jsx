import React, { useState } from 'react';
import { api } from '../api.js';
import { Alert, AuthCard, Field } from '../components/ui.jsx';
import { navigate } from '../router.jsx';

// HU-1.5 — definir nueva contraseña (también sirve para activar cuentas creadas por un admin)
export default function ResetPassword({ token, invitation }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/login?ok=1');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={invitation ? 'Activa tu cuenta' : 'Nueva contraseña'} subtitle="Elige una contraseña de al menos 8 caracteres">
      {!token && <Alert>El enlace está incompleto. Solicita uno nuevo desde “¿Olvidaste tu contraseña?”.</Alert>}
      <form className="stack" onSubmit={submit}>
        <Field label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Repite la contraseña" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Alert>{error}</Alert>
        <button className="btn block" disabled={busy || !token}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
    </AuthCard>
  );
}
