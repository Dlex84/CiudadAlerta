-- Épica 4: Gestión de licenciamientos de software (Open Source, propietario y cumplimiento).
-- Catálogos iniciales (licencias, proyectos y reglas de alerta) y permisos: `npm run db:seed`.
-- Las reglas de negocio RN-4.x están en docs/backlog/epica-4.md; aquí se indican las que protege la base.

-- HU-4.1: catálogo de licencias con sus condiciones, fuente y fecha de verificación
CREATE TABLE license_types (
  id                   serial PRIMARY KEY,
  spdx_id              text NOT NULL UNIQUE,                 -- RN-4.1: identificador único (SPDX o LicenseRef-…)
  name                 text NOT NULL,
  version              text,
  category             text NOT NULL CHECK (category IN ('permisiva', 'copyleft_debil', 'copyleft_fuerte', 'dominio_publico', 'propietaria', 'otra')),
  source_url           text,
  obligations          text NOT NULL DEFAULT '',
  requires_attribution boolean NOT NULL DEFAULT false,
  redistribution       text NOT NULL CHECK (redistribution IN ('permitida', 'con_condiciones', 'prohibida')),
  modification         text NOT NULL CHECK (modification IN ('permitida', 'con_condiciones', 'prohibida')),
  restrictions         text NOT NULL DEFAULT '',
  verified_on          date,                                 -- RN-4.2: fuente y fecha de verificación
  verified_by          uuid REFERENCES users(id),
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (verified_on IS NULL OR source_url IS NOT NULL OR spdx_id LIKE 'LicenseRef-%')
);

-- HU-4.2: proyectos cuyo software se inventaría (con la licencia del propio proyecto, para RN-4.9)
CREATE TABLE software_projects (
  code           text PRIMARY KEY,
  name           text NOT NULL,
  license_id     integer NOT NULL REFERENCES license_types(id),
  repository_url text
);

-- HU-4.2: aplicaciones y librerías con su procedencia y licencia
CREATE TABLE software_components (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code     text NOT NULL REFERENCES software_projects(code),
  name             text NOT NULL,
  version          text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('aplicacion', 'libreria', 'servicio')),
  ecosystem        text,                                     -- npm, maven, …
  repository_url   text,
  declared_license text,                                     -- tal como lo declara el manifest
  license_id       integer REFERENCES license_types(id),
  license_status   text NOT NULL CHECK (license_status IN ('confirmada', 'pendiente', 'sin_licencia')),
  is_direct        boolean NOT NULL DEFAULT true,
  is_dev           boolean NOT NULL DEFAULT false,
  added_by         uuid REFERENCES users(id),
  added_at         timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (license_status <> 'confirmada' OR license_id IS NOT NULL)  -- RN-4.3: no hay "confirmada" sin licencia
);
-- RN-4.4: un mismo componente+versión no se repite dentro de un proyecto; entre proyectos se avisa como duplicado potencial
CREATE UNIQUE INDEX software_components_project_uq ON software_components (project_code, lower(name), version);
CREATE INDEX software_components_name_idx ON software_components (lower(name), version);
CREATE INDEX software_components_status_idx ON software_components (license_status);

-- HU-4.3: licencias propietarias adquiridas
CREATE SEQUENCE purchased_license_code_seq;
CREATE TABLE purchased_licenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,                         -- LIC-0001
  vendor       text NOT NULL,
  product      text NOT NULL,
  edition      text,
  modality     text NOT NULL CHECK (modality IN ('suscripcion', 'perpetua')),
  metric       text NOT NULL CHECK (metric IN ('usuario', 'equipo', 'aplicacion')),
  quantity     integer CHECK (quantity IS NULL OR quantity > 0),          -- NULL = sin límite (licencia de sitio)
  assigned     integer NOT NULL DEFAULT 0 CHECK (assigned >= 0),
  starts_on    date NOT NULL,
  expires_on   date,
  alert_days   integer NOT NULL DEFAULT 30 CHECK (alert_days BETWEEN 0 AND 365),
  license_key  text,                                         -- RN-4.8: confidencial
  contract_ref text,                                         -- RN-4.8: confidencial
  notes        text,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity IS NULL OR assigned <= quantity),          -- RN-4.5: nunca más asignadas que adquiridas
  CHECK (expires_on IS NULL OR expires_on >= starts_on),
  CHECK (modality <> 'suscripcion' OR expires_on IS NOT NULL) -- RN-4.6: una suscripción siempre vence
);
CREATE INDEX purchased_licenses_expires_idx ON purchased_licenses (expires_on) WHERE is_active;

-- HU-4.4: asignaciones; liberar no borra: cierra la fila (historial completo)
CREATE TABLE license_assignments (
  id             bigserial PRIMARY KEY,
  license_id     uuid NOT NULL REFERENCES purchased_licenses(id),
  target_type    text NOT NULL CHECK (target_type IN ('usuario', 'equipo', 'aplicacion')),
  target_user_id uuid REFERENCES users(id),
  target_name    text NOT NULL,
  assigned_by    uuid NOT NULL REFERENCES users(id),
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  released_at    timestamptz,
  released_by    uuid REFERENCES users(id),
  release_reason text,
  CHECK ((target_type = 'usuario') = (target_user_id IS NOT NULL)),
  CHECK (released_at IS NULL OR (released_by IS NOT NULL AND release_reason IS NOT NULL))
);
-- RN-4.5: el mismo destinatario no tiene dos asignaciones vigentes de la misma licencia
-- (para usuarios se compara el id, no el nombre: dos personas pueden llamarse igual)
CREATE UNIQUE INDEX license_assignments_active_uq ON license_assignments
  (license_id, target_type, coalesce(target_user_id::text, lower(target_name))) WHERE released_at IS NULL;
