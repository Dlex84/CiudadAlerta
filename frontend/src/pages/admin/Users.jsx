import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../components/ui.jsx';

// HU-1.2 (alta/edición/eliminación) y HU-1.6 (bloqueo)
export default function Users() {
  const { can, session } = useAuth();
  const [filters, setFilters] = useState({ q: '', status: '', roleId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 20 });
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null); // {type:'form'|'block', user?}

  const load = useCallback(async () => {
    try { setData(await api.get(`/users${qs({ ...filters, page })}`)); setError(''); }
    catch (e) { setError(e.message); }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (can('roles', 'read')) api.get('/roles').then((r) => setRoles(r.items)).catch(() => {}); }, []);

  async function act(fn, ok) {
    try { await fn(); setNotice(ok); setModal(null); await load(); } catch (e) { setError(e.message); }
  }
  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const set = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  return (
    <>
      <h1>Usuarios</h1>
      <p className="muted">Crea cuentas internas, asigna roles y controla el acceso.</p>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="toolbar">
        <div className="grow"><Field label="Buscar" placeholder="Nombre o correo" value={filters.q} onChange={set('q')} /></div>
        <Field label="Estado"><select value={filters.status} onChange={set('status')}><option value="">Todos</option><option value="active">Activos</option><option value="blocked">Bloqueados</option></select></Field>
        <Field label="Rol"><select value={filters.roleId} onChange={set('roleId')}><option value="">Todos</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        {can('usuarios', 'create') && <button className="btn" onClick={() => setModal({ type: 'form' })}>+ Nuevo usuario</button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th /></tr></thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id}>
                <td><b>{u.fullName}</b><div className="muted">{u.phone || ''}</div></td>
                <td>{u.email}</td>
                <td>{u.roleName}</td>
                <td>
                  {u.status === 'blocked' ? <span className="chip bad" title={u.blockedReason}>Bloqueado</span>
                    : u.pendingInvitation ? <span className="chip warn">Pendiente de activar</span>
                    : <span className="chip ok">Activo</span>}
                </td>
                <td>{fmtDate(u.lastLoginAt)}</td>
                <td className="actions">
                  {can('usuarios', 'update') && <>
                    <button className="btn ghost sm" onClick={() => setModal({ type: 'form', user: u })}>Editar</button>
                    {u.pendingInvitation && <button className="btn ghost sm" onClick={() => act(() => api.post(`/users/${u.id}/resend-invitation`), 'Invitación reenviada.')}>Reenviar invitación</button>}
                    {u.id !== session.user.id && (u.status === 'blocked'
                      ? <button className="btn ghost sm" onClick={() => act(() => api.post(`/users/${u.id}/unblock`), 'Usuario reactivado.')}>Reactivar</button>
                      : <button className="btn ghost sm" onClick={() => setModal({ type: 'block', user: u })}>Bloquear</button>)}
                  </>}
                  {can('usuarios', 'delete') && u.id !== session.user.id && (
                    <button className="btn danger sm" onClick={() => window.confirm(`¿Eliminar a ${u.fullName}? Esta acción no se puede deshacer.`) && act(() => api.delete(`/users/${u.id}`), 'Usuario eliminado.')}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.items.length === 0 && <div className="empty">No hay usuarios con esos filtros.</div>}
      </div>
      <div className="pager">
        <span className="muted">{data.total} usuario(s)</span>
        <span>
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Anterior</button>{' '}
          <span className="muted">Página {page} de {pages}</span>{' '}
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente ›</button>
        </span>
      </div>

      {modal?.type === 'form' && <UserForm user={modal.user} roles={roles} onClose={() => setModal(null)} onSaved={(msg) => { setNotice(msg); setModal(null); load(); }} />}
      {modal?.type === 'block' && <BlockForm user={modal.user} onClose={() => setModal(null)} onSubmit={(reason) => act(() => api.post(`/users/${modal.user.id}/block`, { reason }), 'Usuario bloqueado.')} />}
    </>
  );
}

function UserForm({ user, roles, onClose, onSaved }) {
  const [form, setForm] = useState({ fullName: user?.fullName ?? '', email: user?.email ?? '', phone: user?.phone ?? '', sector: user?.sector ?? '', roleId: user?.roleId ?? roles.find((r) => r.isActive)?.id ?? '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try {
      if (user) {
        const { email, ...patch } = form;
        await api.patch(`/users/${user.id}`, patch);
        onSaved('Usuario actualizado.');
      } else {
        const r = await api.post('/users', form);
        onSaved(r.invitationSent ? 'Usuario creado. Le enviamos un correo para definir su contraseña.' : 'Usuario creado, pero no se pudo enviar el correo: usa “Reenviar invitación”.');
      }
    } catch (x) { setError(x.message); }
  }
  return (
    <Modal title={user ? 'Editar usuario' : 'Nuevo usuario'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Nombre completo" required minLength={2} value={form.fullName} onChange={set('fullName')} />
        <Field label="Correo electrónico" type="email" required disabled={!!user} value={form.email} onChange={set('email')} />
        <Field label="Teléfono" type="tel" value={form.phone} onChange={set('phone')} />
        <Field label="Sector o comunidad" value={form.sector} onChange={set('sector')} />
        <Field label="Rol"><select required value={form.roleId} onChange={set('roleId')}>{roles.filter((r) => r.isActive || r.id === user?.roleId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        {!user && <p className="muted" style={{ margin: 0 }}>El usuario nace <b>Activo</b> y recibirá un enlace por correo para crear su contraseña.</p>}
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}

function BlockForm({ user, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Bloquear a ${user.fullName}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}>
        <p className="muted" style={{ margin: 0 }}>Se cerrarán sus sesiones y no podrá iniciar sesión hasta que lo reactives.</p>
        <Field label="Motivo del bloqueo"><textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn danger">Bloquear</button></div>
      </form>
    </Modal>
  );
}
