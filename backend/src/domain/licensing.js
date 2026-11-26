// Épica 4 — Gestión de licenciamientos de software: catálogos y reglas de negocio puras (sin BD ni HTTP).

/** Clasificación aprobada de licencias (HU-4.1, RN-4.1). */
export const LICENSE_CATEGORIES = [
  { key: 'permisiva', label: 'Permisiva' },
  { key: 'copyleft_debil', label: 'Copyleft débil' },
  { key: 'copyleft_fuerte', label: 'Copyleft fuerte' },
  { key: 'dominio_publico', label: 'Dominio público' },
  { key: 'propietaria', label: 'Propietaria' },
  { key: 'otra', label: 'Otra / sin clasificar' },
];
export const PERMISSION_LEVELS = [
  { key: 'permitida', label: 'Permitida' },
  { key: 'con_condiciones', label: 'Con condiciones' },
  { key: 'prohibida', label: 'Prohibida' },
];

/** Estado de la licencia de un componente (HU-4.2). */
export const COMPONENT_LICENSE_STATUSES = [
  { key: 'confirmada', label: 'Confirmada' },
  { key: 'pendiente', label: 'Revisión pendiente' },
  { key: 'sin_licencia', label: 'Sin licencia declarada' },
];
export const COMPONENT_KINDS = [
  { key: 'aplicacion', label: 'Aplicación' },
  { key: 'libreria', label: 'Librería' },
  { key: 'servicio', label: 'Servicio' },
];

/** Decisiones de la revisión de obligaciones (HU-4.5). */
export const REVIEW_DECISIONS = [
  { key: 'aprobado', label: 'Aprobado' },
  { key: 'aprobado_con_condiciones', label: 'Aprobado con condiciones' },
  { key: 'rechazado', label: 'Rechazado' },
  { key: 'requiere_revision', label: 'Requiere revisión legal' },
];
/** Una revisión con estas decisiones cierra el pendiente del componente. */
export const CLOSING_DECISIONS = ['aprobado', 'aprobado_con_condiciones', 'rechazado'];

/** Licencias adquiridas (HU-4.3). */
export const MODALITIES = [
  { key: 'suscripcion', label: 'Suscripción (vence)' },
  { key: 'perpetua', label: 'Perpetua' },
];
export const METRICS = [
  { key: 'usuario', label: 'Por usuario' },
  { key: 'equipo', label: 'Por equipo' },
  { key: 'aplicacion', label: 'Por aplicación' },
];

/** Evidencias (HU-4.7). */
export const EVIDENCE_KINDS = [
  { key: 'contrato', label: 'Contrato' },
  { key: 'aviso', label: 'Aviso de licencia' },
  { key: 'atribucion', label: 'Atribución' },
  { key: 'informe', label: 'Informe' },
  { key: 'otro', label: 'Otro' },
];
export const CLASSIFICATIONS = [
  { key: 'publica', label: 'Pública' },
  { key: 'interna', label: 'Interna' },
  { key: 'confidencial', label: 'Confidencial' },
];

/** Alertas de cumplimiento (HU-4.6). */
export const ALERT_KINDS = [
  { key: 'vencimiento_licencia', label: 'Vencimiento de licencia adquirida', entityType: 'licencia' },
  { key: 'sin_licencia', label: 'Componente sin licencia confirmada', entityType: 'componente' },
  { key: 'revision_pendiente', label: 'Revisión de obligaciones pendiente', entityType: 'componente' },
  { key: 'incompatibilidad', label: 'Posible incompatibilidad de licencias', entityType: 'componente' },
];
export const CRITICALITIES = [
  { key: 'baja', label: 'Baja' },
  { key: 'media', label: 'Media' },
  { key: 'alta', label: 'Alta' },
  { key: 'critica', label: 'Crítica' },
];
/** Reglas por defecto (editables en la pantalla de alertas). */
export const DEFAULT_ALERT_RULES = [
  { kind: 'vencimiento_licencia', daysBefore: 30, criticality: 'alta', dedupeDays: 7 },
  { kind: 'sin_licencia', daysBefore: 7, criticality: 'alta', dedupeDays: 7 },
  { kind: 'revision_pendiente', daysBefore: 15, criticality: 'media', dedupeDays: 7 },
  { kind: 'incompatibilidad', daysBefore: 3, criticality: 'critica', dedupeDays: 7 },
];

