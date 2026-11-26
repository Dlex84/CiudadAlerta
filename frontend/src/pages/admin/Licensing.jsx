import React from 'react';
import { useAuth } from '../../auth.jsx';
import { navigate } from '../../router.jsx';
import Alerts from './licensing/Alerts.jsx';
import Catalog from './licensing/Catalog.jsx';
import Evidences from './licensing/Evidences.jsx';
import Purchased from './licensing/Purchased.jsx';
import Report from './licensing/Report.jsx';
import Software from './licensing/Software.jsx';

// Épica 4 — Gestión de licenciamientos de software. Cada pestaña aparece solo si el rol tiene su permiso;
// el servidor vuelve a validar cada acción.
const TABS = [
  { key: 'software', label: 'Inventario de software', module: 'software', render: () => <Software /> },
  { key: 'catalogo', label: 'Catálogo de licencias', module: 'licencias', render: () => <Catalog /> },
  { key: 'adquiridas', label: 'Licencias adquiridas', module: 'licencias', render: () => <Purchased /> },
  { key: 'alertas', label: 'Alertas', module: 'cumplimiento', render: () => <Alerts /> },
  { key: 'evidencias', label: 'Evidencias', module: 'evidencias', render: () => <Evidences /> },
  { key: 'reportes', label: 'Reportes', module: 'cumplimiento', render: () => <Report /> },
];

export default function Licensing({ tab }) {
  const { can } = useAuth();
  const visible = TABS.filter((t) => can(t.module, 'read'));
  const current = visible.find((t) => t.key === tab) ?? visible[0];
  return (
    <>
      <h1>Licenciamiento de software</h1>
      <div className="btn-row" style={{ marginBottom: 16 }}>
        {visible.map((t) => (
          <button key={t.key} className={`btn sm ${t === current ? '' : 'ghost'}`} onClick={() => navigate(`/admin/licenciamiento?tab=${t.key}`)}>{t.label}</button>
        ))}
      </div>
      {current ? current.render() : <p className="muted">Tu rol no tiene acceso a ninguna sección de licenciamiento.</p>}
    </>
  );
}
