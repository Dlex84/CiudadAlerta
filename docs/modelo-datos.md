# Modelo de datos (Épica 1)

Migración: [`backend/migrations/001_usuarios_roles_y_acceso.sql`](../backend/migrations/001_usuarios_roles_y_acceso.sql).

```mermaid
erDiagram
  roles ||--o{ users : "tiene"
  roles ||--o{ role_permissions : "define"
  users ||--o{ sessions : "abre"
  users ||--o{ password_reset_tokens : "solicita"
  users ||--o{ access_logs : "genera"
  roles { int id PK
    text code UK "solo roles del sistema"
    text name UK "sin distinguir mayúsculas"
    text dashboard_path "/inicio o /admin"
    bool is_active
    bool is_system }
  role_permissions { int role_id PK
    text module PK
    bool can_create
    bool can_read
    bool can_update
    bool can_delete }
  users { uuid id PK
    text email UK "único entre no eliminados"
    text password_hash "NULL = invitado"
    int role_id FK
    text status "active | blocked"
    text blocked_reason
    timestamptz last_login_at
    timestamptz profile_updated_at
    timestamptz deleted_at "baja lógica" }
  sessions { uuid id PK
    text token_hash UK
    timestamptz expires_at
    timestamptz revoked_at }
  password_reset_tokens { uuid id PK
    text token_hash UK
    text purpose "reset | invite"
    timestamptz expires_at
    timestamptz used_at }
  access_logs { bigint id PK
    uuid user_id FK "NULL si el correo no existe"
    text email_attempted
    text event "login_success | login_failed | login_blocked | logout"
    text ip
    text country
    text city }
```

## Decisiones
- **Permisos como matriz** (`role_permissions`) en vez de un catálogo de permisos: es exactamente lo que pide HU-1.4 (módulo × 4 acciones) y la pantalla es una tabla de casillas. Si luego se necesitan permisos más finos (p. ej. «cerrar reporte»), se agrega un módulo o una tabla `permissions`.
- **Baja lógica de usuarios** (`deleted_at`): conserva el historial de auditoría. El índice único del correo ignora los eliminados.
- **`access_logs.user_id` con `ON DELETE SET NULL`** y `email_attempted` siempre guardado: los intentos con correos inexistentes también quedan registrados.
- **Tokens y sesiones guardan solo hash**: una filtración de la BD no entrega sesiones ni enlaces válidos.
- `sector` es texto libre por ahora; cuando exista el mapa (Épica 2) conviene un catálogo de sectores.

# Épica 2 — Gestión de operaciones

Migración: [`backend/migrations/002_operaciones.sql`](../backend/migrations/002_operaciones.sql). Decisiones en [ADR-003](decisiones/ADR-003-operaciones.md).

```mermaid
erDiagram
  report_types ||--o{ reports : "clasifica"
  report_types ||--o{ approval_steps : "configura"
  users ||--o{ reports : "crea / atiende"
  reports ||--o{ report_status_history : "historial"
  reports ||--o{ report_assignments : "asignaciones"
  reports ||--o{ report_approvals : "rondas"
  reports ||--o{ incidents : "incidencias"
  incidents ||--o{ incident_events : "historial"
  users ||--o{ notifications : "recibe"
  reports ||--o{ alert_deliveries : "alertas"
  report_types { text code PK
    int sla_hours "plazo HU-2.5"
    int warn_before_hours }
  reports { uuid id PK
    text code UK "CA-0001"
    text status "reportado a rechazado"
    uuid assignee_id FK
    timestamptz due_at "creación + plazo" }
  report_approvals { bigint id PK
    int round
    int step_order
    text decision "pending approved rejected returned cancelled" }
  incidents { bigint id PK
    text category
    text priority
    text status "abierta en_atencion resuelta cerrada"
    text resolution }
  alert_deliveries { bigint id PK
    text kind "due_soon overdue"
    text channel "in_app email"
    text status "sent failed" }
  change_log { bigint id PK
    uuid actor_id
    text entity
    text action
    text result "success rejected"
    jsonb old_values
    jsonb new_values }
```

## Decisiones (Épica 2)
- **`change_log` sin claves foráneas a reportes y con `actor_name` copiado:** la bitácora sobrevive aunque se borre un usuario o un reporte. Un trigger impide UPDATE, DELETE y TRUNCATE.
- **`report_approvals` copia nombre, rol y obligatoriedad del paso:** cambiar la configuración no altera rondas en curso.
- **Índice parcial `reports_due_open_idx`** solo sobre reportes abiertos: es lo que consulta la revisión de alertas.
- **`alert_deliveries_dedupe_idx`** (reporte, usuario, tipo, fecha): permite saber rápido si una alerta ya se envió dentro de la ventana.

# Épica 4 — Gestión de licenciamientos

