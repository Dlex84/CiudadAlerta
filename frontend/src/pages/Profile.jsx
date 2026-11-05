import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Field, fmtDate, initials } from '../components/ui.jsx';
import { Link, navigate } from '../router.jsx';
import CitizenShell from './CitizenShell.jsx';

// Pantalla 15 del prototipo — HU-1.7. Se usa también desde el panel admin (embedded).
export default function Profile({ embedded = false }) {
  const { session, setSession, logout } = useAuth();
  const user = session.user;
  const [form, setForm] = useState({ fullName: user.fullName, phone: user.phone ?? '', sector: user.sector ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState({ data: '', pass: '', photo: '' });
  const [err, setErr] = useState({ data: '', pass: '', photo: '' });
  const fileRef = useRef(null);
  const say = (k, ok, bad = '') => { setMsg((m) => ({ ...m, [k]: ok })); setErr((e) => ({ ...e, [k]: bad })); };

  async function saveData(e) {
    e.preventDefault();
    try { setSession(await api.patch('/me', form)); say('data', 'Datos actualizados.'); }
    catch (x) { say('data', '', x.message); }
  }
  async function savePassword(e) {
    e.preventDefault();
    try {
      await api.put('/me/password', pw);
      setPw({ currentPassword: '', newPassword: '' });
      say('pass', 'Contraseña actualizada. Se cerraron tus otras sesiones.');
    } catch (x) { say('pass', '', x.message); }
  }
  async function uploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setSession(await api.upload('/me/photo', file)); say('photo', 'Foto actualizada.'); }
    catch (x) { say('photo', '', x.message); }
    e.target.value = '';
  }

  const body = (
    <div className="stack">
      <div className="card profile-head">
        {user.photoUrl ? <img className="avatar" src={user.photoUrl} alt="Foto de perfil" /> : <div className="avatar" aria-hidden="true">{initials(user.fullName)}</div>}
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 18 }}>{user.fullName}</b>
          <div className="muted">{user.email}</div>
          <div className="muted">{session.role.name}{user.sector ? ` · ${user.sector}` : ''}</div>
        </div>
      </div>
      <div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadPhoto} />
        <button className="btn ghost sm" onClick={() => fileRef.current.click()}>Cambiar fotografía</button>
        <div style={{ marginTop: 8 }}><Alert kind="ok">{msg.photo}</Alert><Alert>{err.photo}</Alert></div>
      </div>

      <div className="section-title">Datos personales</div>
      <form className="card stack" onSubmit={saveData}>
        <Field label="Nombre completo" required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <Field label="Teléfono" type="tel" placeholder="809-555-0101" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Field label="Sector o comunidad" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
        <p className="muted" style={{ margin: 0 }}>Última actualización: {fmtDate(user.profileUpdatedAt)}</p>
        <Alert kind="ok">{msg.data}</Alert><Alert>{err.data}</Alert>
        <button className="btn">Guardar cambios</button>
      </form>

      <div className="section-title">Cambiar contraseña</div>
      <form className="card stack" onSubmit={savePassword}>
        <Field label="Contraseña actual" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <Field label="Nueva contraseña" type="password" autoComplete="new-password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
        <Alert kind="ok">{msg.pass}</Alert><Alert>{err.pass}</Alert>
        <button className="btn">Actualizar contraseña</button>
      </form>

      {!embedded && (
        <button className="btn ghost block" onClick={async () => { await logout(); navigate('/login'); }}>Cerrar sesión</button>
      )}
      {!embedded && session.redirectTo === '/admin' && <p className="center"><Link to="/admin">Ir al panel de administración</Link></p>}
    </div>
  );

  return embedded ? body : (
    <CitizenShell path="/perfil" title="Mi perfil" subtitle="Tus datos y preferencias">{body}</CitizenShell>
  );
}
