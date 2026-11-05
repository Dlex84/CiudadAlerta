import React from 'react';
import { navigate } from '../router.jsx';

// Pantalla 01 del prototipo
export default function Welcome() {
  return (
    <div className="auth-wrap">
      <div className="phone-card stack center">
        <div className="brand-hero">
          <div className="logo" aria-hidden="true">!</div>
          <h1>CiudadAlerta</h1>
          <p style={{ fontWeight: 700, margin: '6px 0 0' }}>Tu comunidad, más conectada</p>
          <p className="muted">Reporta problemas, descubre incidencias y conoce su seguimiento.</p>
        </div>
        <button className="btn block" onClick={() => navigate('/registro')}>Comenzar</button>
        <button className="btn ghost block" onClick={() => navigate('/login')}>Ya tengo una cuenta</button>
      </div>
    </div>
  );
}
