import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../../components/ui.jsx';
import { Pager } from '../../../ops.jsx';
import { Options, useLicensingMeta } from './shared.jsx';

// HU-4.7 — Evidencias: contratos, avisos, atribuciones e informes, restringidos según su clasificación.
const CLASS_CHIP = { publica: 'ok', interna: 'info', confidencial: 'bad' };

export default function Evidences() {
  const { can } = useAuth();
  const meta = useLicensingMeta();
  const [filters, setFilters] = useState({ project: '', kind: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api.get(`/evidences${qs({ ...filters, page })}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [filters, page]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.value }); };

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>
          Documentos que respaldan cada decisión. {can('confidencial', 'read') ? 'Ves también los confidenciales.' : 'Los confidenciales solo los ven quienes tienen ese permiso.'}
        </p>
        {can('evidencias', 'create') && <button className="btn" onClick={() => setAdding(true)}>+ Nueva evidencia</button>}
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="toolbar">
        <Field label="Proyecto"><select value={filters.project} onChange={set('project')}><Options list={meta?.projects} all="Todos" /></select></Field>
        <Field label="Tipo"><select value={filters.kind} onChange={set('kind')}><Options list={meta?.evidenceKinds} all="Todos" /></select></Field>
        <div className="grow"><Field label="Buscar" placeholder="Título" value={filters.q} onChange={set('q')} /></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Evidencia</th><th>Tipo</th><th>Clasificación</th><th>Relacionada con</th><th>Autor</th><th /></tr></thead>
          <tbody>
            {data?.items.map((e) => (
              <tr key={e.id}>
                <td><b>{e.title}</b> <small className="muted">v{e.version}</small></td>
                <td>{e.kindLabel}</td>
                <td><span className={`chip ${CLASS_CHIP[e.classification]}`}>{e.classificationLabel}</span></td>
                <td>{[e.projectCode, e.component && `${e.component.name} ${e.component.version}`, e.license && `${e.license.code} ${e.license.product}`].filter(Boolean).join(' · ')}</td>
                <td>{e.authorName}<br /><small className="muted">{fmtDate(e.createdAt)}</small></td>
                <td className="actions">
                  {e.hasFile ? <a className="btn ghost sm" href={`/api/evidences/${e.id}/file`}>⬇ {e.fileName}</a> : <a className="btn ghost sm" href={e.url} target="_blank" rel="noreferrer">Abrir enlace</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="empty">Sin evidencias.</div>}
      </div>
      {data && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} noun="evidencia(s)" />}
      {adding && <EvidenceForm meta={meta} onClose={() => setAdding(false)} onSaved={(e) => { setAdding(false); setNotice(`Evidencia «${e.title}» registrada.`); load(); }} />}
    </>
  );
}

function EvidenceForm({ meta, onClose, onSaved }) {
  const { can } = useAuth();
  const [form, setForm] = useState({ title: '', kind: 'aviso', classification: 'interna', version: '1', projectCode: '', componentId: '', licenseId: '', url: '' });
  const [file, setFile] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [components, setComponents] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (can('licencias', 'read')) api.get('/licenses').then((r) => setLicenses(r.items)).catch(() => {});
    if (can('software', 'read')) api.get('/software/components?direct=1&limit=500').then((r) => setComponents(r.items)).catch(() => {});
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const classes = (meta?.classifications ?? []).filter((c) => c.key !== 'confidencial' || can('confidencial', 'read'));

  async function submit(e) {
    e.preventDefault();
    const links = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    try {
      if (file) {
        const { url, ...meta2 } = links;
        onSaved(await api.postFile(`/evidences/upload${qs({ ...meta2, fileName: file.name })}`, file));
      } else {
        onSaved(await api.post('/evidences', links));
      }
    } catch (x) { setError(x.message); }
  }
  return (
    <Modal title="Nueva evidencia" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Título" required value={form.title} onChange={set('title')} />
        <div className="grid-2">
          <Field label="Tipo"><select value={form.kind} onChange={set('kind')}><Options list={meta?.evidenceKinds} /></select></Field>
          <Field label="Clasificación"><select value={form.classification} onChange={set('classification')}><Options list={classes} /></select></Field>
          <Field label="Versión" value={form.version} onChange={set('version')} />
          <Field label="Proyecto"><select value={form.projectCode} onChange={set('projectCode')}><Options list={meta?.projects} all="—" /></select></Field>
        </div>
        <Field label="Componente"><select value={form.componentId} onChange={set('componentId')}><option value="">—</option>{components.map((c) => <option key={c.id} value={c.id}>{c.name} {c.version} · {c.projectCode}</option>)}</select></Field>
        <Field label="Licencia adquirida"><select value={form.licenseId} onChange={set('licenseId')}><option value="">—</option>{licenses.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.product}</option>)}</select></Field>
        <Field label="Archivo (PDF, PNG, JPG o texto, hasta 5 MB)"><input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={(e) => setFile(e.target.files[0] ?? null)} /></Field>
        {!file && <Field label="…o enlace" type="url" placeholder="https://" value={form.url} onChange={set('url')} />}
        <p className="muted" style={{ margin: 0 }}>Relaciónala con al menos un proyecto, componente o licencia. Las evidencias no se editan: una versión nueva es otra evidencia.</p>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Guardar</button></div>
      </form>
    </Modal>
  );
}
