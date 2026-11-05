import React from 'react';
import { useAuth } from '../auth.jsx';
import CitizenShell from './CitizenShell.jsx';

// Pantalla 04 del prototipo. Los reportes llegan en la Épica 2; aquí queda el marco listo.
export default function Home() {
  const { session } = useAuth();
  const { user } = session;
  return (
    <CitizenShell path="/inicio" title="Inicio" subtitle={`Sector: ${user.sector || 'sin definir'}`}>
      <p style={{ marginTop: 0 }}>Hola, <b>{user.fullName.split(' ')[0]}</b> 👋</p>
      <div className="card stack">
        <div className="section-title" style={{ margin: 0 }}>Reportes en tu comunidad</div>
        <div className="stats">
          <div><b>—</b><small>En total</small></div>
          <div><b>—</b><small>En revisión</small></div>
          <div><b>—</b><small>Resueltos</small></div>
        </div>
        <button className="btn block" disabled title="Disponible en la Épica 2">+ Crear nuevo reporte</button>
        <p className="muted center" style={{ margin: 0 }}>La creación de reportes se habilita en la siguiente épica.</p>
      </div>
    </CitizenShell>
  );
}
