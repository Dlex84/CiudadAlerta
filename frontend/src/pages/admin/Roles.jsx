import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Field, Modal } from '../../components/ui.jsx';

const ACTIONS = [['create', 'Crear'], ['read', 'Consultar'], ['update', 'Modificar'], ['delete', 'Eliminar']];

// HU-1.3 (roles) y HU-1.4 (matriz de permisos)
export default function Roles() {
  const { can } = useAuth();
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    try { setRoles((await api.get('/roles')).items); setError(''); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(fn, ok) {
    try { await fn(); setNotice(ok); setError(''); await load(); } catch (e) { setNotice(''); setError(e.message); }
  }

  return (
    <>
      <h1>Roles y permisos</h1>
      <p className="muted">Define quién puede hacer qué dentro de la plataforma.</p>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      {can('roles', 'create') && <div className="toolbar"><button className="btn" onClick={() => setModal({ type: 'form' })}>+ Nuevo rol</button></div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Rol</th><th>Descripción</th><th>Dashboard</th><th>Usuarios</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b> {r.isSystem && <span className="chip">Sistema</span>}</td>
                <td className="muted">{r.description}</td>
                <td>{r.dashboardPath}</td>
                <td>{r.activeUserCount}{r.userCount !== r.activeUserCount ? ` (+${r.userCount - r.activeUserCount} bloq.)` : ''}</td>
                <td>{r.isActive ? <span className="chip ok">Activo</span> : <span className="chip warn">Inactivo</span>}</td>
                <td className="actions">
                  {can('permisos', 'read') && <button className="btn ghost sm" onClick={() => setModal({ type: 'perms', role: r })}>Permisos</button>}
                  {can('roles', 'update') && <button className="btn ghost sm" onClick={() => setModal({ type: 'form', role: r })}>Editar</button>}
                  {can('roles', 'update') && !r.isSystem && <button className="btn ghost sm" onClick={() => act(() => api.patch(`/roles/${r.id}`, { isActive: !r.isActive }), r.isActive ? 'Rol desactivado.' : 'Rol activado.')}>{r.isActive ? 'Desactivar' : 'Activar'}</button>}
                  {can('roles', 'delete') && !r.isSystem && <button className="btn danger sm" onClick={() => window.confirm(`¿Eliminar el rol “${r.name}”?`) && act(() => api.delete(`/roles/${r.id}`), 'Rol eliminado.')}>Eliminar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal?.type === 'form' && <RoleForm role={modal.role} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNotice(m); load(); }} />}
      {modal?.type === 'perms' && <Permissions role={modal.role} editable={can('permisos', 'update')} onClose={() => setModal(null)} onSaved={(m) => { setModal(null); setNotice(m); }} />}
    </>
  );
}

function RoleForm({ role, onClose, onSaved }) {
  const [form, setForm] = useState({ name: role?.name ?? '', description: role?.description ?? '', dashboardPath: role?.dashboardPath ?? '/inicio' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try {
      if (role) await api.patch(`/roles/${role.id}`, role.isSystem ? { description: form.description } : form);
      else await api.post('/roles', form);
      onSaved(role ? 'Rol actualizado.' : 'Rol creado. Asígnale permisos desde “Permisos”.');
    } catch (x) { setError(x.message); }
  }
  return (
    <Modal title={role ? 'Editar rol' : 'Nuevo rol'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Nombre" required minLength={3} maxLength={60} disabled={role?.isSystem} value={form.name} onChange={set('name')} />
        <Field label="Descripción"><textarea rows={2} maxLength={300} value={form.description} onChange={set('description')} /></Field>
        <Field label="Al iniciar sesión, enviar a"><select disabled={role?.isSystem} value={form.dashboardPath} onChange={set('dashboardPath')}><option value="/inicio">App ciudadana (/inicio)</option><option value="/admin">Panel de administración (/admin)</option></select></Field>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}

function Permissions({ role, editable, onClose, onSaved }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/roles/${role.id}/permissions`).then(setState).catch((e) => setError(e.message)); }, [role.id]);
  const toggle = (module, action) =>
    setState({ ...state, permissions: state.permissions.map((p) => (p.module === module ? { ...p, [action]: !p[action] } : p)) });
  async function save() {
    try { await api.put(`/roles/${role.id}/permissions`, { permissions: state.permissions }); onSaved(`Permisos de “${role.name}” guardados. Ya están vigentes.`); }
    catch (x) { setError(x.message); }
  }
  const readOnly = !editable || state?.locked;
  return (
    <Modal title={`Permisos · ${role.name}`} onClose={onClose}>
      <Alert>{error}</Alert>
      {state?.locked && <Alert kind="warn">El Super Administrador tiene acceso total y no se puede modificar.</Alert>}
      {state && (
        <div className="table-wrap" style={{ boxShadow: 'none', border: '1px solid var(--chip)' }}>
          <table className="matrix">
            <thead><tr><th>Módulo</th>{ACTIONS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>
              {state.permissions.map((p) => (
                <tr key={p.module}>
                  <td>{p.label}</td>
                  {ACTIONS.map(([a, l]) => (
                    <td key={a}><input type="checkbox" aria-label={`${p.label}: ${l}`} checked={!!p[a]} disabled={readOnly} onChange={() => toggle(p.module, a)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <button className="btn ghost" onClick={onClose}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
        {!readOnly && <button className="btn" onClick={save}>Guardar permisos</button>}
      </div>
    </Modal>
  );
}
