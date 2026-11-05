import React, { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field } from '../components/ui.jsx';
import { typeIcon, useOpsMeta } from '../ops.jsx';
import { navigate } from '../router.jsx';
import CitizenShell from './CitizenShell.jsx';

// Pantallas 08, 10 y 11 del prototipo (HU-2.2). Las fotografías (pantalla 09) quedan para una próxima entrega.
const STEPS = ['Describe el problema', 'Señala el lugar', 'Revisa la información'];

export default function NewReport() {
  const meta = useOpsMeta();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ typeCode: '', title: '', description: '', location: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const type = meta?.types.find((t) => t.code === form.typeCode);

  function next(e) {
    e.preventDefault();
    setError('');
    if (step === 0 && !form.typeCode) return setError('Elige la categoría del problema.');
    setStep(step + 1);
  }

  async function publish() {
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/reports', form);
      navigate(`/seguimiento?id=${r.code}&nuevo=1`);
    } catch (x) {
      setError(x.message);
      setBusy(false);
    }
  }

  return (
    <CitizenShell path="/reportes/nuevo" title="Nuevo reporte" subtitle={`Paso ${step + 1} de ${STEPS.length} · ${STEPS[step]}`} back={step === 0 ? '/inicio' : undefined}>
      {step > 0 && <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setStep(step - 1)}>‹ Anterior</button>}

      {step === 0 && (
        <form className="stack" onSubmit={next}>
          <div className="field"><span>Categoría del problema</span></div>
          <div className="type-grid" role="radiogroup" aria-label="Categoría">
            {meta?.types.map((t) => (
              <button type="button" key={t.code} role="radio" aria-checked={form.typeCode === t.code}
                className={`type-tile ${form.typeCode === t.code ? 'selected' : ''}`} onClick={() => setForm({ ...form, typeCode: t.code })}>
                <i aria-hidden="true">{typeIcon(t.code)}</i>{t.name}
              </button>
            ))}
          </div>
          <Field label="Título" placeholder="Ej.: Poste de luz apagado" required minLength={3} maxLength={120} value={form.title} onChange={set('title')} />
          <Field label="Descripción">
            <textarea rows={4} placeholder="Explica qué sucede y desde cuándo..." required minLength={10} maxLength={2000} value={form.description} onChange={set('description')} />
          </Field>
          <p className="muted" style={{ margin: 0 }}>No compartas datos personales de terceros.</p>
          <Alert>{error}</Alert>
          <button className="btn block">Continuar</button>
        </form>
      )}

      {step === 1 && (
        <form className="stack" onSubmit={next}>
          <Field label="Referencia o dirección" placeholder="Calle 10, Villa Mella" required minLength={3} maxLength={200} value={form.location} onChange={set('location')} />
          <p className="muted" style={{ margin: 0 }}>Usaremos una ubicación aproximada por privacidad. El mapa llega en una próxima épica.</p>
          <button className="btn block">Continuar</button>
        </form>
      )}

      {step === 2 && (
        <div className="stack">
          <dl className="card review">
            <dt>Categoría</dt><dd>{type?.name}</dd>
            <dt>Título</dt><dd>{form.title}</dd>
            <dt>Ubicación</dt><dd>{form.location}</dd>
            <dt>Descripción</dt><dd>{form.description}</dd>
            {type && <><dt>Plazo de atención</dt><dd>{type.slaHours} horas</dd></>}
          </dl>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Confirmo que la información es correcta.
          </label>
          <Alert>{error}</Alert>
          <button className="btn block" disabled={!consent || busy} onClick={publish}>{busy ? 'Publicando…' : 'Publicar reporte'}</button>
          <button className="btn ghost block" onClick={() => setStep(0)}>Editar información</button>
        </div>
      )}
    </CitizenShell>
  );
}
