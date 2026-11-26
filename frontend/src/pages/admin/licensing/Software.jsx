import React, { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Alert, Field, fmtDate, Modal } from '../../../components/ui.jsx';
import { Pager } from '../../../ops.jsx';
import { LEGAL_NOTE, Options, STATUS_CHIP, useLicensingMeta } from './shared.jsx';

// HU-4.2 inventario de software y componentes · HU-4.5 revisión de obligaciones Open Source.
export default function Software() {
  const { can } = useAuth();
  const meta = useLicensingMeta();
  const empty = { project: '', q: '', status: '', category: '', flagged: '', unreviewed: '', direct: '1' };
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => api.get(`/software/components${qs({ ...filters, page })}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), [filters, page]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => { setPage(1); setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value }); };
  const done = (msg) => { setModal(null); setNotice(msg); load(); };

  return (
    <>
      <div className="row-between">
        <p className="muted" style={{ margin: 0 }}>Aplicaciones y librerías de cada proyecto, con su procedencia, licencia y revisión.</p>
        {can('software', 'create') && (
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setModal({ type: 'import' })}>⬆ Importar package-lock.json</button>
            <button className="btn" onClick={() => setModal({ type: 'new' })}>+ Nuevo componente</button>
          </div>
        )}
      </div>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      <div className="toolbar">
        <Field label="Proyecto"><select value={filters.project} onChange={set('project')}><Options list={meta?.projects} all="Todos" /></select></Field>
        <div className="grow"><Field label="Buscar" placeholder="Nombre del paquete" value={filters.q} onChange={set('q')} /></div>
        <Field label="Estado de licencia"><select value={filters.status} onChange={set('status')}><option value="">Todos</option><option value="pendiente,sin_licencia">Sin licencia confirmada</option><Options list={meta?.componentStatuses} /></select></Field>
        <Field label="Tipo de licencia"><select value={filters.category} onChange={set('category')}><Options list={meta?.licenseCategories} all="Todos" /></select></Field>
        <label className="check"><input type="checkbox" checked={!!filters.direct} onChange={set('direct')} /> Solo directas</label>
        <label className="check"><input type="checkbox" checked={!!filters.flagged} onChange={set('flagged')} /> Posible incompatibilidad</label>
        <label className="check"><input type="checkbox" checked={!!filters.unreviewed} onChange={set('unreviewed')} /> Sin revisión</label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Componente</th><th>Proyecto</th><th>Licencia</th><th>Estado</th><th>Revisión</th><th>Avisos</th></tr></thead>
          <tbody>
            {data?.items.map((c) => (
              <tr key={c.id}>
                <td><button type="button" className="linklike" onClick={() => setModal({ type: 'detail', id: c.id })}><b>{c.name}</b></button> <small className="muted">{c.version}</small>
                  <br /><small className="muted">{c.kindLabel}{c.isDev ? ' · desarrollo' : ''}{c.isDirect ? '' : ' · transitiva'}</small></td>
                <td>{c.project?.name ?? c.projectCode}</td>
                <td>{c.license ? <><b>{c.license.spdxId}</b><br /><small className="muted">{c.license.categoryLabel}</small></> : <small className="muted">Declarada: {c.declaredLicense ?? '—'}</small>}</td>
                <td><span className={`chip ${STATUS_CHIP[c.licenseStatus]}`}>{c.licenseStatusLabel}</span></td>
                <td>{c.latestReview ? <>{c.latestReview.decisionLabel}<br /><small className="muted">{fmtDate(c.latestReview.createdAt)}</small></> : <small className="muted">Sin revisión</small>}</td>
                <td>
                  {c.flags.length > 0 && <span className="chip bad" title={c.flags.map((f) => f.message).join(' ')}>Posible incompatibilidad</span>}{' '}
                  {c.duplicates > 0 && <span className="chip info" title="Mismo nombre y versión en otro proyecto">Duplicado potencial</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.items.length === 0 && <div className="empty">No hay componentes con esos filtros.</div>}
      </div>
      {data && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} noun="componente(s)" />}
      <p className="muted"><small>{LEGAL_NOTE}</small></p>

      {modal?.type === 'import' && <ImportForm meta={meta} onClose={() => setModal(null)} onDone={(s) => done(`Importación: ${s.created} nuevos (${s.confirmed} con licencia confirmada, ${s.pending} pendientes, ${s.withoutLicense} sin licencia), ${s.existing} ya existían.`)} />}
      {modal?.type === 'new' && <ComponentForm meta={meta} onClose={() => setModal(null)} onSaved={(r) => done(`${r.component.name} ${r.component.version} registrado.${r.potentialDuplicates.length ? ` Atención: ya existe en ${r.potentialDuplicates.map((d) => d.projectCode).join(', ')}.` : ''}`)} />}
      {modal?.type === 'detail' && <ComponentDetail id={modal.id} meta={meta} onClose={() => { setModal(null); load(); }} />}
    </>
  );
}

function ImportForm({ meta, onClose, onDone }) {
  const [projectCode, setProjectCode] = useState('ciudadalerta-backend');
  const [includeTransitive, setIncludeTransitive] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      let lockfile;
      try { lockfile = JSON.parse(await file.text()); } catch { throw new Error('El archivo no es un JSON válido.'); }
      onDone(await api.post('/software/import', { projectCode, lockfile, includeTransitive }));
    } catch (x) { setError(x.message); } finally { setBusy(false); }
  }
  return (
    <Modal title="Importar dependencias (package-lock.json)" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Proyecto"><select value={projectCode} onChange={(e) => setProjectCode(e.target.value)}><Options list={meta?.projects} /></select></Field>
        <Field label="Archivo package-lock.json"><input type="file" accept=".json,application/json" required onChange={(e) => setFile(e.target.files[0])} /></Field>
        <label className="check"><input type="checkbox" checked={includeTransitive} onChange={(e) => setIncludeTransitive(e.target.checked)} /> Incluir dependencias transitivas</label>
        <p className="muted" style={{ margin: 0 }}>Una sola licencia conocida queda «confirmada»; expresiones con varias o desconocidas quedan «revisión pendiente»; sin licencia declarada, «sin licencia». No se repiten los que ya existen.</p>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy}>{busy ? 'Importando…' : 'Importar'}</button></div>
      </form>
    </Modal>
  );
}

function ComponentForm({ meta, onClose, onSaved }) {
  const [form, setForm] = useState({ projectCode: 'municipal', name: '', version: '', kind: 'libreria', repositoryUrl: '', declaredLicense: '', licenseId: '' });
  const [types, setTypes] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/license-types').then((r) => setTypes(r.items)).catch(() => {}); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    try { onSaved(await api.post('/software/components', { ...form, licenseId: form.licenseId || undefined, repositoryUrl: form.repositoryUrl || undefined })); } catch (x) { setError(x.message); }
  }
  return (
    <Modal title="Nuevo componente" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <Field label="Proyecto"><select value={form.projectCode} onChange={set('projectCode')}><Options list={meta?.projects} /></select></Field>
          <Field label="Tipo"><select value={form.kind} onChange={set('kind')}><Options list={meta?.componentKinds} /></select></Field>
          <Field label="Nombre" required value={form.name} onChange={set('name')} />
          <Field label="Versión" required value={form.version} onChange={set('version')} />
        </div>
        <Field label="Repositorio (URL)" type="url" value={form.repositoryUrl} onChange={set('repositoryUrl')} />
        <Field label="Licencia declarada por el proveedor" placeholder="MIT, (MIT OR Apache-2.0)…" value={form.declaredLicense} onChange={set('declaredLicense')} />
        <Field label="Licencia confirmada (opcional)">
          <select value={form.licenseId} onChange={set('licenseId')}><option value="">— Dejar en revisión pendiente —</option>{types.map((t) => <option key={t.id} value={t.id}>{t.spdxId} · {t.categoryLabel}</option>)}</select>
        </Field>
        <Alert>{error}</Alert>
        <div className="row"><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn">Registrar</button></div>
      </form>
    </Modal>
  );
}

function ComponentDetail({ id, meta, onClose }) {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [types, setTypes] = useState([]);
  const [evidences, setEvidences] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState({ decision: 'aprobado', licenseId: '', obligations: '', evaluation: '', evidenceId: '' });
  const load = useCallback(async () => {
    try {
      const d = await api.get(`/software/components/${id}`);
      setData(d);
      if (can('evidencias', 'read')) setEvidences((await api.get(`/evidences?component=${id}&limit=50`)).items);
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); api.get('/license-types').then((r) => setTypes(r.items)).catch(() => {}); }, [load]);
  const set = (k) => (e) => setReview({ ...review, [k]: e.target.value });

  async function submitReview(e) {
    e.preventDefault();
    try {
      setData(await api.post(`/software/components/${id}/reviews`, { ...review, licenseId: review.licenseId || undefined, evidenceId: review.evidenceId || undefined }));
      setNotice('Revisión registrada.'); setError('');
      setReview({ decision: 'aprobado', licenseId: '', obligations: '', evaluation: '', evidenceId: '' });
    } catch (x) { setError(x.message); }
  }
  async function setLicense(licenseId) {
    try { await api.patch(`/software/components/${id}`, { licenseId: licenseId || null }); setNotice('Licencia actualizada.'); load(); } catch (x) { setError(x.message); }
  }
  const c = data?.component;

  return (
    <Modal title={c ? `${c.name} ${c.version}` : 'Componente'} onClose={onClose}>
      <Alert kind="ok">{notice}</Alert><Alert>{error}</Alert>
      {c && (
        <div className="stack">
          <dl className="review">
            <dt>Proyecto</dt><dd>{c.project?.name}</dd>
            <dt>Procedencia</dt><dd>{c.repositoryUrl ? <a href={c.repositoryUrl} target="_blank" rel="noreferrer">{c.repositoryUrl}</a> : '—'} {c.ecosystem && `· ${c.ecosystem}`}</dd>
            <dt>Licencia declarada</dt><dd>{c.declaredLicense ?? '—'}</dd>
            <dt>Licencia confirmada</dt>
            <dd>
              {can('software', 'update')
                ? <select value={c.license?.id ?? ''} onChange={(e) => setLicense(e.target.value)}><option value="">— Revisión pendiente —</option>{types.map((t) => <option key={t.id} value={t.id}>{t.spdxId}</option>)}</select>
                : (c.license?.spdxId ?? '—')} <span className={`chip ${STATUS_CHIP[c.licenseStatus]}`}>{c.licenseStatusLabel}</span>
            </dd>
            <dt>Incorporado</dt><dd>{fmtDate(c.addedAt)} · {c.addedByName}</dd>
          </dl>
          {c.flags.map((f) => <Alert key={f.code}>{f.message} {LEGAL_NOTE}</Alert>)}
          {data.potentialDuplicates.length > 0 && <Alert kind="ok">Duplicado potencial: también está en {data.potentialDuplicates.map((d) => d.projectCode).join(', ')}.</Alert>}

          <h3 className="h2">Revisiones de obligaciones</h3>
          {data.reviews.length === 0 && <p className="muted" style={{ margin: 0 }}>Sin revisiones.</p>}
          <ul className="plain">
            {data.reviews.map((r) => (
              <li key={r.id}><b>{r.decisionLabel}</b> · v{r.version} · {r.license ?? 'sin licencia'} · {r.reviewerName} · {fmtDate(r.createdAt)}
                <div className="muted">Obligaciones: {r.obligations}</div><div className="muted">Evaluación: {r.evaluation}</div>{r.evidenceId && <div className="muted">Evidencia #{r.evidenceId}</div>}</li>
            ))}
          </ul>
          {can('software', 'update') && (
            <form className="stack card" onSubmit={submitReview}>
              <b>Registrar revisión de esta versión</b>
              <div className="grid-2">
                <Field label="Decisión"><select value={review.decision} onChange={set('decision')}><Options list={meta?.reviewDecisions} /></select></Field>
                <Field label="Licencia aplicable"><select value={review.licenseId} onChange={set('licenseId')}><option value="">{c.license ? `${c.license.spdxId} (actual)` : '—'}</option>{types.map((t) => <option key={t.id} value={t.id}>{t.spdxId}</option>)}</select></Field>
              </div>
              <Field label="Obligaciones que aplican"><textarea rows={2} required value={review.obligations} onChange={set('obligations')} /></Field>
              <Field label="Evaluación"><textarea rows={3} required minLength={10} value={review.evaluation} onChange={set('evaluation')} /></Field>
              <Field label="Evidencia (opcional)"><select value={review.evidenceId} onChange={set('evidenceId')}><option value="">—</option>{evidences.map((e) => <option key={e.id} value={e.id}>#{e.id} {e.title}</option>)}</select></Field>
              <div><button className="btn">Guardar revisión</button></div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
