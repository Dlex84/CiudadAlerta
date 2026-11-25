import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Alert, Field, Modal } from '../../../components/ui.jsx';
import { CATEGORY_CHIP, Options, useLicensingMeta } from './shared.jsx';

// HU-4.1 — Catálogo de licencias Open Source y propietarias con sus condiciones.
export default function Catalog() {
  const { can } = useAuth();
  const meta = useLicensingMeta();
  const [filters, setFilters] = useState({ q: '', category: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const load = useCallback(() => api.get(`/license-types${qs(filters)}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [filters]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const level = (k) => meta?.permissionLevels.find((x) => x.key === k)?.label ?? k;

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Condiciones de cada licencia, con la fuente consultada y la fecha de verificación.</p>
        {can('licencias', 'create') && <button className="btn" onClick={() => setModal({})}>+ Nueva licencia</button>}
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="toolbar">
        <div className="grow"><Field label="Buscar" placeholder="MIT, GPL, Apache…" value={filters.q} onChange={set('q')} /></div>
        <Field label="Categoría"><select value={filters.category} onChange={set('category')}><Options list={meta?.licenseCategories} all="Todas" /></select></Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Licencia</th><th>Categoría</th><th>Atribución</th><th>Redistribución</th><th>Modificación</th><th>Obligaciones</th><th>Verificada</th><th className="num">En uso</th><th /></tr></thead>
          <tbody>
            {data?.items.map((l) => (
              <tr key={l.id}>
                <td><b>{l.spdxId}</b><br /><small className="muted">{l.name}{l.version ? ` ${l.version}` : ''}</small></td>
                <td><span className={`chip ${CATEGORY_CHIP[l.category] ?? ''}`}>{l.categoryLabel}</span></td>
                <td>{l.requiresAttribution ? 'Sí' : 'No'}</td>
                <td>{level(l.redistribution)}</td>
                <td>{level(l.modification)}</td>
                <td className="muted" style={{ maxWidth: 320 }}>{l.obligations}{l.restrictions ? ` ${l.restrictions}` : ''}</td>
                <td>{l.verifiedOn ? <>{l.verifiedOn}{l.sourceUrl && <><br /><a href={l.sourceUrl} target="_blank" rel="noreferrer">fuente</a></>}</> : <span className="chip warn">Sin verificar</span>}</td>
                <td className="num">{l.components}</td>
                <td className="actions">{can('licencias', 'update') && <button className="btn ghost sm" onClick={() => setModal({ license: l })}>Editar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <LicenseForm meta={meta} license={modal.license} onClose={() => setModal(null)} onSaved={(l) => { setModal(null); setNotice(`Licencia ${l.spdxId} guardada.`); load(); }} />}
    </>
  );
}

function LicenseForm({ meta, license, onClose, onSaved }) {
  const [form, setForm] = useState(license ?? {
    spdxId: '', name: '', version: '', category: 'permisiva', sourceUrl: '', obligations: '', requiresAttribution: true,
    redistribution: 'permitida', modification: 'permitida', restrictions: '', verifiedOn: '',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function submit(e) {
    e.preventDefault();
    const body = { ...form, verifiedOn: form.verifiedOn || null };
    for (const k of ['id', 'spdxId', 'categoryLabel', 'components', 'verifiedBy', 'createdAt', 'updatedAt', 'isActive']) if (license) delete body[k];
    try { onSaved(license ? await api.patch(`/license-types/${license.id}`, body) : await api.post('/license-types', body)); } catch (x) { setError(x.message); }
  }
  return (
    <Modal title={license ? `Editar ${license.spdxId}` : 'Nueva licencia'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {!license && <Field label="Identificador SPDX" required placeholder="EPL-2.0 o LicenseRef-Proveedor" value={form.spdxId} onChange={set('spdxId')} />}
        <Field label="Nombre" required value={form.name} onChange={set('name')} />
        <div className="grid-2">
          <Field label="Versión" value={form.version ?? ''} onChange={set('version')} />
          <Field label="Categoría"><select value={form.category} onChange={set('category')}><Options list={meta?.licenseCategories} /></select></Field>
          <Field label="Redistribución"><select value={form.redistribution} onChange={set('redistribution')}><Options list={meta?.permissionLevels} /></select></Field>
          <Field label="Modificación"><select value={form.modification} onChange={set('modification')}><Options list={meta?.permissionLevels} /></select></Field>
        </div>
        <label className="check"><input type="checkbox" checked={form.requiresAttribution} onChange={set('requiresAttribution')} /> Exige atribución</label>
        <Field label="Resumen de obligaciones"><textarea rows={3} required value={form.obligations} onChange={set('obligations')} /></Field>
        <Field label="Restricciones"><textarea rows={2} value={form.restrictions ?? ''} onChange={set('restrictions')} /></Field>
        <div className="grid-2">
          <Field label="Fuente (URL)" type="url" placeholder="https://spdx.org/licenses/…" value={form.sourceUrl ?? ''} onChange={set('sourceUrl')} />
          <Field label="Fecha de verificación" type="date" value={form.verifiedOn ?? ''} onChange={set('verifiedOn')} />
        </div>
        <p className="muted" style={{ margin: 0 }}>Si cambian las condiciones y no indicas una nueva fecha, la licencia queda «sin verificar».</p>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}