export const keysOf = (list) => list.map((x) => x.key);
export const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;
export const PURCHASED_CODE_RE = /^LIC-\d{4,}$/i;

/** Estado de vigencia de una licencia adquirida a una fecha (RN-4.6). */
export function licenseValidity(lic, today, alertDays = lic.alertDays) {
  if (!lic.expiresOn) return 'vigente';
  const days = daysBetween(today, lic.expiresOn);
  if (days < 0) return 'vencida';
  return days <= alertDays ? 'por_vencer' : 'vigente';
}
export const VALIDITY_LABEL = { vigente: 'Vigente', por_vencer: 'Por vencer', vencida: 'Vencida' };

/** Días entre dos fechas YYYY-MM-DD (o Date), contando días calendario UTC. */
export function daysBetween(a, b) {
  const d = (v) => Date.UTC(...isoDate(v).split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((d(b) - d(a)) / 86_400_000);
}
export const isoDate = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/**
 * RN-4.9: marca POSIBLES incompatibilidades para revisión humana. No es un dictamen legal:
 * solo compara la categoría de la licencia del componente con la del proyecto que lo usa.
 * `component.isDev` = dependencia de desarrollo (no se distribuye con el producto).
 */
export function compatibilityFlags({ componentCategory, projectCategory, isDev = false }) {
  const flags = [];
  if (!componentCategory) return flags;
  const closedProject = ['permisiva', 'propietaria'].includes(projectCategory);
  if (componentCategory === 'copyleft_fuerte' && closedProject && !isDev) {
    flags.push({
      code: 'copyleft_en_proyecto_no_copyleft',
      message: 'Licencia copyleft fuerte dentro de un proyecto que no es copyleft: podría exigir publicar el código del proyecto bajo la misma licencia.',
    });
  }
  if (componentCategory === 'propietaria' && projectCategory !== 'propietaria' && !isDev) {
    flags.push({
      code: 'propietaria_en_proyecto_abierto',
      message: 'Componente propietario dentro de un proyecto open source: revisar si su licencia permite redistribuirlo.',
    });
  }
  if (componentCategory === 'otra') {
    flags.push({ code: 'categoria_desconocida', message: 'La licencia no tiene una categoría aprobada: clasificarla antes de usarla.' });
  }
  return flags;
}

/**
 * Extrae los paquetes de un package-lock.json de npm (lockfileVersion 2 o 3).
 * Devuelve [{ name, version, license, isDirect, isDev, repositoryUrl }]. Las dependencias directas
 * son las que el proyecto declara en su package.json (dependencies / devDependencies).
 */
export function packagesFromLockfile(lock) {
  if (!lock || typeof lock !== 'object' || !lock.packages || typeof lock.packages !== 'object') return null;
  const root = lock.packages[''] ?? {};
  const direct = new Set([...Object.keys(root.dependencies ?? {}), ...Object.keys(root.devDependencies ?? {}), ...Object.keys(root.optionalDependencies ?? {})]);
  const out = [];
  for (const [path, p] of Object.entries(lock.packages)) {
    if (!path || !path.includes('node_modules/') || p?.link) continue;
    const name = p.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (!name || typeof p.version !== 'string') continue;
    const topLevel = path === `node_modules/${name}`;
    out.push({
      name,
      version: p.version,
      license: typeof p.license === 'string' ? p.license : null,
      isDirect: topLevel && direct.has(name),
      isDev: Boolean(p.dev),
      repositoryUrl: typeof p.resolved === 'string' && p.resolved.startsWith('https://registry.npmjs.org/') ? `https://www.npmjs.com/package/${name}/v/${p.version}` : null,
    });
  }
  return out;
}

/**
 * Lee una expresión SPDX simple de un manifest ("MIT", "(MIT OR Apache-2.0)", "BSD-3-Clause AND MIT").
 * Devuelve los identificadores en orden. No interpreta la expresión: si hay más de uno, la licencia queda
 * pendiente de revisión (RN-4.3) para que una persona decida cuál aplica.
 */
export function parseSpdxExpression(expr) {
  if (typeof expr !== 'string' || !expr.trim()) return [];
  return expr.replace(/[()]/g, ' ').split(/\s+(?:OR|AND|WITH)\s+/i).map((s) => s.trim()).filter(Boolean);
}
