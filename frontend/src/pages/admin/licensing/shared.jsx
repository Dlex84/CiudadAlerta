import { useEffect, useState } from 'react';
import { api } from '../../../api.js';

// Épica 4: catálogos compartidos por las pestañas de licenciamiento (una sola llamada por sesión de página).
let metaCache = null;
export function useLicensingMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (!metaCache) api.get('/licensing/meta').then((m) => { metaCache = m; setMeta(m); }).catch(() => {});
  }, []);
  return meta;
}

export const STATUS_CHIP = { confirmada: 'ok', pendiente: 'warn', sin_licencia: 'bad' };
export const VALIDITY_CHIP = { vigente: 'ok', por_vencer: 'warn', vencida: 'bad' };
export const STATE_CHIP = { pendiente: 'warn', vencida: 'bad', atendida: 'ok' };
export const CRIT_CHIP = { baja: '', media: 'info', alta: 'warn', critica: 'bad' };
export const CATEGORY_CHIP = { permisiva: 'ok', dominio_publico: 'ok', copyleft_debil: 'info', copyleft_fuerte: 'warn', propietaria: 'bad', otra: '' };

export const Options = ({ list = [], all }) => (
  <>
    {all && <option value="">{all}</option>}
    {list.map((x) => <option key={x.key ?? x.code} value={x.key ?? x.code}>{x.label ?? x.name}</option>)}
  </>
);

export const LEGAL_NOTE = 'Las marcas de posible incompatibilidad son una ayuda para la revisión humana, no un dictamen legal.';