Migración [`004_licenciamientos.sql`](../backend/migrations/004_licenciamientos.sql). Reglas RN-4.x en [epica-4.md](backlog/epica-4.md#4-reglas-de-negocio).

```mermaid
erDiagram
  license_types ||--o{ software_projects : "licencia del proyecto"
  license_types ||--o{ software_components : "licencia confirmada"
  software_projects ||--o{ software_components : contiene
  software_components ||--o{ component_reviews : "revisiones"
  license_types ||--o{ component_reviews : "licencia aplicable"
  license_evidences ||--o{ component_reviews : respalda
  purchased_licenses ||--o{ license_assignments : "asignaciones"
  users ||--o{ license_assignments : "destinatario"
  software_projects ||--o{ license_evidences : "relacionada"
  software_components ||--o{ license_evidences : "relacionada"
  purchased_licenses ||--o{ license_evidences : "relacionada"
  compliance_alert_rules ||--o{ compliance_alerts : genera
  compliance_alerts ||--o{ compliance_alert_events : seguimiento
  users ||--o{ compliance_alerts : responsable

  license_types {
    serial id PK
    text spdx_id UK
    text category
    text redistribution
    text modification
    bool requires_attribution
    text source_url
    date verified_on
  }
  software_projects {
    text code PK
    int license_id FK
  }
  software_components {
    uuid id PK
    text project_code FK
    text name
    text version
    text declared_license
    int license_id FK
    text license_status
    bool is_direct
    bool is_dev
    uuid added_by FK
  }
  component_reviews {
    bigserial id PK
    uuid component_id FK
    text version
    text decision
    text obligations
    text evaluation
    uuid reviewer_id FK
  }
  purchased_licenses {
    uuid id PK
    text code UK
    text modality
    text metric
    int quantity
    int assigned
    date expires_on
    int alert_days
    text license_key
    text contract_ref
  }
  license_assignments {
    bigserial id PK
    uuid license_id FK
    text target_type
    uuid target_user_id FK
    text target_name
    timestamptz released_at
    text release_reason
  }
  license_evidences {
    bigserial id PK
    text classification
    text url
    text storage_key UK
    text version
  }
  compliance_alert_rules {
    text kind PK
    int days_before
    text criticality
    int dedupe_days
  }
  compliance_alerts {
    bigserial id PK
    text kind FK
    text entity_type
    text entity_id
    date due_on
    text status
  }
  compliance_alert_events {
    bigserial id PK
    bigint alert_id FK
    text kind
  }
```

## Integridad que garantiza la base de datos (Épica 4)

Estas reglas se cumplen aunque alguien escriba directo en PostgreSQL saltando la API; `backend/test/pg-integration.test.js` las prueba.

| Restricción | Tabla | Protege |
|---|---|---|
| `UNIQUE (spdx_id)` · `CHECK category IN (…)` · `CHECK redistribution / modification IN (…)` | `license_types` | RN-4.1: clasificación aprobada, sin repetidos |
| `CHECK (verified_on IS NULL OR source_url IS NOT NULL OR spdx_id LIKE 'LicenseRef-%')` | `license_types` | RN-4.2: no hay verificación sin fuente |
| `CHECK (license_status <> 'confirmada' OR license_id IS NOT NULL)` | `software_components` | RN-4.3: no hay «confirmada» sin licencia |
| Índice único `(project_code, lower(name), version)` | `software_components` | RN-4.4: sin repetidos dentro del proyecto |
| `CHECK (assigned >= 0)` · `CHECK (quantity IS NULL OR assigned <= quantity)` | `purchased_licenses` | RN-4.5: nunca más asignadas que adquiridas |
| `UPDATE … SET assigned = assigned + 1 WHERE assigned < quantity` e `INSERT` en una sola sentencia | `purchased_licenses`, `license_assignments` | RN-4.5 con solicitudes simultáneas (10 a la vez sobre 3 cupos: pasan 3) |
| Índice único parcial `(license_id, target_type, coalesce(target_user_id, lower(target_name))) WHERE released_at IS NULL` | `license_assignments` | RN-4.5: sin asignación vigente duplicada; compara el id del usuario, no su nombre |
| `CHECK ((target_type = 'usuario') = (target_user_id IS NOT NULL))` · `CHECK (released_at IS NULL OR (released_by IS NOT NULL AND release_reason IS NOT NULL))` | `license_assignments` | Destinatario coherente; liberar exige quién y por qué |
| `CHECK (modality <> 'suscripcion' OR expires_on IS NOT NULL)` · `CHECK (expires_on >= starts_on)` · `CHECK (alert_days BETWEEN 0 AND 365)` | `purchased_licenses` | RN-4.6 |
| `CHECK (url IS NOT NULL OR storage_key IS NOT NULL)` · `CHECK ((storage_key IS NULL) = (file_name IS NULL))` | `license_evidences` | RN-4.10: enlace o archivo, nunca ninguno |
| Índice único parcial `(kind, entity_type, entity_id) WHERE status = 'pendiente'` con `ON CONFLICT DO NOTHING` | `compliance_alerts` | RN-4.12: sin alertas pendientes duplicadas |
| `CHECK ((status = 'atendida') = (attended_at IS NOT NULL))` | `compliance_alerts` | Estado coherente con su fecha |
| Trigger `licensing_append_only` (UPDATE o DELETE dan error) | `component_reviews`, `license_evidences`, `compliance_alert_events` | RN-4.11: trazabilidad que no se puede reescribir |
| Claves foráneas a `users`, `software_projects`, `license_types`, `purchased_licenses`, `compliance_alert_rules` | todas | Integridad referencial: sin huérfanos |

## Decisiones (Épica 4)
- **El contador `assigned` vive en la licencia**, además de las filas de asignación, para que el control de cupo sea una sola sentencia atómica. La pantalla de conciliación verifica que coincida con las asignaciones vigentes.
- **Liberar no borra:** la asignación se cierra con fecha, responsable y motivo. Reasignar es liberar y asignar.
- **`declared_license` se guarda aparte de `license_id`:** se conserva lo que dijo el proveedor aunque una persona decida otra cosa.
- **Las alertas apuntan a su entidad con `entity_type` + `entity_id`** (licencia o componente) en lugar de dos claves foráneas, para que agregar otro tipo de alerta no cambie el esquema.
