// Épica 2 — Gestión de operaciones. En CiudadAlerta una "operación" es un reporte ciudadano.
// Catálogos y reglas puras (sin BD ni HTTP). Ver docs/backlog/epica-2.md y docs/decisiones/ADR-003.

/** Tipos de reporte (pantalla 08 del prototipo) con su plazo inicial en horas (HU-2.5). Se editan desde el panel. */
export const REPORT_TYPES = [
  { code: 'alumbrado', name: 'Alumbrado', slaHours: 72, warnBeforeHours: 12 },
  { code: 'basura', name: 'Basura', slaHours: 48, warnBeforeHours: 8 },
  { code: 'agua', name: 'Agua', slaHours: 24, warnBeforeHours: 4 },
  { code: 'vias', name: 'Vías públicas', slaHours: 168, warnBeforeHours: 24 },
];

/** Estados del ciclo de vida (pantalla 13). «Vencido» no es un estado: es una condición calculada (ADR-003). */
export const STATUSES = [
  { key: 'reportado', label: 'Reportado' },
  { key: 'validado', label: 'Validado' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'en_proceso', label: 'En proceso' },
  { key: 'resuelto', label: 'Resuelto' },
  { key: 'rechazado', label: 'Rechazado' },
];
export const STATUS_KEYS = STATUSES.map((s) => s.key);
export const statusLabel = (key) => STATUSES.find((s) => s.key === key)?.label ?? key;

export const INITIAL_STATUS = 'reportado';
export const CLOSED_STATUSES = ['resuelto', 'rechazado'];
export const OPEN_STATUSES = STATUS_KEYS.filter((s) => !CLOSED_STATUSES.includes(s));

/** HU-2.2: transiciones permitidas. Cualquier otra se rechaza. */
export const TRANSITIONS = {
  reportado: ['validado', 'rechazado'],
  validado: ['en_revision', 'rechazado'],
  en_revision: ['en_proceso', 'rechazado'],
  en_proceso: ['resuelto', 'en_revision'],
  resuelto: [],
  rechazado: [],
};
/** Rechazar o devolver un trabajo a revisión exige un motivo escrito. */
export const needsReason = (from, to) => to === 'rechazado' || (from === 'en_proceso' && to === 'en_revision');
export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

/**
 * HU-2.1: agrupaciones del panel. Las mismas se aceptan como filtro `bucket` en GET /api/reports,
 * así los indicadores y los registros consultables salen de la misma definición.
 */
export const BUCKETS = {
  pendientes: { label: 'Pendientes de validar', statuses: ['reportado'] },
  en_proceso: { label: 'En proceso', statuses: ['validado', 'en_revision', 'en_proceso'] },
  completados: { label: 'Completados', statuses: ['resuelto'] },
  rechazados: { label: 'Rechazados', statuses: ['rechazado'] },
  abiertos: { label: 'Abiertos', statuses: OPEN_STATUSES },
};

export const isOverdue = (report, now) =>
  !CLOSED_STATUSES.includes(report.status) && new Date(report.dueAt).getTime() < now.getTime();

export const isDueSoon = (report, now, warnBeforeHours) => {
  if (CLOSED_STATUSES.includes(report.status)) return false;
  const due = new Date(report.dueAt).getTime();
  return due >= now.getTime() && due - now.getTime() <= warnBeforeHours * 3_600_000;
};

/** Código visible del reporte: 28 -> "CA-0028" (pantalla 07). */
export const formatReportCode = (n) => `CA-${String(n).padStart(4, '0')}`;
export const REPORT_CODE_RE = /^#?CA-\d{4,}$/i;

/** HU-2.6: incidencias operativas (problemas internos al atender un reporte). */
export const INCIDENT_CATEGORIES = [
  { key: 'material', label: 'Falta de material' },
  { key: 'equipo', label: 'Equipo o vehículo' },
  { key: 'personal', label: 'Personal' },
  { key: 'acceso', label: 'Acceso al lugar' },
  { key: 'clima', label: 'Clima' },
  { key: 'otro', label: 'Otro' },
];
export const INCIDENT_PRIORITIES = [
  { key: 'baja', label: 'Baja' },
  { key: 'media', label: 'Media' },
  { key: 'alta', label: 'Alta' },
  { key: 'critica', label: 'Crítica' },
];
export const INCIDENT_STATUSES = [
  { key: 'abierta', label: 'Abierta' },
  { key: 'en_atencion', label: 'En atención' },
  { key: 'resuelta', label: 'Resuelta' },
  { key: 'cerrada', label: 'Cerrada' },
];
export const INCIDENT_TRANSITIONS = {
  abierta: ['en_atencion', 'resuelta', 'cerrada'],
  en_atencion: ['resuelta', 'abierta'],
  resuelta: ['cerrada', 'en_atencion'],
  cerrada: [],
};

/** HU-2.4: decisiones de un paso de aprobación. */
export const APPROVAL_DECISIONS = ['approved', 'rejected', 'returned'];
/** Paso por defecto para todos los tipos: el Supervisor aprueba antes de Resuelto. */
export const DEFAULT_APPROVAL_STEPS = [{ name: 'Visto bueno del supervisor', approverRoleCode: 'supervisor', required: true }];

/** Para el frontend: un solo endpoint con todos los catálogos. */
export const operationsMeta = () => ({
  statuses: STATUSES,
  transitions: TRANSITIONS,
  closedStatuses: CLOSED_STATUSES,
  buckets: Object.entries(BUCKETS).map(([key, b]) => ({ key, ...b })),
  incidentCategories: INCIDENT_CATEGORIES,
  incidentPriorities: INCIDENT_PRIORITIES,
  incidentStatuses: INCIDENT_STATUSES,
  incidentTransitions: INCIDENT_TRANSITIONS,
  approvalDecisions: APPROVAL_DECISIONS,
});