CREATE INDEX license_assignments_license_idx ON license_assignments (license_id, assigned_at DESC);

-- HU-4.7: evidencias (contratos, avisos, atribuciones, informes). Inmutables: una versión nueva es otra fila.
CREATE TABLE license_evidences (
  id             bigserial PRIMARY KEY,
  title          text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('contrato', 'aviso', 'atribucion', 'informe', 'otro')),
  classification text NOT NULL CHECK (classification IN ('publica', 'interna', 'confidencial')),
  version        text NOT NULL DEFAULT '1',
  url            text,
  storage_key    text UNIQUE,
  file_name      text,
  file_mime      text,
  file_size      integer CHECK (file_size IS NULL OR file_size > 0),
  project_code   text REFERENCES software_projects(code),
  component_id   uuid REFERENCES software_components(id),
  license_id     uuid REFERENCES purchased_licenses(id),
  author_id      uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (url IS NOT NULL OR storage_key IS NOT NULL),        -- RN-4.10: adjunta o enlaza
  CHECK ((storage_key IS NULL) = (file_name IS NULL))
);
CREATE INDEX license_evidences_component_idx ON license_evidences (component_id);
CREATE INDEX license_evidences_project_idx ON license_evidences (project_code);

-- HU-4.5: revisión de obligaciones por componente y versión (historial: nunca se edita)
CREATE TABLE component_reviews (
  id           bigserial PRIMARY KEY,
  component_id uuid NOT NULL REFERENCES software_components(id),
  version      text NOT NULL,                                -- versión revisada (copia)
  decision     text NOT NULL CHECK (decision IN ('aprobado', 'aprobado_con_condiciones', 'rechazado', 'requiere_revision')),
  obligations  text NOT NULL,
  evaluation   text NOT NULL,
  license_id   integer REFERENCES license_types(id),         -- licencia que el revisor dio por aplicable
  evidence_id  bigint REFERENCES license_evidences(id),
  reviewer_id  uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX component_reviews_component_idx ON component_reviews (component_id, created_at DESC);

-- HU-4.6: reglas configurables y alertas de cumplimiento con su seguimiento
CREATE TABLE compliance_alert_rules (
  kind        text PRIMARY KEY CHECK (kind IN ('vencimiento_licencia', 'sin_licencia', 'revision_pendiente', 'incompatibilidad')),
  days_before integer NOT NULL CHECK (days_before BETWEEN 0 AND 365),
  criticality text NOT NULL CHECK (criticality IN ('baja', 'media', 'alta', 'critica')),
  dedupe_days integer NOT NULL CHECK (dedupe_days BETWEEN 1 AND 365),
  is_active   boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE compliance_alerts (
  id             bigserial PRIMARY KEY,
  kind           text NOT NULL REFERENCES compliance_alert_rules(kind),
  criticality    text NOT NULL CHECK (criticality IN ('baja', 'media', 'alta', 'critica')),
  entity_type    text NOT NULL CHECK (entity_type IN ('licencia', 'componente')),
  entity_id      text NOT NULL,
  title          text NOT NULL,
  detail         text NOT NULL DEFAULT '',
  due_on         date NOT NULL,
  status         text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'atendida')),
  responsible_id uuid REFERENCES users(id),
  attended_at    timestamptz,
  attended_by    uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'atendida') = (attended_at IS NOT NULL))
);
-- RN-4.12: nunca dos alertas pendientes del mismo tipo para la misma licencia o componente
CREATE UNIQUE INDEX compliance_alerts_open_uq ON compliance_alerts (kind, entity_type, entity_id) WHERE status = 'pendiente';
CREATE INDEX compliance_alerts_status_idx ON compliance_alerts (status, due_on);

CREATE TABLE compliance_alert_events (
  id         bigserial PRIMARY KEY,
  alert_id   bigint NOT NULL REFERENCES compliance_alerts(id),
  kind       text NOT NULL CHECK (kind IN ('creada', 'responsable', 'seguimiento', 'atendida', 'reabierta')),
  comment    text,
  actor_id   uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compliance_alert_events_alert_idx ON compliance_alert_events (alert_id, created_at);

-- Trazabilidad (RN-4.11): revisiones, evidencias y seguimiento de alertas son de solo inserción.
CREATE FUNCTION licensing_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Registro de solo inserción (%): no se puede modificar ni borrar', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER component_reviews_append_only BEFORE UPDATE OR DELETE ON component_reviews
  FOR EACH ROW EXECUTE FUNCTION licensing_append_only();
CREATE TRIGGER license_evidences_append_only BEFORE UPDATE OR DELETE ON license_evidences
  FOR EACH ROW EXECUTE FUNCTION licensing_append_only();
CREATE TRIGGER compliance_alert_events_append_only BEFORE UPDATE OR DELETE ON compliance_alert_events
  FOR EACH ROW EXECUTE FUNCTION licensing_append_only();
