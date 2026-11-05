-- Épica 2: Gestión de operaciones (reportes ciudadanos como operaciones).
-- Los catálogos iniciales (tipos y pasos de aprobación) y los permisos de los roles los siembra
-- `npm run db:seed` (src/domain/seed-data.js), igual que en la Épica 1.

-- HU-2.5: plazo configurable por tipo de reporte
CREATE TABLE report_types (
  code              text PRIMARY KEY,
  name              text NOT NULL,
  sla_hours         integer NOT NULL CHECK (sla_hours BETWEEN 1 AND 8760),
  warn_before_hours integer NOT NULL CHECK (warn_before_hours BETWEEN 0 AND 8760),
  is_active         boolean NOT NULL DEFAULT true,
  updated_by        uuid REFERENCES users(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- HU-2.2: el reporte (la "operación"). Código visible CA-0001 a partir de una secuencia.
CREATE SEQUENCE report_code_seq;
CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  type_code   text NOT NULL REFERENCES report_types(code),
  title       text NOT NULL,
  description text NOT NULL,
  location    text NOT NULL,
  status      text NOT NULL DEFAULT 'reportado'
              CHECK (status IN ('reportado', 'validado', 'en_revision', 'en_proceso', 'resuelto', 'rechazado')),
  created_by  uuid NOT NULL REFERENCES users(id),
  assignee_id uuid REFERENCES users(id),             -- HU-2.3: responsable actual
  assigned_at timestamptz,
  due_at      timestamptz NOT NULL,                  -- HU-2.5: created_at + plazo del tipo
  resolved_at timestamptz,
  closed_at   timestamptz,                           -- resuelto o rechazado
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status);
CREATE INDEX reports_type_idx ON reports (type_code);
CREATE INDEX reports_assignee_idx ON reports (assignee_id);
CREATE INDEX reports_created_by_idx ON reports (created_by);
CREATE INDEX reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX reports_due_open_idx ON reports (due_at) WHERE status NOT IN ('resuelto', 'rechazado');

-- HU-2.2: historial de estados (pantalla 13 «Seguimiento»)
CREATE TABLE report_status_history (
  id          bigserial PRIMARY KEY,
  report_id   uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  reason      text,
  changed_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_status_history_report_idx ON report_status_history (report_id, created_at);

-- HU-2.3: quién asignó, a quién, cuándo y por qué
CREATE TABLE report_assignments (
  id                   bigserial PRIMARY KEY,
  report_id            uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  assignee_id          uuid NOT NULL REFERENCES users(id),
  previous_assignee_id uuid REFERENCES users(id),
  assigned_by          uuid NOT NULL REFERENCES users(id),
  reason               text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_assignments_report_idx ON report_assignments (report_id, created_at);

-- HU-2.4: pasos de aprobación configurados por tipo de reporte
CREATE TABLE approval_steps (
  id                 serial PRIMARY KEY,
  type_code          text NOT NULL REFERENCES report_types(code) ON DELETE CASCADE,
  step_order         integer NOT NULL CHECK (step_order > 0),
  name               text NOT NULL,
  approver_role_code text,                            -- NULL = cualquiera con permiso aprobaciones.update
  required           boolean NOT NULL DEFAULT true,
  UNIQUE (type_code, step_order)
);

-- HU-2.4: decisiones. Cada solicitud de cierre abre una "ronda" con una fila por paso.
CREATE TABLE report_approvals (
  id                 bigserial PRIMARY KEY,
  report_id          uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  round              integer NOT NULL,
  step_order         integer NOT NULL,
  step_name          text NOT NULL,
  approver_role_code text,
  required           boolean NOT NULL,
  decision           text NOT NULL DEFAULT 'pending'
                     CHECK (decision IN ('pending', 'approved', 'rejected', 'returned', 'cancelled')),
  comment            text,
  requested_by       uuid NOT NULL REFERENCES users(id),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  decided_by         uuid REFERENCES users(id),
  decided_at         timestamptz,
  UNIQUE (report_id, round, step_order)
);
CREATE INDEX report_approvals_pending_idx ON report_approvals (decision) WHERE decision = 'pending';

-- HU-2.6: incidencias operativas vinculadas a un reporte
CREATE TABLE incidents (
  id          bigserial PRIMARY KEY,
  report_id   uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('material', 'equipo', 'personal', 'acceso', 'clima', 'otro')),
  description text NOT NULL,
  priority    text NOT NULL CHECK (priority IN ('baja', 'media', 'alta', 'critica')),
  status      text NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'en_atencion', 'resuelta', 'cerrada')),
  assignee_id uuid REFERENCES users(id),
  resolution  text,
  created_by  uuid NOT NULL REFERENCES users(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incidents_report_idx ON incidents (report_id);
CREATE INDEX incidents_status_idx ON incidents (status);

CREATE TABLE incident_events (
  id          bigserial PRIMARY KEY,
  incident_id bigint NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('created', 'status', 'comment', 'update')),
  from_value  text,
  to_value    text,
  comment     text,
  actor_id    uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_events_incident_idx ON incident_events (incident_id, created_at);

-- HU-2.3 / HU-2.5: notificaciones dentro de la app (pantalla 14)
CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  report_id  uuid REFERENCES reports(id) ON DELETE CASCADE,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- HU-2.5: resultado de cada envío de alerta (y base para no repetirla dentro de la ventana)
CREATE TABLE alert_deliveries (
  id         bigserial PRIMARY KEY,
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('due_soon', 'overdue')),
  channel    text NOT NULL CHECK (channel IN ('in_app', 'email')),
  status     text NOT NULL CHECK (status IN ('sent', 'failed')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_deliveries_dedupe_idx ON alert_deliveries (report_id, user_id, kind, created_at DESC);

-- HU-2.8: bitácora de cambios. Solo se inserta: un trigger impide modificar o borrar filas.
CREATE TABLE change_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name  text,                                   -- copia: el nombre sigue legible si el usuario se borra
  entity      text NOT NULL,
  entity_id   text,
  report_id   uuid,                                   -- sin FK a propósito: la bitácora sobrevive a todo
  action      text NOT NULL,
  result      text NOT NULL CHECK (result IN ('success', 'rejected')),
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_log_created_idx ON change_log (created_at DESC);
CREATE INDEX change_log_report_idx ON change_log (report_id);
CREATE INDEX change_log_actor_idx ON change_log (actor_id);

CREATE FUNCTION change_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora de cambios es de solo inserción (HU-2.8)' USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER change_log_no_update_delete
  BEFORE UPDATE OR DELETE ON change_log
  FOR EACH ROW EXECUTE FUNCTION change_log_is_append_only();

CREATE TRIGGER change_log_no_truncate
  BEFORE TRUNCATE ON change_log
  FOR EACH STATEMENT EXECUTE FUNCTION change_log_is_append_only();
